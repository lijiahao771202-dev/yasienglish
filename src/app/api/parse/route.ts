import { NextResponse } from "next/server";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { YoutubeTranscript } from "youtube-transcript";

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
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.9",
                    "Upgrade-Insecure-Requests": "1",
                    "Sec-Fetch-Dest": "document",
                    "Sec-Fetch-Mode": "navigate",
                    "Sec-Fetch-Site": "none",
                    "Sec-Fetch-User": "?1"
                },
                redirect: 'follow',
            });

            if (!response.ok) {
                // Try again with different user agent if 403
                if (response.status === 403) {
                    console.log("Retrying with mobile UA...");
                    const retryResponse = await fetch(url, {
                        headers: {
                            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
                        }
                    });
                    if (retryResponse.ok) {
                        finalUrl = retryResponse.url;
                        html = await retryResponse.text();
                    } else {
                        throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
                    }
                } else {
                    throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
                }
            } else {
                finalUrl = response.url;
                html = await response.text();
            }

        } catch (e: any) {
            console.error("Fetch error:", e);
            throw e;
        }

        console.log("Initial URL:", url);
        console.log("Final URL:", finalUrl);

        // Special handling for YouTube (TED Feed or Direct)
        if (finalUrl.includes('youtube.com') || finalUrl.includes('youtu.be')) {
            console.log("YouTube URL detected:", finalUrl);
            let videoId = "";
            try {
                if (finalUrl.includes("v=")) {
                    videoId = finalUrl.split("v=")[1].split("&")[0];
                } else if (finalUrl.includes("youtu.be/")) {
                    videoId = finalUrl.split("youtu.be/")[1].split("?")[0];
                }
            } catch (e) {
                console.error("Failed to extract video ID");
            }

            if (videoId) {
                try {
                    const transcript = await YoutubeTranscript.fetchTranscript(videoId);

                    // Helper: Decode HTML entities in text
                    const decodeHtml = (html: string) => {
                        // Simple naive decoder or use he/jsdom
                        return html.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
                    };

                    // Group transcript lines into paragraphs (e.g., every 15 seconds or by gap)
                    // Simple approach: Group chunks of ~5 lines
                    const blocks: any[] = [];
                    const CHUNK_SIZE = 5;

                    for (let i = 0; i < transcript.length; i += CHUNK_SIZE) {
                        const chunk = transcript.slice(i, i + CHUNK_SIZE);
                        const text = chunk.map(c => decodeHtml(c.text)).join(' ');
                        const startTime = chunk[0].offset / 1000; // ms to s
                        const endTime = (chunk[chunk.length - 1].offset + chunk[chunk.length - 1].duration) / 1000;

                        blocks.push({
                            type: 'paragraph',
                            content: text,
                            startTime: startTime,
                            endTime: endTime
                        });
                    }

                    const fullText = blocks.map(b => b.content).join(' ');

                    // Fetch metadata (title, etc) via oEmbed as fallback if not provided
                    let title = "YouTube Video";
                    let author = "YouTube";

                    try {
                        const oembed = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`).then(r => r.json());
                        title = oembed.title || title;
                        author = oembed.author_name || author;
                    } catch (e) { console.warn("oEmbed failed", e); }

                    return NextResponse.json({
                        title: title,
                        content: blocks.map((b: any) => `<p>${b.content}</p>`).join(''),
                        textContent: fullText,
                        blocks: blocks,
                        videoUrl: `https://www.youtube.com/embed/${videoId}`,
                        excerpt: fullText.substring(0, 150) + "...",
                        byline: author,
                        siteName: "YouTube",
                        url: finalUrl
                    });

                } catch (e) {
                    console.error("YouTube transcript fetch failed:", e);
                    // Fallthrough to standard parsing if transcript fails (though likely won't work well for YT)
                }
            }
        }

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

        // Extract Image
        let imageUrl = null;
        const metaImage = doc.window.document.querySelector('meta[property="og:image"]') ||
            doc.window.document.querySelector('meta[name="twitter:image"]') ||
            doc.window.document.querySelector('meta[property="twitter:image"]');
        if (metaImage) {
            imageUrl = metaImage.getAttribute('content');
        }

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
            image: imageUrl,
        });
    } catch (error) {
        console.error("Error parsing article:", error);
        return NextResponse.json({
            error: "Failed to fetch or parse URL",
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
    }
}
