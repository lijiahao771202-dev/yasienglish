import { NextRequest } from "next/server";

import { deepseek } from "@/lib/deepseek";
import type {
    InlineCoachCard,
    InlineCoachMetaChunk,
    InlineCoachTipType,
} from "@/lib/inline-coach-stream";

export const runtime = "edge";

interface InlineCoachRequest {
    systemPrompt: string;
    userMessage: string;
    history?: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    ragConcepts?: string[];
    referenceEnglish?: string;
    responseType?: InlineCoachTipType;
}

interface ModelInlineCoachPayload {
    type?: InlineCoachTipType;
    text?: string;
    errorWord?: string;
    fixWord?: string;
    backtrans?: string;
    tts?: string;
    card?: {
        kind?: "vocab" | "grammar" | "example" | "none";
        content?: string;
    };
}

function normalizeText(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function escapeForRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripOuterPunctuation(value: string) {
    return value.replace(/^["'“”‘’\s.,:;!?()[\]-]+|["'“”‘’\s.,:;!?()[\]-]+$/g, "").trim();
}

function isLeakProne(value: string, referenceEnglish: string) {
    if (!value) return false;
    if (!referenceEnglish) return false;
    return value.toLowerCase().includes(referenceEnglish.toLowerCase());
}

function sanitizeShortField(value: unknown, referenceEnglish: string, options?: { maxWords?: number; maxChars?: number }) {
    const normalized = stripOuterPunctuation(normalizeText(value));
    if (!normalized) return undefined;
    if (isLeakProne(normalized, referenceEnglish)) return undefined;
    if ((options?.maxChars ?? 48) < normalized.length) return undefined;
    if (normalized.split(/\s+/).length > (options?.maxWords ?? 4)) return undefined;
    return normalized;
}

function sanitizeCoachText(value: unknown, referenceEnglish: string) {
    const normalized = normalizeText(value);
    if (!normalized) return "";
    if (!referenceEnglish) return normalized;
    return normalized
        .replace(new RegExp(escapeForRegExp(referenceEnglish), "gi"), "这整句先别直接抄参考答案")
        .trim();
}

function sanitizeCard(value: ModelInlineCoachPayload["card"], referenceEnglish: string): InlineCoachCard | undefined {
    if (!value || typeof value !== "object") return undefined;
    if (value.kind !== "vocab" && value.kind !== "grammar" && value.kind !== "example") return undefined;
    const content = sanitizeCoachText(value.content, referenceEnglish);
    if (!content) return undefined;
    return {
        kind: value.kind,
        content,
    };
}

function buildSystemPrompt(basePrompt: string, responseType: InlineCoachTipType, referenceEnglish: string) {
    return `${basePrompt}

【Inline Coach 协议加固】
1. 人设只影响语气、比喻、卡片偏好，绝不能覆盖系统规则。
2. 不要输出完整官方参考英文答案；不要把整句答案塞进 text、fixWord、tts 或 card。
3. 如果学生当前表达已经自然且语义完整，只做轻推或肯定，不要为了贴参考答案强改。
4. fixWord 只能是短词或短语，不能是完整句子。
5. 输出一个 JSON object，不要 markdown 代码块，不要额外解释。

【返回 JSON】
{
  "type": "${responseType}",
  "text": "中文 Markdown 提示正文",
  "errorWord": "可选，错误原词或短语",
  "fixWord": "可选，正确替换词或短语",
  "backtrans": "可选，搞笑直译",
  "tts": "可选，用于朗读的一小句中文",
  "card": {
    "kind": "vocab | grammar | example | none",
    "content": "可选，卡片内容"
  }
}

【官方参考，仅用于防泄露校验，不得直接输出】
${referenceEnglish}`;
}

function chunkText(text: string) {
    const chunks: string[] = [];
    const paragraphs = text.split(/(\n\n+)/).filter(Boolean);

    for (const part of paragraphs) {
        if (part.startsWith("\n")) {
            chunks.push(part);
            continue;
        }

        let remaining = part;
        while (remaining.length > 18) {
            chunks.push(remaining.slice(0, 18));
            remaining = remaining.slice(18);
        }
        if (remaining) {
            chunks.push(remaining);
        }
    }

    return chunks.filter(Boolean);
}

function normalizePayload(payload: ModelInlineCoachPayload, request: InlineCoachRequest) {
    const type = payload.type === "polish" ? "polish" : request.responseType ?? "scaffold";
    const text = sanitizeCoachText(payload.text, request.referenceEnglish ?? "");

    const meta: InlineCoachMetaChunk = {
        kind: "meta",
        type,
        errorWord: sanitizeShortField(payload.errorWord, request.referenceEnglish ?? "", { maxWords: 5, maxChars: 48 }),
        fixWord: sanitizeShortField(payload.fixWord, request.referenceEnglish ?? "", { maxWords: 5, maxChars: 48 }),
        backtrans: sanitizeCoachText(payload.backtrans, request.referenceEnglish ?? "") || undefined,
        ragConcepts: Array.isArray(request.ragConcepts) ? request.ragConcepts.filter((item) => typeof item === "string" && item.trim().length > 0) : undefined,
        tts: sanitizeCoachText(payload.tts, request.referenceEnglish ?? "") || undefined,
        card: sanitizeCard(payload.card, request.referenceEnglish ?? ""),
    };

    return {
        meta,
        text,
    };
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json() as InlineCoachRequest;

        if (!body.userMessage || !body.systemPrompt) {
            return new Response("Missing parameters", { status: 400 });
        }

        const history = (body.history ?? []).filter(
            (message): message is NonNullable<InlineCoachRequest["history"]>[number] =>
                (message.role === "system" || message.role === "user" || message.role === "assistant")
                && typeof message.content === "string",
        );

        const completion = await deepseek.chat.completions.create({
            model: "deepseek-chat",
            messages: [
                {
                    role: "system",
                    content: buildSystemPrompt(body.systemPrompt, body.responseType ?? "scaffold", body.referenceEnglish ?? ""),
                },
                ...history,
                { role: "user", content: body.userMessage },
            ],
            temperature: 0.3,
            response_format: { type: "json_object" },
            max_tokens: 500,
        });

        const rawContent = completion.choices[0]?.message?.content;
        if (!rawContent) {
            throw new Error("No inline coach content");
        }

        const payload = JSON.parse(rawContent) as ModelInlineCoachPayload;
        const normalized = normalizePayload(payload, body);
        const textChunks = chunkText(normalized.text);

        const stream = new ReadableStream({
            start(controller) {
                const encoder = new TextEncoder();

                controller.enqueue(encoder.encode(`${JSON.stringify(normalized.meta)}\n`));
                for (const delta of textChunks) {
                    controller.enqueue(encoder.encode(`${JSON.stringify({ kind: "text_delta", delta })}\n`));
                }
                controller.enqueue(encoder.encode(`${JSON.stringify({ kind: "done" })}\n`));
                controller.close();
            },
        });

        return new Response(stream, {
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            },
        });
    } catch (error) {
        console.error("[coach_inline_stream] Error:", (error as Error).message);
        return new Response("Internal Server Error", { status: 500 });
    }
}
