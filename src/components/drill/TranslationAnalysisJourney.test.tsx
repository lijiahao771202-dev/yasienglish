import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TranslationAnalysisJourney } from "./TranslationAnalysisJourney";

describe("TranslationAnalysisJourney", () => {
    it("renders the step-based flow with a manual grammar trigger by default", () => {
        const html = renderToStaticMarkup(
            <TranslationAnalysisJourney
                analysisLead="这题主要问题在搭配和缺失成分。"
                analysisHighlights={[
                    {
                        kind: "关键改错",
                        before: "depend of",
                        after: "depend on",
                        note: "这里固定搭配要用 on。",
                    },
                ]}
                userTranslation="It depend of your schedule."
                improvedVersionNode={<span>It really depends on your schedule.</span>}
                referenceSentenceNode={<span>&ldquo;It depends on your schedule.&rdquo;</span>}
                isGeneratingGrammar={false}
                grammarError={null}
                grammarButtonLabel="生成语法分析"
                hasGrammarAnalysis={false}
                grammarDisplayMode="core"
                onGenerateGrammar={vi.fn()}
                onGrammarDisplayModeChange={vi.fn()}
                onPlayReferenceAudio={vi.fn()}
                hasFullAnalysis={false}
                isGeneratingFullAnalysis={false}
                fullAnalysisError={null}
                fullAnalysisOpen={false}
                onGenerateFullAnalysis={vi.fn()}
                onToggleFullAnalysis={vi.fn()}
                fullAnalysisContent={<div>完整说明</div>}
            />,
        );

        expect(html).toContain("Step 1");
        expect(html).toContain("先看错在哪");
        expect(html).toContain("Step 2");
        expect(html).toContain("改成什么");
        expect(html).toContain("Step 3");
        expect(html).toContain("参考句");
        expect(html).toContain("生成语法分析");
        expect(html).not.toContain("主干");
        expect(html).toContain("Step 4");
        expect(html).toContain("完整解析");
        expect(html).toContain("生成完整解析");
        expect(html).not.toContain("完整说明");
    });

    it("shows grammar mode controls and full analysis content once generated", () => {
        const html = renderToStaticMarkup(
            <TranslationAnalysisJourney
                analysisLead="这题核心结构已经对了，主要是表达不够自然。"
                analysisHighlights={[]}
                userTranslation="It is okay."
                improvedVersionNode={null}
                referenceSentenceNode={<span>&ldquo;It is perfectly fine.&rdquo;</span>}
                isGeneratingGrammar={false}
                grammarError="语法分析暂时不可用"
                grammarButtonLabel="重新生成语法分析"
                hasGrammarAnalysis
                grammarDisplayMode="full"
                onGenerateGrammar={vi.fn()}
                onGrammarDisplayModeChange={vi.fn()}
                onPlayReferenceAudio={vi.fn()}
                hasFullAnalysis
                isGeneratingFullAnalysis={false}
                fullAnalysisError="完整解析生成失败"
                fullAnalysisOpen
                onGenerateFullAnalysis={vi.fn()}
                onToggleFullAnalysis={vi.fn()}
                fullAnalysisContent={<div>更多说明内容</div>}
            />,
        );

        expect(html).toContain("重新生成语法分析");
        expect(html).toContain("主干");
        expect(html).toContain("完整分析");
        expect(html).toContain("更多说明内容");
        expect(html).toContain("语法分析暂时不可用");
        expect(html).toContain("重新生成完整解析");
        expect(html).toContain("收起详情");
        expect(html).toContain("完整解析生成失败");
        expect(html).not.toContain("Step 2");
    });
});
