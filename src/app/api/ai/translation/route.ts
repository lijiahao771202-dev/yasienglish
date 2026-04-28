import { NextResponse } from 'next/server';
import { createDeepSeekClientForCurrentUser } from "@/lib/deepseek";

export async function POST(req: Request) {
    try {
        const openai = await createDeepSeekClientForCurrentUser();
        const { action, text, context } = await req.json();

        if (action === 'generate') {
            const completion = await openai.chat.completions.create({
                model: "deepseek-chat",
                messages: [
                    { role: "system", content: "You are a helpful language tutor. Generate a random Chinese sentence for an intermediate student to translate into English. Return ONLY the JSON object: { \"chinese\": \"生成的中文句子\", \"english\": \"The perfect English translation\" }" },
                ],
                response_format: { type: "json_object" }
            });
            const result = JSON.parse(completion.choices[0].message.content || "{}");
            return NextResponse.json(result);
        }

        if (action === 'score') {
            const { reference } = await req.json(); // Front-end must pass the target english string now as 'reference'
            
            const { evaluateTranslationHybrid } = await import('@/lib/translation-scoring');
            const scores = await evaluateTranslationHybrid({
                userSentence: text,
                referenceSentence: reference || ""
            });

            // Local generated feedback based on score
            let feedback = '';
            if (scores.totalScore >= 95) feedback = "完美无瑕！无论是核心短语还是时态处理都非常地道。";
            else if (scores.totalScore >= 80) feedback = "翻译得相当不错！基本盘很稳，语义清晰。";
            else if (scores.totalScore >= 50) {
                feedback = "方向是对的，但是遗漏或替换了一些关键核心词，对比一下原句感受一下不同的表达吧！";
                if (scores.details.missingLemmas.length > 0) {
                    feedback += " (缺失的核心概念: " + scores.details.missingLemmas.join(", ") + ")";
                }
            } else feedback = "貌似有些跑题哦，请看标准答案是怎么转换这句话的。点击【AI答疑】让 DeepSeek 帮你详细分析哪里可以改进吧。";

            return NextResponse.json({
                score: Math.round(scores.totalScore),
                nlpScore: Math.round(scores.nlpRecallScore),
                literalScore: Math.round(scores.literalNgramScore),
                vectorScore: Math.round(scores.vectorScore),
                feedback: feedback,
                revised_text: reference
            });
        }

        if (action === 'chat') {
            const { history, question, context } = await req.json();
            const completion = await openai.chat.completions.create({
                model: "deepseek-chat",
                messages: [
                    { role: "system", content: `You are a helpful language tutor explaining a specific translation. Context Chinese: "${context}". Please answer the student's question specifically about the translation and grammar. Keep it concise.` },
                    ...history, // [{role: "user", content: "..."}]
                    { role: "user", content: question }
                ]
            });
            return NextResponse.json({ answer: completion.choices[0].message.content });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

    } catch (error) {
        console.error('Error in translation API:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
