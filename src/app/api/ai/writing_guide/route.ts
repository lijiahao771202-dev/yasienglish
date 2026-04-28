import { NextRequest, NextResponse } from "next/server";
import { deepseek } from "@/lib/deepseek";
import {
    normalizeWritingGuidePayload,
    type WritingGuideHistoryItem,
    type WritingGuidePayload,
} from "@/lib/writing-guide";

interface WritingGuideRequest {
    chinese: string;
    referenceEnglish: string;
    currentInput: string;
    activeChunk?: { role: string; english: string; chinese?: string };
    activeChunkInput?: string;
    struggleLevel?: number;
    previousHint?: string;
    intent?: "hint" | "coach";
    history?: WritingGuideHistoryItem[];
}

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json()) as WritingGuideRequest;
        const { chinese, referenceEnglish, currentInput, activeChunk, activeChunkInput, struggleLevel = 0, previousHint, intent = "hint", history = [] } = body;

        if (!chinese || !referenceEnglish) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const prompt = `你是一个克制、稳定、评分对齐的英文写作提示教练。
你的首要目标是：帮助学生**继续写下去**，同时让提示逻辑和最终评分保持一致。

【总原则】
1. 优先判断“当前写法是否语义正确、表达自然”。如果答案已经是合法替代表达，即使不贴官方参考，也要接受。
2. 官方参考只是一条参考路径，不是唯一正确答案。遇到合法替代表达时，不能硬拉回参考答案，不能为了贴参考句而改写自然表达。
3. 只有在学生明显卡住、当前表达明显偏弱、或者存在真实语法错误时，才给推进性提示。
4. 半句、未完成片段、连接词后未闭合、主句还没写完时，优先判定为 unfinished，绝不能当成 grammar_error 去硬拦截。

【本题原文】：${chinese}
【官方参考】：${referenceEnglish}

${activeChunk ? `【🔴 极度重要：当前聚焦卡壳的语法块】
- 语法角色：${activeChunk.role}
- 本块的中文翻译目标：${activeChunk.chinese || '略'}
- 本块原本预期的英文：${activeChunk.english}
- 学生**当前在这个特定积木内**打出的内容是："${activeChunkInput || ''}"

**规则：**
由于用户目前的光标**正停留在这一小块上**。你**必须仅仅**针对这一个小块出的问题（或未写完的情况）进行精准点拨。
**绝对不可**向外跨越剧透该碎片以外的后面的任何英文单词！如果它打对了，你可以判断 valid_alternative/near_finish 并放行。如果他本碎片没写完，则属于 unfinished。如果他本碎片有明显语法问题，则 grammar_error 点拨。` : ""}

${previousHint ? `【上一条提示】${previousHint}\n如果当前输入已经采纳了上一条提示，请承认这一点，并在同一条推进线上继续，不要反悔或跳回去纠缠已经解决的点。\n` : ""}
【绝对忽略项】
- 大小写
- 标点和空格
- 仅仅因为不贴官方参考就判错

【双模分离指令】
当前模式为：${intent === "coach" ? "【主动教练模式】（用户按Shift召唤你）" : "【被动智能提示】（用户轻度卡壳）"}
${intent === "coach" 
? `你需要给出更详细的指导。你不仅要指出方向，还可以附带详细的 grammar_explain，解释为什么这么写，讲解背后的语法原理。允许输出 30-50 个字。` 
: `你必须提供**极简无感**的提示。你的 hint **绝对不能超过 10 个字**（例如：“尝试被动语态”、“缺一个冠词”）。**禁止返回任何 grammar_explain**，保持字段为空！不要长篇大论打扰用户！`}

【稳定状态机】
- unfinished: 句子还没写完、只写到半截、连接词后未闭合、主干还在生成中。hasError 必须为 false。
- grammar_error: 存在明确核心语法错误，必须先修。只有这个状态的 hasError 才能为 true。
- lexical_gap: 主干基本对，但明显卡在关键词或升级词。
- phrase_hint: 当前适合给一个短语/搭配提示继续推进。
- near_finish: 基本快完成了，只差一个尾部成分或收尾。
- valid_alternative: 当前写法已经是合法替代表达，语义正确、表达自然，只需继续推进或允许提交。

【判定优先级】
1. unfinished
2. grammar_error
3. valid_alternative / near_finish
4. lexical_gap / phrase_hint

【额外约束】
- 合法替代表达必须返回 valid_alternative 或 near_finish，不能回到“贴官方答案”的思路。
- 如果当前输入已经覆盖了历史里建议的 focus 或 nextAction，请顺势推进，不要重复同一条 hint。
- 语法错误只限于真实核心错误：时态、主谓一致、严重搭配、明显中式语法冲突（如 Although 和 but 同框）。`;

        const historyContext = history.length > 0
            ? `【历史轨迹回放】\n${JSON.stringify(history.slice(-3), null, 2)}\n请判断当前输入是否已经采纳了这些建议；如果采纳了，就继续推进，不要重复。`
            : "";

        const currentInputPrompt = `${historyContext}
【当前进度上下文】
- 当前的挣扎等级：${struggleLevel} (0=刚停顿, 1=卡住一会, 2=卡很久)
- 用户全局输入的完整内容："${currentInput}"

请根据稳定状态机给出${activeChunk ? "针对当前语法块的" : ""}下一步微核提示。`;

        const outputPrompt = `【输出要求，严格按此 JSON 格式返回】：
{
  "state": "unfinished" | "grammar_error" | "lexical_gap" | "phrase_hint" | "near_finish" | "valid_alternative",
  "hasError": boolean,
  "label": "带 Emoji 的简短战术标签",
  "hint": "极其自然具有互动对话感、一针见血的一句话。绝不啰嗦解题过程，你的唯一目的是推着他或者纠正他往下敲！",
  "grammarPoint": "当前这步的核心语法点（比如：非限制性定语从句 / 表语从句 / 主谓一致 / 高级替换）。最长不要超过10个字。没有可留空。",
  "grammarExplain": "用非常简短的一句话解释背后的语法或语意逻辑。没有可留空。",
  "focus": "当前建议聚焦的点，比如 main_clause / viable / tail_clause",
  "nextAction": "下一步动作，比如 continue / add_predicate / add_keyword / remove_but / submit"
}`;

        const messages: any[] = [{ role: "system", content: `${prompt}\n\n${outputPrompt}` }];
        if (history.length > 0) {
            messages.push({ role: "user", content: JSON.stringify(history.slice(-3)) });
        }
        messages.push({
            role: "user",
            content: `${currentInputPrompt}\n当前输入是否已经采纳了历史里的 focus / nextAction？如果已经采纳，请继续推进，不要回滚。`,
        });

        const response = await deepseek.chat.completions.create({
            model: "deepseek-chat",
            messages: messages,
            response_format: { type: "json_object" },
            temperature: 0.3,
            max_tokens: 150,
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
            return NextResponse.json({ error: "Failed to generate guide" }, { status: 500 });
        }

        const parsed = normalizeWritingGuidePayload(JSON.parse(content) as Record<string, unknown>);
        return NextResponse.json(parsed satisfies WritingGuidePayload);
    } catch (error) {
        console.error("Failed writing guide generation:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
