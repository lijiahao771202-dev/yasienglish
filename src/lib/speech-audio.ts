export interface ParsedWav {
    sampleRate: number;
    channelCount: number;
    samples: Float32Array;
}

function clampPcm16(sample: number) {
    return Math.max(-1, Math.min(1, sample));
}

export function mergeChannels(buffer: AudioBuffer) {
    if (buffer.numberOfChannels === 1) {
        return buffer.getChannelData(0).slice();
    }

    const merged = new Float32Array(buffer.length);
    for (let channelIndex = 0; channelIndex < buffer.numberOfChannels; channelIndex += 1) {
        const channel = buffer.getChannelData(channelIndex);
        for (let index = 0; index < channel.length; index += 1) {
            merged[index] += channel[index] / buffer.numberOfChannels;
        }
    }

    return merged;
}

export function resampleLinear(samples: Float32Array, fromSampleRate: number, toSampleRate: number) {
    if (fromSampleRate === toSampleRate) {
        return samples.slice();
    }

    const ratio = fromSampleRate / toSampleRate;
    const targetLength = Math.max(1, Math.round(samples.length / ratio));
    const result = new Float32Array(targetLength);

    for (let index = 0; index < targetLength; index += 1) {
        const sourceIndex = index * ratio;
        const left = Math.floor(sourceIndex);
        const right = Math.min(samples.length - 1, left + 1);
        const weight = sourceIndex - left;
        result[index] = samples[left] * (1 - weight) + samples[right] * weight;
    }

    return result;
}

export function concatSampleChunks(chunks: Float32Array[]) {
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Float32Array(totalLength);
    let offset = 0;

    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }

    return result;
}

export function encodeWavFromChunks(chunks: Float32Array[], sampleRate: number, targetSampleRate = 16000) {
    const merged = concatSampleChunks(chunks);
    const resampled = resampleLinear(merged, sampleRate, targetSampleRate);
    return encodeWavPcm16(resampled, targetSampleRate);
}

export function encodeWavPcm16(samples: Float32Array, sampleRate: number) {
    const bytesPerSample = 2;
    const blockAlign = bytesPerSample;
    const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
    const view = new DataView(buffer);

    const writeString = (offset: number, value: string) => {
        for (let index = 0; index < value.length; index += 1) {
            view.setUint8(offset + index, value.charCodeAt(index));
        }
    };

    writeString(0, "RIFF");
    view.setUint32(4, 36 + samples.length * bytesPerSample, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeString(36, "data");
    view.setUint32(40, samples.length * bytesPerSample, true);

    let offset = 44;
    for (let index = 0; index < samples.length; index += 1) {
        const value = clampPcm16(samples[index]);
        view.setInt16(offset, value < 0 ? value * 0x8000 : value * 0x7fff, true);
        offset += bytesPerSample;
    }

    return new Blob([buffer], { type: "audio/wav" });
}

export function parseWavPcm16(buffer: ArrayBuffer | Uint8Array) {
    const source = buffer instanceof Uint8Array
        ? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
        : buffer;
    const view = new DataView(source);
    const readString = (offset: number, length: number) => {
        let result = "";
        for (let index = 0; index < length; index += 1) {
            result += String.fromCharCode(view.getUint8(offset + index));
        }
        return result;
    };

    if (readString(0, 4) !== "RIFF" || readString(8, 4) !== "WAVE") {
        throw new Error("Unsupported WAV container.");
    }

    let offset = 12;
    let sampleRate = 0;
    let channelCount = 0;
    let dataOffset = 0;
    let dataSize = 0;

    while (offset + 8 <= view.byteLength) {
        const chunkId = readString(offset, 4);
        const chunkSize = view.getUint32(offset + 4, true);
        offset += 8;

        if (chunkId === "fmt ") {
            const audioFormat = view.getUint16(offset, true);
            channelCount = view.getUint16(offset + 2, true);
            sampleRate = view.getUint32(offset + 4, true);
            const bitsPerSample = view.getUint16(offset + 14, true);

            if (audioFormat !== 1 || bitsPerSample !== 16) {
                throw new Error("Only PCM16 WAV is supported.");
            }
        } else if (chunkId === "data") {
            dataOffset = offset;
            dataSize = chunkSize;
        }

        offset += chunkSize;
    }

    if (!sampleRate || !channelCount || !dataOffset || !dataSize) {
        throw new Error("Invalid WAV payload.");
    }

    const frameCount = dataSize / 2 / channelCount;
    const output = new Float32Array(frameCount);
    let readOffset = dataOffset;

    for (let frame = 0; frame < frameCount; frame += 1) {
        let mixed = 0;
        for (let channel = 0; channel < channelCount; channel += 1) {
            mixed += view.getInt16(readOffset, true) / 0x8000;
            readOffset += 2;
        }
        output[frame] = mixed / channelCount;
    }

    return {
        sampleRate,
        channelCount,
        samples: output,
    } satisfies ParsedWav;
}
