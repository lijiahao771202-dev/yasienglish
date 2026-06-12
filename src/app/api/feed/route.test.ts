import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock, parseStringMock, parseURLMock } = vi.hoisted(() => ({
    fetchMock: vi.fn(),
    parseStringMock: vi.fn(),
    parseURLMock: vi.fn(),
}));

vi.mock("rss-parser", () => ({
    default: vi.fn(function ParserMock() {
        return {
            parseString: parseStringMock,
            parseURL: parseURLMock,
        };
    }),
}));

describe("feed route", () => {
    let GETHandler: typeof import("./route").GET;

    beforeAll(async () => {
        ({ GET: GETHandler } = await import("./route"));
    });

    beforeEach(() => {
        fetchMock.mockReset();
        fetchMock.mockImplementation(async (url: string) => ({
            ok: true,
            status: 200,
            statusText: "OK",
            url,
            text: async () => `<rss data-source="${url}"></rss>`,
        }));
        parseStringMock.mockReset();
        parseStringMock.mockImplementation(async (xml: string) => {
            const sourceUrl = xml.match(/data-source="([^"]+)"/)?.[1] ?? "https://example.com/feed";
            return {
                items: [{
                    title: `Fresh article from ${sourceUrl}`,
                    link: `${sourceUrl}?utm_source=test`,
                    pubDate: new Date().toISOString(),
                    contentSnippet: "A recent research article with clear evidence.",
                }],
            };
        });
        parseURLMock.mockReset();
        parseURLMock.mockImplementation(async (url: string) => ({
            items: [{
                title: `Fresh article from ${url}`,
                link: `${url}?utm_source=test`,
                pubDate: new Date().toISOString(),
                contentSnippet: "A recent research article with clear evidence.",
            }],
        }));
        vi.stubGlobal("fetch", fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("fetches only the journals in the requested journal group", async () => {
        const response = await GETHandler(new Request("http://localhost/api/feed?category=journals&journalGroup=medicine&count=6"));

        expect(response.status).toBe(200);
        await response.json();

        const requestedUrls = fetchMock.mock.calls.map((call) => String(call[0]));
        expect(requestedUrls).toEqual([
            "https://www.thelancet.com/rssfeed/lancet_online.xml",
            "https://www.nejm.org/action/showFeed?jc=nejm&type=etoc&feed=rss",
        ]);
    });

    it("falls back to the general journal group for invalid journalGroup values", async () => {
        const response = await GETHandler(new Request("http://localhost/api/feed?category=journals&journalGroup=unknown&count=4"));

        expect(response.status).toBe(200);
        await response.json();

        const requestedUrls = fetchMock.mock.calls.map((call) => String(call[0]));
        expect(requestedUrls).toContain("https://www.nature.com/nature.rss");
        expect(requestedUrls).toContain("https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=science");
        expect(requestedUrls).not.toContain("https://www.thelancet.com/rssfeed/lancet_online.xml");
    });

    it("limits journal fetches to at most thirty articles", async () => {
        parseStringMock.mockImplementation(async (xml: string) => {
            const sourceUrl = xml.match(/data-source="([^"]+)"/)?.[1] ?? "https://example.com/feed";
            return {
                items: Array.from({ length: 40 }, (_item, index) => ({
                    title: `Journal article ${index} from ${sourceUrl}`,
                    link: `${sourceUrl}/article-${index}`,
                    pubDate: new Date(Date.now() - index * 1000).toISOString(),
                    contentSnippet: "A fresh research article with evidence and findings.",
                })),
            };
        });

        const response = await GETHandler(new Request("http://localhost/api/feed?category=journals&journalGroup=general&count=50"));
        const articles = await response.json();

        expect(response.status).toBe(200);
        expect(articles).toHaveLength(30);
    });

    it("fetches RSS XML with browser-like headers before parsing", async () => {
        const response = await GETHandler(new Request("http://localhost/api/feed?category=journals&journalGroup=life_science&count=3"));

        expect(response.status).toBe(200);
        await response.json();

        expect(parseURLMock).not.toHaveBeenCalled();
        expect(parseStringMock).toHaveBeenCalled();
        const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
        expect(requestInit?.headers).toEqual(expect.objectContaining({
            Accept: expect.stringContaining("application/rss+xml"),
            "User-Agent": expect.stringContaining("Mozilla"),
        }));
    });

    it("rejects errata and correction items even when the snippet has research keywords", async () => {
        parseStringMock.mockImplementation(async (xml: string) => {
            const sourceUrl = xml.match(/data-source="([^"]+)"/)?.[1] ?? "https://example.com/feed";
            return {
                items: [
                    {
                        title: "Erratum for the Research Article on cognition",
                        link: `${sourceUrl}/erratum`,
                        pubDate: new Date().toISOString(),
                        contentSnippet: "A research article with evidence and findings.",
                    },
                    {
                        title: "Fresh cognitive science article",
                        link: `${sourceUrl}/fresh`,
                        pubDate: new Date().toISOString(),
                        contentSnippet: "A research article with evidence and findings.",
                    },
                ],
            };
        });

        const response = await GETHandler(new Request("http://localhost/api/feed?category=journals&journalGroup=psychology_learning&count=10"));
        const articles = await response.json();

        expect(response.status).toBe(200);
        expect(articles.some((article: { title?: string }) => article.title?.includes("Erratum"))).toBe(false);
        expect(articles.some((article: { title?: string }) => article.title === "Fresh cognitive science article")).toBe(true);
    });
});
