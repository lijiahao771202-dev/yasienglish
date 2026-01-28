import { NextRequest, NextResponse } from "next/server";

// Unsplash Source API - Free, no API key required
// Returns a redirect to a relevant image based on search query

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q");
    const width = searchParams.get("w") || "800";
    const height = searchParams.get("h") || "600";

    if (!query) {
        return NextResponse.json({ error: "Query parameter 'q' is required" }, { status: 400 });
    }

    // Clean and encode the query
    const cleanQuery = query
        .replace(/[^\w\s]/g, '') // Remove special chars
        .split(' ')
        .slice(0, 3) // Take first 3 words for better results
        .join(',');

    // Unsplash Source URL (free, no API key needed)
    // This returns a random image matching the keywords
    const unsplashUrl = `https://source.unsplash.com/${width}x${height}/?${encodeURIComponent(cleanQuery)}`;

    return NextResponse.json({
        url: unsplashUrl,
        query: cleanQuery
    });
}
