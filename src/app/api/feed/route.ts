import { NextResponse } from "next/server";
import Parser from "rss-parser";
import { LOCAL_ARTICLES } from "@/data/local-feeds";

export const revalidate = 3600; // Cache for 1 hour

const FEEDS = {
    news: [
        { name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
        { name: "The Guardian", url: "https://www.theguardian.com/world/rss" },
        { name: "Reuters World", url: "https://www.reutersagency.com/feed/?best-topics=world&post_type=best" },
        { name: "NYT World", url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml" },
    ],
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
        { name: "LangChain", url: "https://blog.langchain.dev/rss/" },
        { name: "Arxiv CS.AI", url: "https://rss.arxiv.org/rss/cs.AI" },
    ],
    ted: [
        // Official TED YouTube Channel RSS
        { name: "TED Talks", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCAuUUnT6oDeKwE6v1NGQxug" }
    ]
};

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category") || "news";

    // Handle Local Feeds
    if (category === 'ielts' || category === 'cet4' || category === 'cet6') {
        const localItems = LOCAL_ARTICLES[category as keyof typeof LOCAL_ARTICLES] || [];
        return NextResponse.json(localItems);
    }

    // Handle Standard RSS Feeds
    const parser = new Parser();
    const sources = FEEDS[category as keyof typeof FEEDS] || FEEDS.news;

    try {
        const feedPromises = sources.map(async (source) => {
            try {
                const feed = await parser.parseURL(source.url);
                return feed.items.slice(0, 10).map((item: any) => {
                    // Extract image from various RSS fields
                    let image = null;
                    let videoId = null;

                    // YouTube Specific Parsing
                    if (source.url.includes('youtube.com')) {
                        const ytMedia = item['media:group'];
                        if (ytMedia) {
                            image = ytMedia['media:thumbnail']?.[0]?.$.url;
                        }
                        videoId = item['yt:videoId'];
                    } else {
                        // Try multiple image sources in order of preference

                        // 1. Enclosure (common in podcasts/feeds)
                        if (item.enclosure?.url && item.enclosure.type?.startsWith('image')) {
                            image = item.enclosure.url;
                        }

                        // 2. media:content (common in news feeds)
                        if (!image && item['media:content']) {
                            const mediaContent = Array.isArray(item['media:content'])
                                ? item['media:content'][0]
                                : item['media:content'];
                            if (mediaContent?.$?.url) {
                                image = mediaContent.$.url;
                            }
                        }

                        // 3. media:thumbnail
                        if (!image && item['media:thumbnail']) {
                            const thumbnail = Array.isArray(item['media:thumbnail'])
                                ? item['media:thumbnail'][0]
                                : item['media:thumbnail'];
                            if (thumbnail?.$?.url) {
                                image = thumbnail.$.url;
                            }
                        }

                        // 4. image field (some feeds)
                        if (!image && item.image) {
                            image = typeof item.image === 'string' ? item.image : item.image?.url;
                        }

                        // 5. content:encoded field (WordPress, many blogs)
                        if (!image && item['content:encoded']) {
                            const imgMatch = item['content:encoded'].match(/<img[^>]+src=["']([^"'>]+)["']/i);
                            if (imgMatch) {
                                image = imgMatch[1];
                            }
                        }

                        // 6. Regular content field
                        if (!image && item.content) {
                            const imgMatch = item.content.match(/<img[^>]+src=["']([^"'>]+)["']/i);
                            if (imgMatch) {
                                image = imgMatch[1];
                            }
                        }

                        // 7. Description field
                        if (!image && item.description) {
                            const imgMatch = item.description.match(/<img[^>]+src=["']([^"'>]+)["']/i);
                            if (imgMatch) {
                                image = imgMatch[1];
                            }
                        }

                        // 8. Summary field (Atom feeds)
                        if (!image && item.summary) {
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
                        pubDate: item.pubDate,
                        source: source.name,
                        snippet: item.contentSnippet || item.content,
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
        const articles = results.flat().sort((a, b) => {
            return new Date(b.pubDate || 0).getTime() - new Date(a.pubDate || 0).getTime();
        });

        return NextResponse.json(articles);
    } catch (error) {
        console.error("Feed API Error:", error);
        return NextResponse.json({ error: "Failed to fetch feeds" }, { status: 500 });
    }
}
