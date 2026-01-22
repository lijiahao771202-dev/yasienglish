import { NextResponse } from "next/server";

export async function POST(req: Request) {
    try {
        const { word } = await req.json();

        if (!word) {
            return NextResponse.json({ error: "Word is required" }, { status: 400 });
        }

        // Fetch from Youdao Suggest API
        const response = await fetch(`http://dict.youdao.com/suggest?num=1&doctype=json&q=${encodeURIComponent(word)}`);

        if (!response.ok) {
            throw new Error(`Youdao API error: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.result?.code === 200 && data.data?.entries?.length > 0) {
            const entry = data.data.entries[0];
            return NextResponse.json({
                word: entry.entry,
                definition: entry.explain,
                translation: entry.explain.split(' ').pop() || entry.explain // Simple fallback
            });
        }

        return NextResponse.json({ error: "Definition not found" }, { status: 404 });

    } catch (error) {
        console.error("Dictionary API Error:", error);
        return NextResponse.json({ error: "Failed to fetch definition" }, { status: 500 });
    }
}
