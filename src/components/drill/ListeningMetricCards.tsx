"use client";

interface ListeningMetricCardsFeedback {
    pronunciation_score?: number;
    fluency_score?: number;
    utterance_scores?: {
        accuracy?: number;
        completeness?: number;
        fluency?: number;
        total?: number;
        content_reproduction?: number;
        rhythm_fluency?: number;
        pronunciation_clarity?: number;
    };
}

export interface ListeningMetricCardsProps {
    feedback: ListeningMetricCardsFeedback;
}

export function ListeningMetricCards({ feedback }: ListeningMetricCardsProps) {
    return (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[1.4rem] border border-emerald-100 bg-emerald-50/70 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">总分</p>
                <p className="mt-2 text-2xl font-semibold text-emerald-900">{feedback.utterance_scores?.total?.toFixed?.(1) ?? feedback.pronunciation_score?.toFixed?.(1) ?? "--"}</p>
            </div>
            <div className="rounded-[1.4rem] border border-sky-100 bg-sky-50/70 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-700">内容复现</p>
                <p className="mt-2 text-2xl font-semibold text-sky-900">{feedback.utterance_scores?.content_reproduction?.toFixed?.(1) ?? feedback.utterance_scores?.completeness?.toFixed?.(1) ?? "--"}</p>
            </div>
            <div className="rounded-[1.4rem] border border-amber-100 bg-amber-50/70 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700">语流节奏</p>
                <p className="mt-2 text-2xl font-semibold text-amber-900">{feedback.utterance_scores?.rhythm_fluency?.toFixed?.(1) ?? feedback.utterance_scores?.fluency?.toFixed?.(1) ?? feedback.fluency_score?.toFixed?.(1) ?? "--"}</p>
            </div>
            <div className="rounded-[1.4rem] border border-violet-100 bg-violet-50/70 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-700">发音清晰</p>
                <p className="mt-2 text-2xl font-semibold text-violet-900">{feedback.utterance_scores?.pronunciation_clarity?.toFixed?.(1) ?? feedback.utterance_scores?.accuracy?.toFixed?.(1) ?? feedback.pronunciation_score?.toFixed?.(1) ?? "--"}</p>
            </div>
        </div>
    );
}
