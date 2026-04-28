import { describe, expect, it } from "vitest";

import type { GuidedClozeState, GuidedScript, GuidedSessionState } from "@/lib/guidedLearning";

import { resolveGuidedHintRequestContext } from "./guided-learning-session";

function createGuidedScript(): GuidedScript {
    return {
        lesson_intro: "intro",
        sentence_template: "{{slot_0}} {{slot_1}} {{slot_2}} {{slot_3}}",
        slots: [
            {
                id: "slot-0",
                slot_index: 0,
                slot_kind: "word",
                answer_text: "My",
                display_placeholder: "__",
                hint_ladder: { level_0: "my", level_1: "my", level_2: "my" },
                teacher_goal_cn: "goal",
                teacher_prompt_cn: "prompt",
                micro_rule_cn: "rule",
                wrong_feedback_cn: [],
                stronger_hint_cn: "hint",
                teacher_demo_en: "My",
                reveal_mode: "manual_demo_after_3",
            },
            {
                id: "slot-1",
                slot_index: 1,
                slot_kind: "word",
                answer_text: "friend",
                display_placeholder: "______",
                hint_ladder: { level_0: "friend", level_1: "friend", level_2: "friend" },
                teacher_goal_cn: "goal",
                teacher_prompt_cn: "prompt",
                micro_rule_cn: "rule",
                wrong_feedback_cn: [],
                stronger_hint_cn: "hint",
                teacher_demo_en: "friend",
                reveal_mode: "manual_demo_after_3",
            },
            {
                id: "slot-2",
                slot_index: 2,
                slot_kind: "word",
                answer_text: "was",
                display_placeholder: "___",
                hint_ladder: { level_0: "was", level_1: "was", level_2: "was" },
                teacher_goal_cn: "goal",
                teacher_prompt_cn: "prompt",
                micro_rule_cn: "rule",
                wrong_feedback_cn: [],
                stronger_hint_cn: "hint",
                teacher_demo_en: "was",
                reveal_mode: "manual_demo_after_3",
            },
            {
                id: "slot-3",
                slot_index: 3,
                slot_kind: "word",
                answer_text: "late",
                display_placeholder: "____",
                hint_ladder: { level_0: "late", level_1: "late", level_2: "late" },
                teacher_goal_cn: "goal",
                teacher_prompt_cn: "prompt",
                micro_rule_cn: "rule",
                wrong_feedback_cn: [],
                stronger_hint_cn: "hint",
                teacher_demo_en: "late",
                reveal_mode: "manual_demo_after_3",
            },
        ],
        summary: {
            final_sentence: "My friend was late",
            chinese_meaning: "我的朋友迟到了",
            structure_hint: "hint",
            chinglish_alerts: [],
            memory_anchor: "anchor",
        },
    };
}

function createTeacherSession(overrides?: Partial<GuidedSessionState>): GuidedSessionState {
    return {
        status: "active",
        currentStepIndex: 2,
        currentAttemptCount: 1,
        guidedChoicesVisible: false,
        revealReady: false,
        filledFragments: {
            "slot-0": "My",
            "slot-1": "friend",
            "slot-3": "late",
        },
        lastFeedback: null,
        ...overrides,
    };
}

describe("guided-learning-session", () => {
    it("resolves the current teacher-guided slot with nearest left and right context", () => {
        const session = createTeacherSession();
        const result = resolveGuidedHintRequestContext({
            guidedChoicesVisible: false,
            guidedClozeState: null,
            guidedCurrentAttemptCount: 1,
            guidedCurrentStepIndex: 2,
            guidedFilledFragments: session.filledFragments,
            guidedInnerMode: "teacher_guided",
            guidedRevealReady: false,
            guidedScript: createGuidedScript(),
            guidedSession: session,
        });

        expect(result?.slot.id).toBe("slot-2");
        expect(result?.leftContext).toBe("friend");
        expect(result?.rightContext).toBe("late");
        expect(result?.attempt).toBe(1);
    });

    it("promotes the teacher-guided attempt to rescue mode when choices are revealed", () => {
        const session = createTeacherSession();
        const result = resolveGuidedHintRequestContext({
            guidedChoicesVisible: true,
            guidedClozeState: null,
            guidedCurrentAttemptCount: 1,
            guidedCurrentStepIndex: 2,
            guidedFilledFragments: session.filledFragments,
            guidedInnerMode: "teacher_guided",
            guidedRevealReady: true,
            guidedScript: createGuidedScript(),
            guidedSession: session,
        });

        expect(result?.attempt).toBe(3);
    });

    it("uses the active cloze blank and cloze progress when resolving hint context", () => {
        const guidedClozeState: GuidedClozeState = {
            currentBlankIndex: 1,
            currentAttemptCount: 2,
            blankSlotIds: ["slot-1", "slot-2"],
            revealReady: false,
            filledFragments: {
                "slot-0": "My",
                "slot-3": "late",
            },
            lastFeedback: null,
            refreshToken: 0,
        };

        const result = resolveGuidedHintRequestContext({
            guidedChoicesVisible: false,
            guidedClozeState,
            guidedCurrentAttemptCount: 0,
            guidedCurrentStepIndex: 0,
            guidedFilledFragments: {},
            guidedInnerMode: "gestalt_cloze",
            guidedRevealReady: false,
            guidedScript: createGuidedScript(),
            guidedSession: createTeacherSession(),
        });

        expect(result?.slot.id).toBe("slot-2");
        expect(result?.leftContext).toBe("My");
        expect(result?.rightContext).toBe("late");
        expect(result?.attempt).toBe(2);
    });
});
