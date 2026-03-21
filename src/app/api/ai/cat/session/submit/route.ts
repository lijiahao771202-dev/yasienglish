import { NextResponse } from "next/server";
import {
    computeCatGrowth,
    levelFromScore,
    normalizeBand,
    recommendBadges,
} from "@/lib/cat-growth";
import { runCatRaschSession, type CatRaschResponse } from "@/lib/cat-rasch";
import { getCatRankTier, getCatSessionPolicy } from "@/lib/cat-score";
import { rewardReadingCoins } from "@/lib/reading-economy-server";
import { createServerClient, getServerUserSafely } from "@/lib/supabase/server";

interface SubmitCatPayload {
    sessionId?: string;
    quizCorrect?: number;
    quizTotal?: number;
    readingMs?: number;
    qualityTier?: "ok" | "low_confidence";
    responses?: Array<{
        itemId?: string | number;
        order?: number;
        answer?: string | string[];
        correct?: boolean;
        latencyMs?: number;
        itemDifficulty?: number;
        itemType?: string;
    }>;
}

function isMissingRpcFunction(error: { message?: string } | null, functionName: string) {
    const message = String(error?.message || "");
    if (!message) return false;
    return message.includes(`public.${functionName}`) && message.toLowerCase().includes("schema cache");
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function expectedReadingMsByDifficulty(difficulty?: string) {
    if (difficulty === "cet4") return 6 * 60 * 1000;
    if (difficulty === "cet6") return 8 * 60 * 1000;
    return 10 * 60 * 1000;
}

function parseRaschResponses(raw: SubmitCatPayload["responses"]) {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((item, index): CatRaschResponse | null => {
            if (!item || typeof item !== "object") return null;
            const hasCorrect = typeof item.correct === "boolean";
            if (!hasCorrect) return null;
            const itemDifficultyRaw = Number(item.itemDifficulty);
            const itemDifficulty = Number.isFinite(itemDifficultyRaw) ? itemDifficultyRaw : 0;
            const latencyRaw = Number(item.latencyMs);
            const latencyMs = Number.isFinite(latencyRaw) ? latencyRaw : 10_000;
            const orderRaw = Number(item.order);
            const order = Number.isFinite(orderRaw) ? orderRaw : index + 1;
            return {
                itemId: String(item.itemId ?? `item-${index + 1}`),
                order,
                correct: Boolean(item.correct),
                latencyMs,
                itemDifficulty,
                itemType: typeof item.itemType === "string" ? item.itemType : undefined,
                answer: Array.isArray(item.answer)
                    ? item.answer.filter((token): token is string => typeof token === "string")
                    : typeof item.answer === "string"
                        ? item.answer
                        : undefined,
            };
        })
        .filter((item): item is CatRaschResponse => item !== null);
}

export async function POST(request: Request) {
    const { user, error } = await getServerUserSafely();
    if (error || !user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as SubmitCatPayload;
    const sessionId = body.sessionId?.trim();
    if (!sessionId) {
        return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const supabase = await createServerClient();
    const { data: session, error: sessionError } = await supabase
        .from("cat_sessions")
        .select("*")
        .eq("id", sessionId)
        .eq("user_id", user.id)
        .maybeSingle();

    if (sessionError) {
        return NextResponse.json({ error: sessionError.message }, { status: 500 });
    }

    if (!session) {
        return NextResponse.json({ error: "CAT session not found" }, { status: 404 });
    }

    const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();

    if (profileError) {
        return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    const scoreBeforeSnapshot = Number(profile.cat_score ?? session.score_before ?? 1000);
    const sessionPolicy = getCatSessionPolicy(scoreBeforeSnapshot);
    const seBeforeSnapshot = clamp(Number((profile as Record<string, unknown>).cat_se ?? 1.15), 0.22, 2.4);
    const rankBefore = getCatRankTier(scoreBeforeSnapshot);

    if (session.status === "completed") {
        const settledScore = Number(session.score_after ?? profile.cat_score ?? scoreBeforeSnapshot);
        const settledDelta = Number(session.delta ?? 0);
        const rankAfterCompleted = getCatRankTier(settledScore);
        const completedSe =
            Number((session as Record<string, unknown>).se_after ?? (profile as Record<string, unknown>).cat_se ?? seBeforeSnapshot);
        return NextResponse.json({
            alreadyCompleted: true,
            cat: {
                score: profile.cat_score ?? settledScore,
                level: profile.cat_level ?? levelFromScore(profile.cat_score ?? settledScore),
                theta: profile.cat_theta ?? 0,
                se: Number.isFinite(completedSe) ? completedSe : null,
                points: profile.cat_points ?? 0,
                currentBand: profile.cat_current_band ?? 3,
            },
            session: {
                id: session.id,
                delta: session.delta ?? 0,
                pointsDelta: session.points_delta ?? 0,
                nextBand: session.next_band ?? profile.cat_current_band ?? 3,
                scoreAfter: session.score_after ?? profile.cat_score ?? 1000,
                levelAfter: session.level_after ?? profile.cat_level ?? 1,
                thetaAfter: session.theta_after ?? profile.cat_theta ?? 0,
                seAfter: completedSe,
                stopReason: (session as Record<string, unknown>).stop_reason ?? null,
                itemCount: (session as Record<string, unknown>).item_count ?? null,
                policyUsed: {
                    minItems: sessionPolicy.minItems,
                    maxItems: sessionPolicy.maxItems,
                    targetSe: sessionPolicy.targetSe,
                },
            },
            animationPayload: {
                scoreBefore: Number(session.score_before ?? scoreBeforeSnapshot),
                scoreAfter: settledScore,
                delta: settledDelta,
                rankBefore: getCatRankTier(Number(session.score_before ?? scoreBeforeSnapshot)),
                rankAfter: rankAfterCompleted,
                isRankUp: rankAfterCompleted.index > getCatRankTier(Number(session.score_before ?? scoreBeforeSnapshot)).index,
                isRankDown: rankAfterCompleted.index < getCatRankTier(Number(session.score_before ?? scoreBeforeSnapshot)).index,
            },
        });
    }

    const normalizedResponses = parseRaschResponses(body.responses);
    const useRaschMode = normalizedResponses.length > 0;
    const qualityTier = body.qualityTier === "low_confidence" ? "low_confidence" : "ok";

    const expectedMs = expectedReadingMsByDifficulty(session.difficulty);
    const responseLatencySum = normalizedResponses.reduce((sum, item) => sum + Math.max(0, item.latencyMs), 0);
    const rawReadingMs = Math.round(Number(body.readingMs ?? (responseLatencySum || expectedMs)));
    const readingMs = Math.max(90_000, rawReadingMs);

    const speedRatio = expectedMs / Math.max(readingMs, expectedMs * 0.48);
    const speedScore = clamp(speedRatio, 0.15, 1);

    const { data: recentSessions } = await supabase
        .from("cat_sessions")
        .select("accuracy")
        .eq("user_id", user.id)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(4);

    const recentAccuracies = (recentSessions ?? [])
        .map((item) => Number(item.accuracy))
        .filter((value) => Number.isFinite(value));

    let stabilityScore = 0.72;
    if (recentAccuracies.length >= 2) {
        const mean = recentAccuracies.reduce((sum, item) => sum + item, 0) / recentAccuracies.length;
        const variance = recentAccuracies.reduce((sum, item) => sum + (item - mean) ** 2, 0) / recentAccuracies.length;
        const std = Math.sqrt(variance);
        stabilityScore = clamp(1 - std / 0.34, 0.25, 1);
    }

    const raschSession = useRaschMode
        ? runCatRaschSession({
            scoreBefore: scoreBeforeSnapshot,
            thetaBefore: Number(profile.cat_theta ?? 0),
            seBefore: seBeforeSnapshot,
            responses: normalizedResponses,
            minItems: sessionPolicy.minItems,
            maxItems: sessionPolicy.maxItems,
            targetSe: sessionPolicy.targetSe,
            qualityTier,
            growthPace: "balanced",
        })
        : null;

    const quizCorrect = useRaschMode
        ? raschSession?.traces.filter((item) => item.correct).length ?? 0
        : Math.max(0, Math.round(Number(body.quizCorrect ?? 0)));
    const quizTotal = useRaschMode
        ? raschSession?.usedItemCount ?? 0
        : Math.max(1, Math.round(Number(body.quizTotal ?? 5)));
    const accuracy = useRaschMode
        ? raschSession?.accuracy ?? 0
        : clamp(quizCorrect / Math.max(1, quizTotal), 0, 1);

    const growth = useRaschMode
        ? {
            performance: clamp(accuracy * 0.72 + speedScore * 0.14 + stabilityScore * 0.14, 0, 1),
            delta: raschSession?.delta ?? 0,
            scoreAfter: raschSession?.scoreAfter ?? scoreBeforeSnapshot,
            levelAfter: levelFromScore(raschSession?.scoreAfter ?? scoreBeforeSnapshot),
            thetaAfter: raschSession?.thetaAfter ?? Number(profile.cat_theta ?? 0),
            nextBand: normalizeBand(Math.floor((raschSession?.scoreAfter ?? scoreBeforeSnapshot) / 400) + 1),
            pointsDelta: raschSession?.pointsDelta ?? 4,
        }
        : computeCatGrowth({
            score: scoreBeforeSnapshot,
            level: Number(profile.cat_level ?? 1),
            theta: Number(profile.cat_theta ?? 0),
            currentBand: normalizeBand(Number(profile.cat_current_band ?? session.band ?? 3)),
            accuracy,
            speedScore,
            stabilityScore,
        });

    const badges = recommendBadges({
        levelBefore: Number(profile.cat_level ?? 1),
        levelAfter: growth.levelAfter,
        accuracy,
        delta: growth.delta,
    });

    const { data: submitData, error: submitError } = await supabase.rpc("submit_cat_session", {
        p_session_id: session.id,
        p_accuracy: accuracy,
        p_speed_score: speedScore,
        p_stability_score: stabilityScore,
        p_performance: growth.performance,
        p_delta: growth.delta,
        p_points_delta: growth.pointsDelta,
        p_next_band: growth.nextBand,
        p_quiz_correct: quizCorrect,
        p_quiz_total: quizTotal,
        p_reading_ms: readingMs,
        p_score_after: growth.scoreAfter,
        p_level_after: growth.levelAfter,
        p_theta_after: growth.thetaAfter,
        p_badges: badges,
    });

    let submitRow: {
        session_id?: string;
        cat_score?: number;
        cat_level?: number;
        cat_theta?: number;
        cat_se?: number;
        cat_points?: number;
        cat_current_band?: number;
        delta?: number;
        points_delta?: number;
        next_band?: number;
        awarded_badges?: string[];
    } = {};

    if (submitError) {
        if (!isMissingRpcFunction(submitError, "submit_cat_session")) {
            return NextResponse.json({ error: submitError.message }, { status: 500 });
        }

        const nowIso = new Date().toISOString();
        const nextCatScore = growth.scoreAfter;
        const nextCatLevel = growth.levelAfter;
        const nextCatTheta = growth.thetaAfter;
        const nextCatSe = useRaschMode ? Number(raschSession?.seAfter ?? seBeforeSnapshot) : seBeforeSnapshot;
        const nextCatPoints = Math.max(0, Number(profile.cat_points ?? 0) + growth.pointsDelta);
        const nextCatBand = growth.nextBand;

        const { data: updatedProfile, error: updateProfileError } = await supabase
            .from("profiles")
            .update({
                cat_score: nextCatScore,
                cat_level: nextCatLevel,
                cat_theta: nextCatTheta,
                cat_points: nextCatPoints,
                cat_current_band: nextCatBand,
                cat_updated_at: nowIso,
            })
            .eq("user_id", user.id)
            .select("*")
            .single();

        if (updateProfileError) {
            return NextResponse.json({ error: updateProfileError.message }, { status: 500 });
        }

        const { data: updatedSession, error: updateSessionError } = await supabase
            .from("cat_sessions")
            .update({
                accuracy,
                speed_score: speedScore,
                stability_score: stabilityScore,
                performance: growth.performance,
                delta: growth.delta,
                points_delta: growth.pointsDelta,
                score_after: nextCatScore,
                level_after: nextCatLevel,
                theta_after: nextCatTheta,
                next_band: nextCatBand,
                quiz_correct: quizCorrect,
                quiz_total: quizTotal,
                reading_ms: readingMs,
                status: "completed",
                completed_at: nowIso,
                updated_at: nowIso,
            })
            .eq("id", session.id)
            .eq("user_id", user.id)
            .select("id, delta, points_delta, next_band")
            .single();

        if (updateSessionError) {
            return NextResponse.json({ error: updateSessionError.message }, { status: 500 });
        }

        if (badges.length > 0) {
            const badgeRows = badges.map((badgeKey) => ({
                user_id: user.id,
                badge_key: badgeKey,
                source: "cat_session",
                meta: { session_id: session.id },
            }));
            const { error: badgeError } = await supabase
                .from("user_cat_badges")
                .upsert(badgeRows, { onConflict: "user_id,badge_key", ignoreDuplicates: true });
            if (badgeError) {
                return NextResponse.json({ error: badgeError.message }, { status: 500 });
            }
        }

        submitRow = {
            session_id: updatedSession.id ?? session.id,
            cat_score: updatedProfile.cat_score ?? nextCatScore,
            cat_level: updatedProfile.cat_level ?? nextCatLevel,
            cat_theta: updatedProfile.cat_theta ?? nextCatTheta,
            cat_se: Number((updatedProfile as Record<string, unknown>).cat_se ?? nextCatSe),
            cat_points: updatedProfile.cat_points ?? nextCatPoints,
            cat_current_band: updatedProfile.cat_current_band ?? nextCatBand,
            delta: updatedSession.delta ?? growth.delta,
            points_delta: updatedSession.points_delta ?? growth.pointsDelta,
            next_band: updatedSession.next_band ?? nextCatBand,
            awarded_badges: badges,
        };
    } else {
        const rpcRow = Array.isArray(submitData) ? submitData[0] : submitData;
        submitRow = rpcRow ?? {};
    }

    const nowIso = new Date().toISOString();
    if (useRaschMode && raschSession) {
        try {
            await supabase
                .from("profiles")
                .update({
                    cat_se: raschSession.seAfter,
                    cat_updated_at: nowIso,
                    updated_at: nowIso,
                })
                .eq("user_id", user.id);
        } catch {
            // ignore if cat_se column is not available yet
        }

        try {
            await supabase
                .from("cat_sessions")
                .update({
                    se_before: raschSession.seBefore,
                    se_after: raschSession.seAfter,
                    stop_reason: raschSession.stopReason,
                    item_count: raschSession.usedItemCount,
                    quality_tier: qualityTier,
                    updated_at: nowIso,
                })
                .eq("id", session.id)
                .eq("user_id", user.id);
        } catch {
            // ignore if extended columns are not available yet
        }

        try {
            const itemRows = raschSession.traces.map((trace) => ({
                session_id: session.id,
                user_id: user.id,
                item_id: trace.itemId,
                item_order: trace.order,
                item_type: trace.itemType ?? null,
                item_difficulty: trace.itemDifficulty,
                user_answer: trace.answer ?? null,
                is_correct: trace.correct,
                latency_ms: trace.latencyMs,
                info_gain: trace.infoGain,
                theta_before: trace.thetaBefore,
                theta_after: trace.thetaAfter,
            }));
            if (itemRows.length > 0) {
                await supabase.from("cat_session_items").insert(itemRows);
            }
        } catch {
            // ignore if cat_session_items table is not available yet
        }
    }

    const quizReward = 6 + (accuracy >= 0.8 ? 2 : 0) + (growth.delta > 0 ? 1 : 0);
    let readingReward: { balance: number; delta: number; applied: boolean } = {
        balance: 0,
        delta: 0,
        applied: false,
    };
    try {
        const rewarded = await rewardReadingCoins({
            action: "quiz_complete",
            dedupeKey: `quiz_complete:cat:${session.id}`,
            delta: quizReward,
            meta: {
                sessionId: session.id,
                accuracy,
                quizCorrect,
                quizTotal,
                from: "cat",
            },
        });
        readingReward = {
            balance: rewarded.balance,
            delta: rewarded.delta,
            applied: rewarded.applied,
        };
    } catch {
        readingReward = {
            balance: Number(profile.reading_coins ?? 0),
            delta: 0,
            applied: false,
        };
    }

    const finalScore = Number(submitRow?.cat_score ?? growth.scoreAfter);
    const finalSe = useRaschMode
        ? Number(submitRow?.cat_se ?? raschSession?.seAfter ?? seBeforeSnapshot)
        : Number((profile as Record<string, unknown>).cat_se ?? seBeforeSnapshot);
    const finalRankAfter = getCatRankTier(finalScore);
    const finalDelta = Number(submitRow?.delta ?? growth.delta);

    return NextResponse.json({
        cat: {
            score: finalScore,
            level: submitRow?.cat_level ?? growth.levelAfter,
            theta: submitRow?.cat_theta ?? growth.thetaAfter,
            se: finalSe,
            points: submitRow?.cat_points ?? Number(profile.cat_points ?? 0) + growth.pointsDelta,
            currentBand: submitRow?.cat_current_band ?? growth.nextBand,
            updatedAt: new Date().toISOString(),
        },
        session: {
            id: submitRow?.session_id ?? session.id,
            mode: useRaschMode ? "rasch" : "legacy",
            delta: submitRow?.delta ?? growth.delta,
            pointsDelta: submitRow?.points_delta ?? growth.pointsDelta,
            nextBand: submitRow?.next_band ?? growth.nextBand,
            performance: growth.performance,
            accuracy,
            speedScore,
            stabilityScore,
            readingMs,
            quizCorrect,
            quizTotal,
            seBefore: useRaschMode ? raschSession?.seBefore ?? null : null,
            seAfter: useRaschMode ? raschSession?.seAfter ?? null : null,
            targetSe: useRaschMode ? raschSession?.targetSe ?? null : null,
            stopReason: useRaschMode ? raschSession?.stopReason ?? null : null,
            itemCount: useRaschMode ? raschSession?.usedItemCount ?? quizTotal : quizTotal,
            policyUsed: useRaschMode
                ? {
                    minItems: sessionPolicy.minItems,
                    maxItems: sessionPolicy.maxItems,
                    targetSe: sessionPolicy.targetSe,
                }
                : null,
            qualityTier: useRaschMode ? qualityTier : null,
            challengeRatio: useRaschMode ? raschSession?.challengeRatio ?? null : null,
            awardedBadges: submitRow?.awarded_badges ?? badges,
        },
        readingCoins: {
            balance: readingReward.balance,
            delta: readingReward.delta,
            applied: readingReward.applied,
        },
        animationPayload: {
            scoreBefore: scoreBeforeSnapshot,
            scoreAfter: finalScore,
            delta: finalDelta,
            rankBefore,
            rankAfter: finalRankAfter,
            isRankUp: finalRankAfter.index > rankBefore.index,
            isRankDown: finalRankAfter.index < rankBefore.index,
        },
    });
}
