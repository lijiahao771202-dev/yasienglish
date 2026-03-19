import { NextResponse } from "next/server";
import { deepseek } from "@/lib/deepseek";

type Difficulty = "cet4" | "cet6" | "ielts";

interface QuizConfig {
    label: string;
    instruction: string;
}

const QUIZ_CONFIGS: Record<Difficulty, QuizConfig> = {
    cet4: {
        label: "CET-4",
        instruction: `Generate exactly 5 multiple-choice questions based on the article.
Each question should test reading comprehension at CET-4 level:
- Focus on main idea, specific details, vocabulary in context, and inference.
- 4 options (A/B/C/D) per question.
- Questions should progress from easier to harder.

Return JSON:
{
  "questions": [
    {
      "id": 1,
      "type": "multiple_choice",
      "question": "...",
      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "answer": "A",
      "sourceParagraph": "2",
      "evidence": "Quote or paraphrase the key sentence from paragraph 2.",
      "explanation": {
        "summary": "中文一句话结论（可夹少量英文关键词）",
        "reasoning": "中文解题思路：如何定位和排除干扰项",
        "trap": "中文易错点提示（可选）"
      }
    }
  ]
}`,
    },
    cet6: {
        label: "CET-6",
        instruction: `Generate 5 multiple-choice questions and 2 short-answer questions based on the article.
This is CET-6 level, so questions should be more challenging:
- Multiple-choice: test inference, author's attitude, logical reasoning, and vocabulary.
- Short-answer: require 1-2 sentence responses demonstrating deep comprehension.

Return JSON:
{
  "questions": [
    {
      "id": 1,
      "type": "multiple_choice",
      "question": "...",
      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "answer": "A",
      "sourceParagraph": "3",
      "evidence": "Quote or paraphrase the supporting sentence from paragraph 3.",
      "explanation": {
        "summary": "中文一句话结论（可夹少量英文关键词）",
        "reasoning": "中文解题思路：定位依据 + 逻辑推理",
        "trap": "中文易错点提示（可选）"
      }
    },
    {
      "id": 6,
      "type": "short_answer",
      "question": "...",
      "answer": "Model answer in 1-2 sentences.",
      "sourceParagraph": "4",
      "evidence": "Quote or paraphrase the supporting sentence from paragraph 4.",
      "explanation": {
        "summary": "中文总结该题应答要点",
        "reasoning": "中文说明答案覆盖了哪些关键点",
        "trap": "中文易漏点提示（可选）"
      }
    }
  ]
}`,
    },
    ielts: {
        label: "IELTS Academic",
        instruction: `Generate a mixed set of IELTS-style reading questions based on the article.
Include exactly:
- 3 True/False/Not Given questions
- 2 matching (match headings/information to paragraphs) questions
- 2 fill-in-the-blank (sentence completion) questions

Return JSON:
{
  "questions": [
    {
      "id": 1,
      "type": "true_false_ng",
      "question": "Statement to evaluate...",
      "options": ["True", "False", "Not Given"],
      "answer": "True",
      "sourceParagraph": "1",
      "evidence": "Quote or paraphrase the supporting sentence from paragraph 1.",
      "explanation": {
        "summary": "中文判断结论（True/False/Not Given）",
        "reasoning": "中文说明依据和判断逻辑",
        "trap": "中文提示与原文无关的干扰点（可选）"
      }
    },
    {
      "id": 4,
      "type": "matching",
      "question": "Match the following information to the correct paragraph...",
      "options": ["Paragraph 1", "Paragraph 2", "Paragraph 3", "Paragraph 4"],
      "answer": "Paragraph 2",
      "sourceParagraph": "2",
      "evidence": "Quote or paraphrase the matching clue from paragraph 2.",
      "explanation": {
        "summary": "中文结论：匹配到哪个段落",
        "reasoning": "中文说明匹配关键词和排除过程",
        "trap": "中文提示常见误匹配点（可选）"
      }
    },
    {
      "id": 6,
      "type": "fill_blank",
      "question": "Complete the sentence: The author argues that ____.",
      "answer": "expected fill text",
      "sourceParagraph": "3",
      "evidence": "Quote or paraphrase the sentence from paragraph 3.",
      "explanation": {
        "summary": "中文总结填空核心语义",
        "reasoning": "中文说明如何从原文改写得到答案",
        "trap": "中文提示同义改写陷阱（可选）"
      }
    }
  ]
}`,
    },
};

export async function POST(req: Request) {
    try {
        const { articleContent, difficulty = "ielts", title } = await req.json();

        if (!articleContent) {
            return NextResponse.json(
                { error: "Article content is required" },
                { status: 400 }
            );
        }

        const diff = (difficulty as string).toLowerCase();
        const config =
            QUIZ_CONFIGS[diff as Difficulty] ?? QUIZ_CONFIGS.ielts;

        const prompt = `
You are an expert English exam question writer for ${config.label}.
Based on the following article, generate reading comprehension questions.

ARTICLE TITLE: ${title || "Untitled"}

ARTICLE CONTENT:
${articleContent}

INSTRUCTIONS:
${config.instruction}

IMPORTANT:
- All questions must be directly answerable from the article content.
- Explanations must be Chinese-first (you may keep key terms in English).
- Every question should include sourceParagraph and evidence fields.
- Keep explanation concise and practical for learners.
- Do NOT include questions about information not in the article.
`;

        const completion = await deepseek.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "deepseek-chat",
            response_format: { type: "json_object" },
        });

        const content = completion.choices[0].message.content;
        if (!content) throw new Error("No content received");

        const result = JSON.parse(content);

        return NextResponse.json({
            questions: result.questions || [],
            difficulty: diff,
            articleTitle: title,
        });
    } catch (error) {
        console.error("Quiz Generation API Error:", error);
        return NextResponse.json(
            { error: "Failed to generate quiz" },
            { status: 500 }
        );
    }
}
