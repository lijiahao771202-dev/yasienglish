const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('ted_talk_page.html', 'utf8');
const dom = new JSDOM(html);

// Check JSON-LD for embedUrl
const scripts = dom.window.document.querySelectorAll('script[type="application/ld+json"]');
scripts.forEach((s, i) => {
    try {
        const d = JSON.parse(s.textContent);
        if (d['@type'] === 'VideoObject') {
            console.log('=== JSON-LD VideoObject ===');
            console.log('embedUrl:', d.embedUrl);
            console.log('contentUrl:', d.contentUrl);
        }
    } catch (e) { }
});

// Check __NEXT_DATA__ videoData
const nextData = dom.window.document.getElementById('__NEXT_DATA__');
if (nextData) {
    const data = JSON.parse(nextData.textContent);
    const vd = data.props?.pageProps?.videoData;

    console.log('\n=== videoData structure ===');
    console.log('Keys:', Object.keys(vd || {}));

    if (vd?.playerData) {
        console.log('\nplayerData keys:', Object.keys(vd.playerData));

        if (vd.playerData.resources) {
            console.log('resources:', JSON.stringify(vd.playerData.resources).substring(0, 200));
        }
    }

    // Check for native download or streaming URLs
    if (vd?.nativeDownloads) {
        console.log('\nnativeDownloads:', JSON.stringify(vd.nativeDownloads, null, 2).substring(0, 300));
    }

    // Check for mediaSlug or other identifiers
    if (vd?.mediaSlug) {
        console.log('\nmediaSlug:', vd.mediaSlug);
    }
}
