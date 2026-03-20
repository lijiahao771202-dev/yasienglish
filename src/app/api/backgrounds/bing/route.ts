import { NextResponse } from "next/server";

interface BingImageItem {
    startdate: string;
    url: string;
    copyright?: string;
    title?: string;
}

interface BingArchivePayload {
    images?: BingImageItem[];
}

async function fetchBingImages(mkt: string) {
    const response = await fetch(
        `https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=12&mkt=${encodeURIComponent(mkt)}`,
        { cache: "no-store" },
    );
    if (!response.ok) {
        throw new Error(`Bing request failed with status ${response.status}`);
    }
    const payload = (await response.json()) as BingArchivePayload;
    const images = payload.images ?? [];
    return images.map((item) => ({
        id: item.startdate,
        imageUrl: item.url.startsWith("http") ? item.url : `https://www.bing.com${item.url}`,
        title: item.title || item.copyright || "Bing Wallpaper",
        date: item.startdate,
    }));
}

export async function GET() {
    try {
        const images = await fetchBingImages("zh-CN");
        return NextResponse.json({ images });
    } catch {
        try {
            const images = await fetchBingImages("en-US");
            return NextResponse.json({ images });
        } catch (error) {
            return NextResponse.json(
                { error: error instanceof Error ? error.message : "Failed to load Bing wallpapers." },
                { status: 500 },
            );
        }
    }
}

