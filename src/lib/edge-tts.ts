import { WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import { DEFAULT_TTS_VOICE } from "./profile-settings";

interface EdgeTTSOptions {
    voice?: string;
    lang?: string;
    outputFormat?: string;
    timeoutMs?: number;
}

function getProxyUrl() {
    return (
        process.env.HTTPS_PROXY
        || process.env.HTTP_PROXY
        || process.env.ALL_PROXY
        || process.env.https_proxy
        || process.env.http_proxy
        || process.env.all_proxy
        || null
    );
}

function createProxyAgent(proxyUrl: string) {
    if (proxyUrl.startsWith("socks")) {
        return new SocksProxyAgent(proxyUrl);
    }

    return new HttpsProxyAgent(proxyUrl);
}

export class EdgeTTS {
    private ws: WebSocket | null = null;
    private voice: string;
    private lang: string;
    private outputFormat: string;
    private timeoutMs: number;

    constructor(options: EdgeTTSOptions = {}) {
        this.voice = options.voice || DEFAULT_TTS_VOICE;
        this.lang = options.lang || "en-US";
        this.outputFormat = options.outputFormat || "audio-24khz-48kbitrate-mono-mp3";
        this.timeoutMs = options.timeoutMs || 10000;
    }

    async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            const connectionId = uuidv4().replace(/-/g, "");
            const url = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4&ConnectionId=${connectionId}`;
            const proxyUrl = getProxyUrl();

            this.ws = new WebSocket(url, {
                headers: {
                    "Pragma": "no-cache",
                    "Cache-Control": "no-cache",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0"
                },
                agent: proxyUrl ? createProxyAgent(proxyUrl) : undefined,
            });

            this.ws.on("open", () => {
                this.sendConfig();
                resolve();
            });

            this.ws.on("error", (err) => {
                reject(err);
            });

            this.ws.on("close", (code, reason) => {
                if (code !== 1000) {
                    reject(new Error(`Edge TTS socket closed unexpectedly (${code}) ${reason.toString()}`));
                }
            });
        });
    }

    private sendConfig() {
        if (!this.ws) return;

        const config = {
            context: {
                synthesis: {
                    audio: {
                        metadataoptions: {
                            sentenceBoundaryEnabled: "false",
                            wordBoundaryEnabled: "false",
                        },
                        outputFormat: this.outputFormat,
                    },
                },
            },
        };

        this.ws.send(`X-Timestamp:${new Date().toString()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${JSON.stringify(config)}`);
    }

    async ttsPromise(text: string, rate = "+0%"): Promise<string> {
        return new Promise((resolve, reject) => {
            if (!this.ws) {
                reject(new Error("WebSocket not connected"));
                return;
            }

            const requestId = uuidv4().replace(/-/g, "");
            const ssml = `
        <speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${this.lang}'>
          <voice name='${this.voice}'>
            <prosody rate='${rate}'>${text}</prosody>
          </voice>
        </speak>
      `.trim();

            const chunks: Buffer[] = [];
            let settled = false;

            // Timeout to prevent hanging
            const timeout = setTimeout(() => {
                if (settled) {
                    return;
                }

                settled = true;
                this.ws?.off("message", messageHandler);
                reject(new Error("TTS request timed out"));
            }, this.timeoutMs);

            const messageHandler = (data: Buffer, isBinary: boolean) => {
                if (settled) {
                    return;
                }

                if (isBinary) {
                    // Parse binary message
                    // Format: [2 bytes header length][Headers][Body]
                    const headerLength = data.readUInt16BE(0);
                    const headers = data.subarray(2, 2 + headerLength).toString();

                    // console.log("[EdgeTTS] Binary message received. Headers:", headers);

                    if (headers.includes("Path:audio")) {
                        const audioData = data.subarray(2 + headerLength);
                        chunks.push(audioData);
                    }
                } else {
                    const message = data.toString();
                    if (message.includes("Path:response")) {
                        return;
                    }

                    if (message.includes("Path:turn.start")) {
                        return;
                    }

                    if (message.includes("Path:turn.end")) {
                        settled = true;
                        clearTimeout(timeout);
                        this.ws?.off("message", messageHandler);
                        const fullBuffer = Buffer.concat(chunks);

                        if (!fullBuffer.length) {
                            reject(new Error("Edge TTS returned an empty audio buffer."));
                            return;
                        }

                        resolve(fullBuffer.toString("base64"));
                    }
                }
            };

            this.ws.on("message", messageHandler);
            this.ws.send(`X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${new Date().toString()}\r\nPath:ssml\r\n\r\n${ssml}`);
        });
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}
