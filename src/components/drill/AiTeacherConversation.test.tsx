import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AiTeacherConversation } from "./AiTeacherConversation";

describe("AiTeacherConversation", () => {
    it("renders question-first qa blocks without tutor cards", () => {
        const html = renderToStaticMarkup(
            <AiTeacherConversation
                turns={[
                    {
                        question: "备用钥匙什么意思？",
                        question_type: "follow_up",
                        coach_markdown: "1. **spare key** 就是备用钥匙。\n2. 先把这个词块记住，再放回句子里。",
                        response_intent: "word_meaning",
                        answer_revealed: false,
                        teaching_point: "词汇搭配与自然表达",
                        error_tags: [],
                        quality_flags: [],
                    },
                ]}
                onPlayCardAudio={vi.fn()}
            />,
        );

        expect(html).toContain("你问");
        expect(html).toContain("老师这样拆给你");
        expect(html).toContain("spare key");
        expect(html).not.toContain("词汇卡");
        expect(html).not.toContain("例句卡");
        expect(html).not.toContain("对比卡");
    });

    it("renders revealed full answer block when unlocked", () => {
        const html = renderToStaticMarkup(
            <AiTeacherConversation
                turns={[
                    {
                        question: "我想看参考表达",
                        question_type: "unlock_answer",
                        coach_markdown: "**这里先这样说：** `When I won the lottery, a romantic spark ignited between us.`",
                        response_intent: "unlock_answer",
                        answer_revealed: true,
                        full_answer: "When I won the lottery, a romantic spark ignited between us.",
                        answer_reason_cn: "这样更自然。",
                        teaching_point: "语序与自然表达",
                        error_tags: [],
                        quality_flags: [],
                    },
                ]}
                onPlayCardAudio={vi.fn()}
            />,
        );

        expect(html).toContain("参考表达");
        expect(html).toContain("When I won the lottery");
    });

    it("renders pending question and fallback answer when there is no thread yet", () => {
        const html = renderToStaticMarkup(
            <AiTeacherConversation
                turns={[]}
                pendingQuestion="这个搭配自然吗？"
                pendingAnswer="**先别急着逐词翻。**"
                fallbackAnswer={null}
                onPlayCardAudio={vi.fn()}
            />,
        );

        expect(html).toContain("你正在问");
        expect(html).toContain("这个搭配自然吗？");
        expect(html).toContain("先别急着逐词翻");
    });
});
