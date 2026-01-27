import { NextResponse } from "next/server";

export async function POST(req: Request) {
    try {
        const { word } = await req.json();

        if (!word) {
            return NextResponse.json({ error: "Word is required" }, { status: 400 });
        }

        // Youdao JSONAPI (Rich Data)
        const youdaoRes = await fetch(`https://dict.youdao.com/jsonapi?q=${encodeURIComponent(word)}`);

        let definition = "";
        let translation = "";
        let phonetic = "";
        let audio = "";

        if (youdaoRes.ok) {
            const data = await youdaoRes.json();

            // 1. Extract Phonetics (US preferred)
            const simple = data.simple?.word?.[0];
            const ec = data.ec?.word?.[0];

            if (simple) {
                phonetic = simple.usphone || simple.ukphone || "";
                // Construct audio URL directly if available (type=2 for US)
                if (simple.usspeech) {
                    audio = `https://dict.youdao.com/dictvoice?audio=${simple.usspeech}`;
                }
            }

            // 2. Extract Definition (EC - Exam Category / Chinese)
            if (ec && ec.trs && ec.trs.length > 0) {
                const firstTr = ec.trs[0]; // First translation group
                // Usually structure: tr[0].tr[0].l.i[0] -> "int. 喂..."
                const defRaw = firstTr.tr?.[0]?.l?.i?.[0];

                if (defRaw) {
                    definition = defRaw;
                    // Clean up part of speech part if needed, or keep it
                    translation = defRaw.split(/；|，/).slice(0, 2).join("；"); // Shorten for UI
                }
            } else if (data.web_trans?.["web-translation"]?.[0]) {
                // Fallback to web translation for names/brands
                translation = data.web_trans["web-translation"][0].value;
                definition = data.web_trans["web-translation"][0].value;
            }
        }

        if (definition || phonetic || translation) {
            return NextResponse.json({
                word,
                definition: definition || translation,
                translation,
                phonetic,
                audio
            });
        }

        return NextResponse.json({ error: "Definition not found" }, { status: 404 });

    } catch (error) {
        console.error("Dictionary API Error:", error);
        return NextResponse.json({ error: "Failed to fetch definition" }, { status: 500 });
    }
}
