export async function isLikelyPlayableMpegBlob(blob: Blob) {
    if (!(blob instanceof Blob) || blob.size < 3) {
        return false;
    }

    const headerBuffer = await new Response(blob.slice(0, 3)).arrayBuffer();
    const header = new Uint8Array(headerBuffer);
    const isId3 = header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33;
    const isFrameSync = header[0] === 0xff && (header[1] & 0xe0) === 0xe0;

    return isId3 || isFrameSync;
}

export function describeHtmlMediaErrorCode(code: number | undefined | null) {
    switch (code) {
        case 1:
            return "aborted";
        case 2:
            return "network";
        case 3:
            return "decode";
        case 4:
            return "src-not-supported";
        default:
            return "unknown";
    }
}
