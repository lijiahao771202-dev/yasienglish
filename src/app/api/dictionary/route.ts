import { NextResponse } from "next/server";

export async function POST(req: Request) {
    try {
        const { word } = await req.json();

        if (!word) {
            return NextResponse.json({ error: "Word is required" }, { status: 400 });
        }

        // Parallel fetch: Youdao (Chinese Def) + FreeDict (Phonetic)
        const [youdaoRes, freeDictRes] = await Promise.all([
            fetch(`http://dict.youdao.com/suggest?num=1&doctype=json&q=${encodeURIComponent(word)}`),
            fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`)
        ]);

        let definition = "";
        let translation = "";
        let phonetic = "";

        // Process Youdao (Chinese)
        if (youdaoRes.ok) {
            const data = await youdaoRes.json();
            if (data.result?.code === 200 && data.data?.entries?.length > 0) {
                const entry = data.data.entries[0];
                definition = entry.explain;
                translation = entry.explain.split(' ').pop() || entry.explain;
            }
        }

        // Process FreeDict (Phonetic)
        if (freeDictRes.ok) {
            const data = await freeDictRes.json();
            if (Array.isArray(data) && data.length > 0) {
                // Find first non-empty phonetic text
                const phoneticObj = data[0].phonetics?.find((p: any) => p.text);
                if (phoneticObj?.text) {
                    phonetic = phoneticObj.text;
                }
                // Fallback: data[0].phonetic
                if (!phonetic && data[0].phonetic) {
                    phonetic = data[0].phonetic;
                }
            }
        }

        if (definition || phonetic) {
            return NextResponse.json({
                word,
                definition: definition || "No definition found",
                translation,
                phonetic
            });
        }

        return NextResponse.json({ error: "Definition not found" }, { status: 404 });

    } catch (error) {
        console.error("Dictionary API Error:", error);
        return NextResponse.json({ error: "Failed to fetch definition" }, { status: 500 });
    }
}
