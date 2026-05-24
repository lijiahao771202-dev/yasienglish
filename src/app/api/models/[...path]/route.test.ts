import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function importRoute() {
    return import("./route");
}

describe("models proxy route", () => {
    let cacheDir: string;
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.resetModules();
        cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "yasi-model-cache-"));
        process.env.YASI_MODEL_CACHE_DIR = cacheDir;
        fetchMock = vi.fn(async () => new Response("model-bytes", {
            status: 200,
            headers: {
                "content-type": "application/octet-stream",
                etag: "\"abc\"",
            },
        }));
        vi.stubGlobal("fetch", fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        fs.rmSync(cacheDir, { recursive: true, force: true });
        delete process.env.YASI_MODEL_CACHE_DIR;
    });

    it("stores a fetched model file and serves the next request from local cache", async () => {
        const { GET } = await importRoute();
        const props = { params: Promise.resolve({ path: ["Xenova", "bge-m3", "resolve", "main", "config.json"] }) };

        const firstResponse = await GET(new Request("http://localhost/api/models/Xenova/bge-m3/resolve/main/config.json"), props);
        expect(await firstResponse.text()).toBe("model-bytes");

        const secondResponse = await GET(new Request("http://localhost/api/models/Xenova/bge-m3/resolve/main/config.json"), props);
        expect(await secondResponse.text()).toBe("model-bytes");

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(secondResponse.headers.get("x-yasi-model-cache")).toBe("HIT");
    });
});
