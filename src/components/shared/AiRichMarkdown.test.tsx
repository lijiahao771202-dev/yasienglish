/* @vitest-environment jsdom */

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AiRichMarkdown } from "./AiRichMarkdown";

vi.mock("./MermaidDiagram", () => ({
    MermaidDiagram: ({ chart }: { chart: string }) => (
        <div data-testid="mermaid-diagram">{chart}</div>
    ),
}));

vi.mock("./MindElixirDiagram", () => ({
    MindElixirDiagram: ({ outline }: { outline: string }) => (
        <div data-testid="mindmap-diagram">{outline}</div>
    ),
}));

const mountedRoots: Root[] = [];

async function renderMarkdown(content: string) {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push(root);

    await act(async () => {
        root.render(<AiRichMarkdown content={content} />);
    });

    return container;
}

afterEach(async () => {
    await act(async () => {
        while (mountedRoots.length > 0) {
            mountedRoots.pop()?.unmount();
        }
    });
    document.body.innerHTML = "";
});

describe("AiRichMarkdown", () => {
    it("renders a valid GFM table instead of raw pipe text", async () => {
        const container = await renderMarkdown([
            "### 图解逻辑",
            "",
            "| 部分 | 英文原文 | 中文含义 |",
            "| --- | --- | --- |",
            "| A | the sleep your body needs | 身体需要的睡眠 |",
            "| B | what it actually gets | 身体实际得到的睡眠 |",
        ].join("\n"));

        const table = container.querySelector("table");
        expect(table).toBeTruthy();
        expect(table?.textContent).toContain("部分");
        expect(table?.textContent).toContain("the sleep your body needs");
        expect(container.textContent).not.toContain("| --- | --- | --- |");
        expect(table?.className).toContain("table-fixed");
        expect(table?.className).toContain("w-full");
        expect(table?.className).not.toContain("min-w-[720px]");
        expect(table?.className).not.toContain("w-max");
        const headerCells = Array.from(container.querySelectorAll("th"));
        expect(headerCells[0]?.className).toContain("whitespace-normal");
        const bodyCells = Array.from(container.querySelectorAll("td"));
        expect(bodyCells[0]?.className).toContain("[overflow-wrap:anywhere]");
        expect(bodyCells[1]?.className).toContain("whitespace-normal");
    });

    it("opens an enlarged lightbox when the rendered table is clicked", async () => {
        const container = await renderMarkdown([
            "| 部分 | 英文原文 | 中文含义 |",
            "| --- | --- | --- |",
            "| A | the sleep your body needs | 身体需要的睡眠 |",
            "| B | what it actually gets | 身体实际得到的睡眠 |",
        ].join("\n"));

        const previewButton = container.querySelector<HTMLButtonElement>('button[aria-label="放大表格"]');
        expect(previewButton).toBeTruthy();

        await act(async () => {
            previewButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(document.body.querySelector('[data-testid="table-lightbox"]')).toBeTruthy();
        expect(document.body.textContent).toContain("放大查看表格");
    });

    it("renders ordered sentence breakdowns as compact plain lists", async () => {
        const container = await renderMarkdown([
            "## 结构拆解",
            "",
            "1. **This structured data**",
            "   - 语法功能：主语",
            "   - 语境意思：这些被整理过的数据",
            "2. **then**",
            "   - 语法功能：副词作状语",
            "   - 语境意思：随后、接着",
        ].join("\n"));

        const orderedList = container.querySelector("ol");
        const firstItem = container.querySelector("ol > li");

        expect(orderedList?.className).toContain("list-decimal");
        expect(orderedList?.className).toContain("pl-6");
        expect(firstItem?.className).toContain("leading-7");
        expect(firstItem?.className).not.toContain("rounded-xl");
        expect(firstItem?.className).not.toContain("border");
        expect(firstItem?.className).not.toContain("bg-stone");
        expect(firstItem?.textContent).toContain("语法功能");
        expect(firstItem?.textContent).toContain("语境意思");
    });

    it("uses color hierarchy for headings, lists, and emphasis without card chrome", async () => {
        const container = await renderMarkdown([
            "## 结构拆解",
            "",
            "1. **This structured data**",
            "   - 语法功能：主语",
            "   - 语境意思：这些被整理过的数据",
            "",
            "`structured` 是过去分词。",
        ].join("\n"));

        const heading = container.querySelector("h2");
        const orderedList = container.querySelector("ol");
        const unorderedList = container.querySelector("ul");
        const strong = container.querySelector("strong");
        const inlineCode = container.querySelector("code");

        expect(heading?.className).toContain("text-indigo-800");
        expect(heading?.className).not.toContain("border-b");
        expect(orderedList?.className).toContain("marker:text-indigo-500");
        expect(unorderedList?.className).toContain("marker:text-stone-400");
        expect(strong?.className).toContain("font-bold");
        expect(strong?.className).toContain("text-stone-950");
        expect(strong?.className).not.toContain("bg-[linear-gradient");
        expect(strong?.className).not.toContain("bg-[#fff1b8]");
        expect(strong?.className).not.toContain("underline");
        expect(strong?.className).not.toContain("shadow-[inset");
        expect(inlineCode?.className).toContain("text-pink-600");
    });

    it("keeps bold and mark as separate visual semantics", async () => {
        const container = await renderMarkdown([
            "**Bold only** is emphasis.",
            "",
            "==Marked point== is the key span.",
            "",
            "`==code stays code==`",
        ].join("\n"));

        const strong = container.querySelector("strong");
        const mark = container.querySelector("mark");
        const code = container.querySelector("code");

        expect(strong?.textContent).toBe("Bold only");
        expect(strong?.className).toContain("font-bold");
        expect(strong?.className).not.toContain("linear-gradient");
        expect(mark?.textContent).toBe("Marked point");
        expect(mark?.className).toContain("linear-gradient");
        expect(mark?.className).toContain("rgba(147,197,253");
        expect(mark?.className).toContain("text-slate-900");
        expect(mark?.className).toContain("shadow-[inset");
        expect(code?.textContent).toBe("==code stays code==");
    });

    it("renders marked numbered titles as bold while keeping content marks", async () => {
        const container = await renderMarkdown([
            "1. <mark>The title chunk</mark>",
            "   - 语境意思：这里是<mark>真正重点</mark>",
        ].join("\n"));

        const firstItem = container.querySelector("ol > li");
        const titleStrong = firstItem?.querySelector("strong");
        const marks = firstItem?.querySelectorAll("mark");

        expect(titleStrong?.textContent).toBe("The title chunk");
        expect(marks).toHaveLength(1);
        expect(marks?.[0]?.textContent).toBe("真正重点");
    });

    it("renders section separators as between-section dividers instead of heading underlines", async () => {
        const container = await renderMarkdown([
            "## 直译",
            "",
            "这是一段直译内容。",
            "",
            "---",
            "",
            "## 中文解释",
            "",
            "这是一段中文解释内容。",
        ].join("\n"));

        const heading = container.querySelector("h2");
        const separator = container.querySelector("hr");

        expect(heading?.className).not.toContain("border-b");
        expect(separator).toBeTruthy();
        expect(separator?.className).toContain("my-6");
        expect(separator?.className).toContain("border-stone-300");
        expect(separator?.className).not.toContain("border-dashed");
    });

    it("automatically separates consecutive level-two answer sections", async () => {
        const container = await renderMarkdown([
            "## 直译",
            "",
            "这句话完美地捕捉了我的困惑。",
            "",
            "## 中文解释",
            "",
            "这句话正好说出了我心里的困惑。",
            "",
            "## 句子主干",
            "",
            "- 主语：This statement",
        ].join("\n"));

        const headings = Array.from(container.querySelectorAll("h2"));
        const separators = Array.from(container.querySelectorAll("hr"));

        expect(headings).toHaveLength(3);
        expect(separators).toHaveLength(2);
        expect(separators[0]?.nextElementSibling?.textContent).toBe("中文解释");
        expect(separators[1]?.nextElementSibling?.textContent).toBe("句子主干");
    });

    it("does not duplicate explicit section separators or read headings inside fences", async () => {
        const container = await renderMarkdown([
            "## 直译",
            "",
            "内容一。",
            "",
            "---",
            "",
            "## 中文解释",
            "",
            "```markdown",
            "## 这只是代码块内容",
            "```",
            "",
            "## 句子主干",
            "",
            "内容三。",
        ].join("\n"));

        const separators = Array.from(container.querySelectorAll("hr"));

        expect(separators).toHaveLength(2);
        expect(container.querySelectorAll("h2")).toHaveLength(3);
        expect(container.querySelector("code")?.textContent).toContain("## 这只是代码块内容");
    });

    it("routes mermaid fences into the diagram renderer", async () => {
        const chart = [
            "```mermaid",
            "flowchart TD",
            "    A[理想睡眠] --> B[实际睡眠]",
            "    B --> C[the gap]",
            "```",
        ].join("\n");

        const container = await renderMarkdown(chart);
        const diagram = container.querySelector('[data-testid="mermaid-diagram"]');

        expect(diagram).toBeTruthy();
        expect(diagram?.textContent).toContain("flowchart TD");
        expect(container.querySelector("code")?.textContent ?? "").not.toContain("flowchart TD");
    });

    it("routes mindmap fences into the mind elixir renderer", async () => {
        const outline = [
            "```mindmap",
            "- 核心逻辑",
            "  - 主干",
            "  - 从句",
            "```",
        ].join("\n");

        const container = await renderMarkdown(outline);
        const diagram = container.querySelector('[data-testid="mindmap-diagram"]');

        expect(diagram).toBeTruthy();
        expect(diagram?.textContent).toContain("- 核心逻辑");
        expect(container.querySelector("code")?.textContent ?? "").not.toContain("- 核心逻辑");
    });
});
