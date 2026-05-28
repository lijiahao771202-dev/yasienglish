export function extractJsonObjectText(content: string) {
    const trimmed = content.trim();
    if (!trimmed) return "{}";

    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fencedMatch?.[1]) {
        return fencedMatch[1].trim();
    }

    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
        return trimmed.slice(start, end + 1);
    }

    return trimmed;
}

export function parseJsonObjectFromAi(content: string): Record<string, unknown> | null {
    const candidates = [
        content.trim(),
        extractJsonObjectText(content),
    ].filter(Boolean);

    for (const candidate of Array.from(new Set(candidates))) {
        try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                return parsed as Record<string, unknown>;
            }
        } catch {
            // Try the next candidate.
        }
    }

    return null;
}
