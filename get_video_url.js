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
            console.log('embedUrl:', d.embedUrl || 'NOT FOUND');
            console.log('contentUrl:', d.contentUrl || 'NOT FOUND');
        }
    } catch (e) { }
});
