declare module "sherpa-onnx-node" {
    export type SherpaStream = {
        acceptWaveform(input: {
            samples: Float32Array;
            sampleRate: number;
        }): void;
        inputFinished(): void;
    };

    export class OnlineRecognizer {
        constructor(config: unknown);
        createStream(): SherpaStream;
        isReady(stream: SherpaStream): boolean;
        decode(stream: SherpaStream): void;
        getResult(stream: SherpaStream): {
            text: string;
        };
    }
}
