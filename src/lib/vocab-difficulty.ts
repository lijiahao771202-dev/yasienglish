export type ExamTrack = "cet4" | "cet6" | "ielts";

export function mapFsrsDifficultyToExamTrack(difficulty: number | undefined): ExamTrack {
    if (typeof difficulty !== "number" || Number.isNaN(difficulty)) {
        return "ielts";
    }

    if (difficulty <= 3) {
        return "cet4";
    }
    if (difficulty <= 6) {
        return "cet6";
    }
    return "ielts";
}
