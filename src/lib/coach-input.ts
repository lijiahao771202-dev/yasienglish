export function resolveCoachCurrentInput(params: {
    liveInput?: string | null;
    fallbackInput?: string | null;
}) {
    const liveInput = params.liveInput?.trim() ?? "";
    if (liveInput) return liveInput;
    return params.fallbackInput?.trim() ?? "";
}

export function buildCoachDrawerUserMessage(params: {
    question: string;
    currentInput: string;
}) {
    const question = params.question.trim();
    const currentInput = params.currentInput.trim();

    return `【学生自由提问】：${question}\n【当前输入框内容】：${currentInput}\n\n请保持你当前的人设为我解答，直接输出自然语言对话。`;
}
