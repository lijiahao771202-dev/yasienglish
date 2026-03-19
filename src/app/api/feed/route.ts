import { NextResponse } from "next/server";
import Parser from "rss-parser";

export const revalidate = 3600; // Cache for 1 hour

const FEEDS = {
    psychology: [
        { name: "ScienceDaily", url: "https://www.sciencedaily.com/rss/mind_brain/psychology.xml" },
        { name: "ScienceDaily Mind", url: "https://www.sciencedaily.com/rss/mind_brain.xml" },
        { name: "Psychology Today", url: "https://www.psychologytoday.com/us/feed" },
        { name: "PsyArXiv", url: "https://blog.psyarxiv.com/feed/" },
        { name: "Neuroscience News", url: "https://neurosciencenews.com/feed/" },
        { name: "BPS Research Digest", url: "https://digest.bps.org.uk/feed/" },
        { name: "APA Monitor", url: "https://www.apa.org/monitor/rss" },
        { name: "PsyPost", url: "https://www.psypost.org/feed" },
        { name: "The Conversation Psychology", url: "https://theconversation.com/us/topics/psychology-702/articles.atom" },
        { name: "Scientific American Mind", url: "https://www.scientificamerican.com/section/mind-brain/?format=rss" },
        { name: "Greater Good Science", url: "https://greatergood.berkeley.edu/feed/rss" },
    ],
    ai_news: [
        { name: "Wired AI", url: "https://www.wired.com/feed/category/ai/latest/rss" },
        { name: "MIT Tech Review", url: "https://www.technologyreview.com/feed/" },
        { name: "Anthropic Research", url: "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_research.xml" },
        { name: "OpenAI", url: "https://openai.com/news/rss.xml" },
        { name: "Google DeepMind", url: "https://deepmind.google/blog/feed/basic" },
        { name: "Hugging Face", url: "https://hf.co/blog/feed.xml" },
        { name: "LangChain", url: "https://blog.langchain.dev/rss/" },
        { name: "Arxiv CS.AI", url: "https://rss.arxiv.org/rss/cs.AI" },
    ]
};

type FeedCategory = keyof typeof FEEDS;

interface ParsedFeedItem {
    title?: string;
    link?: string;
    pubDate?: string;
    contentSnippet?: string;
    content?: string;
    description?: string;
    summary?: string;
    image?: string | { url?: string };
    enclosure?: { url?: string; type?: string };
    itunes?: { duration?: string };
    author?: string;
    [key: string]: unknown;
}

function getTime(pubDate?: string) {
    const timestamp = pubDate ? Date.parse(pubDate) : Number.NaN;
    return Number.isFinite(timestamp) ? timestamp : 0;
}

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category") || "psychology";
    const requestedCount = Number(searchParams.get("count") ?? "10");
    const count = Number.isFinite(requestedCount)
        ? Math.min(Math.max(Math.floor(requestedCount), 1), 20)
        : 10;
    const perSourceLimit = Math.max(count, 5);

    // Handle Standard RSS Feeds
    const parser = new Parser();
    const sources = FEEDS[category as FeedCategory] || FEEDS.psychology;

    try {
        const feedPromises = sources.map(async (source) => {
            try {
                const feed = await parser.parseURL(source.url);
                return feed.items.slice(0, perSourceLimit).map((rawItem) => {
                    const item = rawItem as ParsedFeedItem;
                    // Extract image from various RSS fields
                    let image = null;
                    let videoId: string | null = null;

                    // YouTube Specific Parsing
                    if (source.url.includes('youtube.com')) {
                        const ytMedia = item['media:group'] as { ['media:thumbnail']?: Array<{ $?: { url?: string } }> } | undefined;
                        if (ytMedia) {
                            image = ytMedia['media:thumbnail']?.[0]?.$?.url;
                        }
                        videoId = typeof item['yt:videoId'] === "string" ? item['yt:videoId'] : null;
                    } else {
                        // Try multiple image sources in order of preference

                        // 1. Enclosure (common in podcasts/feeds)
                        if (item.enclosure?.url && item.enclosure.type?.startsWith('image')) {
                            image = item.enclosure.url;
                        }

                        // 2. media:content (common in news feeds)
                        const mediaContentValue = item['media:content'];
                        if (!image && mediaContentValue) {
                            const mediaContent = Array.isArray(mediaContentValue)
                                ? mediaContentValue[0] as { $?: { url?: string } }
                                : mediaContentValue as { $?: { url?: string } };
                            if (mediaContent?.$?.url) {
                                image = mediaContent.$.url;
                            }
                        }

                        // 3. media:thumbnail
                        const thumbnailValue = item['media:thumbnail'];
                        if (!image && thumbnailValue) {
                            const thumbnail = Array.isArray(thumbnailValue)
                                ? thumbnailValue[0] as { $?: { url?: string } }
                                : thumbnailValue as { $?: { url?: string } };
                            if (thumbnail?.$?.url) {
                                image = thumbnail.$.url;
                            }
                        }

                        // 4. image field (some feeds)
                        if (!image && item.image) {
                            image = typeof item.image === 'string' ? item.image : item.image?.url;
                        }

                        // 5. content:encoded field (WordPress, many blogs)
                        const contentEncoded = typeof item['content:encoded'] === "string" ? item['content:encoded'] : "";
                        if (!image && contentEncoded) {
                            const imgMatch = contentEncoded.match(/<img[^>]+src=["']([^"'>]+)["']/i);
                            if (imgMatch) {
                                image = imgMatch[1];
                            }
                        }

                        // 6. Regular content field
                        if (!image && typeof item.content === "string") {
                            const imgMatch = item.content.match(/<img[^>]+src=["']([^"'>]+)["']/i);
                            if (imgMatch) {
                                image = imgMatch[1];
                            }
                        }

                        // 7. Description field
                        if (!image && typeof item.description === "string") {
                            const imgMatch = item.description.match(/<img[^>]+src=["']([^"'>]+)["']/i);
                            if (imgMatch) {
                                image = imgMatch[1];
                            }
                        }

                        // 8. Summary field (Atom feeds)
                        if (!image && typeof item.summary === "string") {
                            const imgMatch = item.summary.match(/<img[^>]+src=["']([^"'>]+)["']/i);
                            if (imgMatch) {
                                image = imgMatch[1];
                            }
                        }

                        // Clean up relative URLs
                        if (image && !image.startsWith('http')) {
                            try {
                                const baseUrl = new URL(source.url);
                                image = new URL(image, baseUrl.origin).href;
                            } catch {
                                image = null;
                            }
                        }
                    }

                    return {
                        title: item.title,
                        link: item.link,
                        pubDate: item.pubDate || new Date().toISOString(),
                        source: source.name,
                        snippet: item.contentSnippet || item.content || item.description || item.summary,
                        image: image,
                        // TED/YouTube Specifics
                        duration: item.itunes?.duration,
                        speaker: item.author, // YouTube uses 'author'
                        videoId: videoId
                    };
                });
            } catch (err) {
                console.error(`Failed to fetch feed for ${source.name}:`, err);
                return [];
            }
        });

        const results = await Promise.all(feedPromises);
        const articles = results
            .flat()
            .filter((article) => Boolean(article.title && article.link))
            .sort((a, b) => getTime(b.pubDate) - getTime(a.pubDate))
            .filter((article, index, all) => {
                return all.findIndex((candidate) => candidate.link === article.link) === index;
            })
            .slice(0, count);

        return NextResponse.json(articles);
    } catch (error) {
        console.error("Feed API Error:", error);
        return NextResponse.json({ error: "Failed to fetch feeds" }, { status: 500 });
    }
}
