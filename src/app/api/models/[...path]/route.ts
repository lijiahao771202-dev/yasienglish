import { NextResponse } from "next/server";
import fs from "node:fs";
import { once } from "node:events";
import path from "node:path";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";

export const runtime = "nodejs";

const DEFAULT_MODEL_CACHE_DIR = path.join(process.cwd(), ".cache", "hf-models");
const MODEL_CACHE_DIR = process.env.YASI_MODEL_CACHE_DIR || DEFAULT_MODEL_CACHE_DIR;
const MODEL_MIRROR_ORIGIN = process.env.YASI_MODEL_MIRROR || "https://hf-mirror.com";

interface CachedModelMetadata {
    headers: Record<string, string>;
}

function assertSafeModelPath(segments: string[]) {
    if (!segments.length) {
        throw new Error("Missing model path");
    }

    for (const segment of segments) {
        if (
            !segment
            || segment === "."
            || segment === ".."
            || segment.includes("/")
            || segment.includes("\\")
            || segment.includes("\0")
        ) {
            throw new Error("Unsafe model path");
        }
    }
}

function getCachePaths(segments: string[]) {
    assertSafeModelPath(segments);
    const cachePath = path.join(MODEL_CACHE_DIR, ...segments);
    const metadataPath = `${cachePath}.meta.json`;
    return { cachePath, metadataPath };
}

async function readMetadata(metadataPath: string): Promise<CachedModelMetadata | null> {
    try {
        return JSON.parse(await readFile(metadataPath, "utf8")) as CachedModelMetadata;
    } catch {
        return null;
    }
}

function applySharedHeaders(headers: Headers) {
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    headers.delete("content-encoding");
}

async function serveCachedModel(cachePath: string, metadataPath: string) {
    const [fileStat, metadata] = await Promise.all([
        stat(cachePath),
        readMetadata(metadataPath),
    ]);
    const headers = new Headers(metadata?.headers);
    applySharedHeaders(headers);
    headers.set("Content-Length", String(fileStat.size));
    headers.set("x-yasi-model-cache", "HIT");

    const body = Readable.toWeb(fs.createReadStream(cachePath)) as ReadableStream<Uint8Array>;
    return new Response(body, { status: 200, headers });
}

function collectCacheableHeaders(remoteHeaders: Headers): CachedModelMetadata {
    const headers: Record<string, string> = {};
    for (const key of ["content-type", "etag", "last-modified"]) {
        const value = remoteHeaders.get(key);
        if (value) headers[key] = value;
    }
    return { headers };
}

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}

function streamAndCacheModel(body: ReadableStream<Uint8Array>, cachePath: string, metadataPath: string, metadata: CachedModelMetadata) {
    const tempPath = `${cachePath}.${process.pid}.${Date.now()}.tmp`;

    return new ReadableStream<Uint8Array>({
        async start(controller) {
            await mkdir(path.dirname(cachePath), { recursive: true });
            const file = fs.createWriteStream(tempPath);
            const reader = body.getReader();
            let bytesWritten = 0;

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    bytesWritten += value.byteLength;
                    controller.enqueue(value);

                    if (!file.write(Buffer.from(value))) {
                        await once(file, "drain");
                    }
                }

                await new Promise<void>((resolve, reject) => {
                    file.once("error", reject);
                    file.end(resolve);
                });

                await writeFile(metadataPath, JSON.stringify({
                    headers: {
                        ...metadata.headers,
                        "content-length": String(bytesWritten),
                    },
                }));
                await rename(tempPath, cachePath);
                controller.close();
            } catch (error) {
                file.destroy();
                await rm(tempPath, { force: true }).catch(() => undefined);
                controller.error(error);
            }
        },
        async cancel() {
            await rm(tempPath, { force: true }).catch(() => undefined);
        },
    });
}

export async function GET(req: Request, props: { params: Promise<{ path: string[] }> }) {
    try {
        const { path } = await props.params;
        const modelPath = path.join('/');
        const { cachePath, metadataPath } = getCachePaths(path);

        try {
            return await serveCachedModel(cachePath, metadataPath);
        } catch {
            // Cache miss; fall through to the mirror.
        }

        const targetUrl = `${MODEL_MIRROR_ORIGIN}/${modelPath}${new URL(req.url).search}`;
        
        console.log("Proxying model request to:", targetUrl);
        
        const response = await fetch(targetUrl, {
            headers: {
                // 有些镜像站需要 User-Agent
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            }
        });

        if (!response.ok) {
            return new NextResponse(`Error fetching from mirror: ${response.statusText}`, { status: response.status });
        }

        const headers = new Headers(response.headers);
        applySharedHeaders(headers);
        headers.set("x-yasi-model-cache", "MISS");

        if (!response.body) {
            return new NextResponse("Mirror returned an empty response body", { status: 502 });
        }

        return new Response(streamAndCacheModel(
            response.body as ReadableStream<Uint8Array>,
            cachePath,
            metadataPath,
            collectCacheableHeaders(response.headers),
        ), {
            status: response.status,
            headers,
        });
    } catch (error: unknown) {
        console.error("Model Proxy Error:", error);
        return new NextResponse(`Internal Proxy Error: ${getErrorMessage(error)}`, { status: 500 });
    }
}

export function OPTIONS() {
    const headers = new Headers();
    applySharedHeaders(headers);
    return new Response(null, { status: 204, headers });
}
