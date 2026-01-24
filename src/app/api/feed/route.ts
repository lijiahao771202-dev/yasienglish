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
        { name: "Psychology Today", url: "https://www.psychologytoday.com/us/feed" },
        { name: "PsyArXiv", url: "https://blog.psyarxiv.com/feed/" },
        { name: "Neuroscience News", url: "https://neurosciencenews.com/feed/" },
        { name: "BPS Research Digest", url: "https://digest.bps.org.uk/feed/" },
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
                    // Extract image
                    let image = null;
                    let videoId = null;

                    // YouTube Specific Parsing
                    if (source.url.includes('youtube.com')) {
                        // YouTube RSS usually puts video ID in yt:videoId
                        // rss-parser might put it in item['yt:videoId'] or item.id
                        // Thumbnail usually in media:group -> media:thumbnail
                        const ytMedia = item['media:group'];
                        if (ytMedia) {
                            image = ytMedia['media:thumbnail']?.[0]?.$.url;
                        }
                        videoId = item['yt:videoId'];
                    } else {
                        // Standard RSS Image Extraction
                        if (item.enclosure && item.enclosure.url && item.enclosure.type?.startsWith('image')) {
                            image = item.enclosure.url;
                        } else if (item['media:content'] && item['media:content'].$ && item['media:content'].$.url) {
                            image = item['media:content'].$.url;
                        } else if (item['media:thumbnail'] && item['media:thumbnail'].$ && item['media:thumbnail'].$.url) {
                            image = item['media:thumbnail'].$.url;
                        } else if (item.content) {
                            const imgMatch = item.content.match(/<img[^>]+src="([^">]+)"/);
                            if (imgMatch) {
                                image = imgMatch[1];
                            }
                        } else if (item.description) {
                            const imgMatch = item.description.match(/<img[^>]+src="([^">]+)"/);
                            if (imgMatch) {
                                image = imgMatch[1];
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
