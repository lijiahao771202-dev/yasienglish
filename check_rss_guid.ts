
import Parser from 'rss-parser';

const FEED_URL = 'https://pa.tedcdn.com/feeds/talks.rss';

async function checkGuid() {
    try {
        const parser = new Parser();
        const feed = await parser.parseURL(FEED_URL);

        const fs = await import('fs');
        fs.writeFileSync('rss_item.json', JSON.stringify(feed.items[0], null, 2));
        console.log('Wrote rss_item.json');

    } catch (error) {
        console.error('Error:', error);
    }
}

checkGuid();
