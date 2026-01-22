import { NextResponse } from "next/server";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

export async function POST(req: Request) {
    try {
        const { url } = await req.json();

        if (!url) {
            return NextResponse.json({ error: "URL is required" }, { status: 400 });
        }

        // Handle Local Articles
        if (url.startsWith("local://")) {
            const { LOCAL_ARTICLES } = await import("@/data/local-feeds");
            const parts = url.replace("local://", "").split("/");
            if (parts.length === 2) {
                const category = parts[0];
                const index = parseInt(parts[1]);
                const article = LOCAL_ARTICLES[category as keyof typeof LOCAL_ARTICLES]?.[index];

                if (article) {
                    // Split content into paragraphs for blocks
                    const blocks = article.content.split('\n\n').map(p => ({
                        type: 'paragraph',
                        content: p.trim()
                    })).filter(b => b.content);

                    return NextResponse.json({
                        title: article.title,
                        content: `<p>${article.content.replace(/\n\n/g, '</p><p>')}</p>`,
                        textContent: article.content,
                        blocks: blocks,
                        excerpt: article.content.substring(0, 150) + "...",
                        byline: article.source,
                        siteName: "Local Database",
                    });
                }
            }
            return NextResponse.json({ error: "Local article not found" }, { status: 404 });
        }

        // Fetch the HTML content using native fetch (handles redirects better)
        let html = '';
        let finalUrl = url;

        try {
            const response = await fetch(url, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
                },
                redirect: 'follow',
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
            }

            finalUrl = response.url;
            html = await response.text();

        } catch (e: any) {
            console.error("Fetch error:", e);
            throw e;
        }

        console.log("Initial URL:", url);
        console.log("Final URL:", finalUrl);

        // Special handling for TED Talks
        if (finalUrl.includes('ted.com/talks')) {
            console.log("TED URL detected:", finalUrl);
            const tedDoc = new JSDOM(html, { url: finalUrl });

            // Try to extract from __NEXT_DATA__ first (has timed transcript)
            const nextDataScript = tedDoc.window.document.getElementById('__NEXT_DATA__');
            if (nextDataScript) {
                try {
                    const nextData = JSON.parse(nextDataScript.textContent || '{}');
                    const pp = nextData.props?.pageProps;

                    // Extract timed transcript
                    let timedTranscript: { text: string; time: number }[] = [];
                    const paragraphs = pp?.transcriptData?.translation?.paragraphs;
                    if (paragraphs && Array.isArray(paragraphs)) {
                        paragraphs.forEach((p: any) => {
                            if (p.cues && Array.isArray(p.cues)) {
                                p.cues.forEach((cue: any) => {
                                    if (cue.text && typeof cue.time === 'number') {
                                        timedTranscript.push({ text: cue.text, time: cue.time });
                                    }
                                });
                            }
                        });
                    }

                    // Extract video URL
                    let videoUrl: string | null = null;
                    const playerData = pp?.videoData?.playerData;
                    if (playerData?.resources) {
                        // Prefer HLS, fallback to h264
                        if (playerData.resources.hls?.stream) {
                            videoUrl = playerData.resources.hls.stream;
                        } else if (playerData.resources.h264 && playerData.resources.h264[0]?.file) {
                            videoUrl = playerData.resources.h264[0].file;
                        }
                    }

                    // Fallback: extract embedUrl from JSON-LD
                    if (!videoUrl) {
                        const jsonLdScripts = tedDoc.window.document.querySelectorAll('script[type="application/ld+json"]');
                        for (const script of Array.from(jsonLdScripts)) {
                            try {
                                const jsonLdData = JSON.parse(script.textContent || '{}');
                                if (jsonLdData['@type'] === 'VideoObject' && jsonLdData.embedUrl) {
                                    videoUrl = jsonLdData.embedUrl;
                                    break;
                                }
                            } catch (e) { }
                        }
                    }

                    // Build text content and blocks from timed transcript
                    if (timedTranscript.length > 0) {
                        const fullText = timedTranscript.map(c => c.text).join(' ');

                        // Group cues into paragraphs (every 4-5 cues)
                        const CUES_PER_BLOCK = 5;
                        const blocks = [];
                        for (let i = 0; i < timedTranscript.length; i += CUES_PER_BLOCK) {
                            const chunk = timedTranscript.slice(i, i + CUES_PER_BLOCK);
                            blocks.push({
                                type: 'paragraph',
                                content: chunk.map(c => c.text).join(' '),
                                startTime: chunk[0].time,
                                endTime: chunk[chunk.length - 1].time
                            });
                        }

                        return NextResponse.json({
                            title: pp?.videoData?.title || "TED Talk",
                            content: blocks.map((b: any) => `<p>${b.content}</p>`).join(''),
                            textContent: fullText,
                            blocks: blocks,
                            timedTranscript: timedTranscript,
                            videoUrl: videoUrl,
                            excerpt: pp?.videoData?.description?.substring(0, 150) + "..." || fullText.substring(0, 150) + "...",
                            byline: pp?.videoData?.presenterDisplayName || "TED Speaker",
                            siteName: "TED",
                            url: finalUrl // Return canonical URL
                        });
                    }
                } catch (e) {
                    console.error("Error parsing TED __NEXT_DATA__:", e);
                }
            }

            // Fallback to JSON-LD extraction
            const jsonLdScripts = tedDoc.window.document.querySelectorAll('script[type="application/ld+json"]');
            console.log("Falling back to JSON-LD, scripts found:", jsonLdScripts.length);

            for (const script of Array.from(jsonLdScripts)) {
                try {
                    const content = script.textContent || '{}';
                    const data = JSON.parse(content);

                    if (data['@type'] === 'VideoObject' && data.transcript) {
                        console.log("Transcript found! Length:", data.transcript.length);
                        const transcript = data.transcript;

                        // Split transcript into paragraphs
                        let paragraphs = transcript.split(/\n\n+/);
                        if (paragraphs.length < 2) {
                            paragraphs = transcript.split(/\n+/);
                        }
                        if (paragraphs.length < 2) {
                            const sentences = transcript.split(/(?<=[.!?])\s+/);
                            paragraphs = [];
                            const SENTENCES_PER_PARAGRAPH = 4;
                            for (let i = 0; i < sentences.length; i += SENTENCES_PER_PARAGRAPH) {
                                paragraphs.push(sentences.slice(i, i + SENTENCES_PER_PARAGRAPH).join(' '));
                            }
                        }

                        paragraphs = paragraphs.map((p: string) => p.trim()).filter((p: string) => p.length > 0);
                        const blocks = paragraphs.map((p: string) => ({ type: 'paragraph', content: p }));

                        return NextResponse.json({
                            title: data.name || "TED Talk",
                            content: blocks.map((b: any) => `<p>${b.content}</p>`).join(''),
                            textContent: transcript,
                            blocks: blocks,
                            excerpt: data.description || transcript.substring(0, 150) + "...",
                            byline: data.author?.[0]?.name || "TED Speaker",
                            siteName: "TED",
                        });
                    }
                } catch (e) {
                    console.error("Error parsing TED JSON-LD:", e);
                }
            }
            console.log("TED logic finished without returning. Falling back to Readability.");
        }

        // Parse with JSDOM and Readability
        const doc = new JSDOM(html, { url: finalUrl });
        const reader = new Readability(doc.window.document);
        const article = reader.parse();

        if (!article) {
            return NextResponse.json({ error: "Failed to parse article" }, { status: 500 });
        }

        // Process content into blocks to preserve structure
        const contentDoc = new JSDOM(article.content || "");
        const blocks: any[] = [];

        function processNode(node: Element) {
            const tagName = node.tagName.toLowerCase();

            // Handle Block Elements - Text Only
            if (tagName === 'p') {
                const text = node.textContent?.trim();
                if (text && text.length > 20) { // Filter out very short lines
                    blocks.push({ type: 'paragraph', content: text });
                }
            } else if (tagName === 'ul' || tagName === 'ol') {
                const items = Array.from(node.querySelectorAll('li')).map(li => li.textContent?.trim()).filter(Boolean);
                if (items.length > 0) {
                    blocks.push({ type: 'list', tag: tagName, items });
                }
            } else if (tagName === 'blockquote') {
                blocks.push({ type: 'blockquote', content: node.textContent?.trim() });
            } else {
                // Recurse for containers (div, section, article, etc.)
                // Ignore headers (h1-h6) and images (img, figure) as requested
                if (!['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img', 'figure', 'script', 'style'].includes(tagName)) {
                    Array.from(node.children).forEach(child => processNode(child));
                }
            }
        }

        // Start processing from body
        if (contentDoc.window.document.body) {
            Array.from(contentDoc.window.document.body.children).forEach(child => processNode(child));
        }

        return NextResponse.json({
            title: article.title,
            content: article.content,
            textContent: article.textContent,
            blocks: blocks, // Return structured blocks
            excerpt: article.excerpt,
            byline: article.byline,
            siteName: article.siteName,
        });
    } catch (error) {
        console.error("Error parsing article:", error);
        return NextResponse.json({
            error: "Failed to fetch or parse URL",
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
    }
}
