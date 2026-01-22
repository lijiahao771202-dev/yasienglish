import { WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";

interface EdgeTTSOptions {
    voice?: string;
    lang?: string;
    outputFormat?: string;
}

export class EdgeTTS {
    private ws: WebSocket | null = null;
    private voice: string;
    private lang: string;
    private outputFormat: string;

    constructor(options: EdgeTTSOptions = {}) {
        this.voice = options.voice || "en-US-JennyNeural";
        this.lang = options.lang || "en-US";
        this.outputFormat = options.outputFormat || "audio-24khz-48kbitrate-mono-mp3";
    }

    async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            const connectionId = uuidv4().replace(/-/g, "");
            const url = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4&ConnectionId=${connectionId}`;

            this.ws = new WebSocket(url, {
                headers: {
                    "Pragma": "no-cache",
                    "Cache-Control": "no-cache",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0"
                }
            });

            this.ws.on("open", () => {
                this.sendConfig();
                resolve();
            });

            this.ws.on("error", (err) => {
                reject(err);
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

    async ttsPromise(text: string): Promise<string> {
        return new Promise((resolve, reject) => {
            if (!this.ws) {
                reject(new Error("WebSocket not connected"));
                return;
            }

            const requestId = uuidv4().replace(/-/g, "");
            const ssml = `
        <speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${this.lang}'>
          <voice name='${this.voice}'>
            ${text}
          </voice>
        </speak>
      `.trim();

            const chunks: Buffer[] = [];

            // Timeout to prevent hanging
            const timeout = setTimeout(() => {
                reject(new Error("TTS request timed out"));
            }, 10000);

            const messageHandler = (data: Buffer, isBinary: boolean) => {
                if (isBinary) {
                    // Parse binary message
                    // Format: [2 bytes header length][Headers][Body]
                    const headerLength = data.readUInt16BE(0);
                    const headers = data.subarray(2, 2 + headerLength).toString();

                    // console.log("[EdgeTTS] Binary message received. Headers:", headers);

                    if (headers.includes("Path:audio")) {
                        const audioData = data.subarray(2 + headerLength);
                        chunks.push(audioData);
                        // console.log(`[EdgeTTS] Received audio chunk: ${audioData.length} bytes`);
                    }
                } else {
                    const message = data.toString();
                    console.log("[EdgeTTS] Text message:", message);
                    if (message.includes("Path:turn.end")) {
                        clearTimeout(timeout);
                        this.ws?.off("message", messageHandler); // Clean up listener
                        const fullBuffer = Buffer.concat(chunks);
                        console.log(`[EdgeTTS] Turn ended. Total audio size: ${fullBuffer.length} bytes`);
                        resolve(fullBuffer.toString("base64"));
                    }
                }
            };

            this.ws.on("message", messageHandler);

            console.log("[EdgeTTS] Sending SSML request...");
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
