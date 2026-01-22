const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('ted_talk_page.html', 'utf8');
const dom = new JSDOM(html);
const s = dom.window.document.getElementById('__NEXT_DATA__');

if (s) {
    const d = JSON.parse(s.textContent);
    const vd = d.props?.pageProps?.videoData;

    // Search recursively for any video URLs
    function findVideoUrls(obj, path = '') {
        if (typeof obj === 'string' && (obj.includes('.mp4') || obj.includes('.m3u8') || obj.includes('video'))) {
            console.log(`${path}: ${obj.substring(0, 100)}`);
        }
        if (typeof obj === 'object' && obj !== null) {
            for (const key of Object.keys(obj)) {
                if (['apolloState', 'urqlState', '__typename', 'transcript'].includes(key)) continue;
                findVideoUrls(obj[key], path ? `${path}.${key}` : key);
            }
        }
    }

    console.log('=== Searching for video URLs in videoData ===');
    findVideoUrls(vd, 'videoData');

    // Also check playerData specifically
    console.log('\n=== playerData structure ===');
    if (vd?.playerData) {
        console.log('Keys:', Object.keys(vd.playerData));
        if (vd.playerData.resources) {
            console.log('resources:', JSON.stringify(vd.playerData.resources, null, 2).substring(0, 500));
        }
    }
}
