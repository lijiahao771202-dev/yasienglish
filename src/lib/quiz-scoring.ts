export type ObjectiveQuestionType =
    | "multiple_choice"
    | "multiple_select"
    | "true_false_ng"
    | "matching"
    | "fill_blank_choice"
    | "fill_blank"
    | "short_answer";

export interface ObjectiveQuizQuestion {
    id: number;
    type: ObjectiveQuestionType;
    answer?: string;
    answers?: string[];
}

export type QuizAnswerValue = string | string[];

function splitMultiAnswerText(raw: string) {
    return raw
        .split(/[，,;/|\s]+/g)
        .map((token) => token.trim())
        .filter(Boolean);
}

export function normalizeObjectiveToken(raw: string): string {
    const normalized = raw.trim().toUpperCase();
    if (!normalized) return "";

    const letterMatch = normalized.match(/^([A-D])(?:[).:\-\s]|$)/);
    if (letterMatch) {
        return letterMatch[1];
    }

    return normalized;
}

export function getQuestionCorrectTokens(question: ObjectiveQuizQuestion): string[] {
    if (question.type === "multiple_select") {
        const fromArray = Array.isArray(question.answers)
            ? question.answers
            : typeof question.answer === "string"
                ? splitMultiAnswerText(question.answer)
                : [];

        return Array.from(new Set(
            fromArray
                .map((token) => normalizeObjectiveToken(String(token)))
                .filter(Boolean),
        ));
    }

    if (typeof question.answer !== "string") return [];
    const token = normalizeObjectiveToken(question.answer);
    return token ? [token] : [];
}

function normalizeUserTokens(answer: QuizAnswerValue): string[] {
    if (Array.isArray(answer)) {
        return Array.from(new Set(
            answer
                .map((token) => normalizeObjectiveToken(String(token)))
                .filter(Boolean),
        ));
    }

    if (typeof answer !== "string") return [];
    const token = normalizeObjectiveToken(answer);
    return token ? [token] : [];
}

export function isObjectiveQuestionAnswered(question: ObjectiveQuizQuestion, answer: QuizAnswerValue | undefined): boolean {
    if (question.type === "multiple_select") {
        return Array.isArray(answer) && answer.length > 0;
    }

    return typeof answer === "string" && answer.trim().length > 0;
}

export function isObjectiveQuestionCorrect(question: ObjectiveQuizQuestion, answer: QuizAnswerValue | undefined): boolean {
    const correctTokens = getQuestionCorrectTokens(question);
    if (correctTokens.length === 0) return false;

    const userTokens = normalizeUserTokens(answer ?? "");
    if (userTokens.length === 0) return false;

    if (question.type === "multiple_select") {
        if (userTokens.length !== correctTokens.length) return false;
        const correctSet = new Set(correctTokens);
        return userTokens.every((token) => correctSet.has(token));
    }

    return userTokens[0] === correctTokens[0];
}

export function scoreObjectiveQuiz(
    questions: ObjectiveQuizQuestion[],
    answers: Record<number, QuizAnswerValue>,
) {
    let correct = 0;
    for (const question of questions) {
        if (isObjectiveQuestionCorrect(question, answers[question.id])) {
            correct += 1;
        }
    }

    return {
        correct,
        total: questions.length,
    };
}
