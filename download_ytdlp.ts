
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';

async function downloadYtDlp() {
    const url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
    const binDir = path.join(process.cwd(), 'bin');
    const dest = path.join(binDir, 'yt-dlp.exe');

    if (!fs.existsSync(binDir)) {
        fs.mkdirSync(binDir, { recursive: true });
    }

    console.log(`Downloading yt-dlp from ${url} to ${dest}...`);

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);

        // @ts-ignore
        await pipeline(response.body, fs.createWriteStream(dest));

        console.log('Download complete!');
    } catch (error) {
        console.error('Download failed:', error);
    }
}

downloadYtDlp();
