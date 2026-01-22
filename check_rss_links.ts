
import Parser from 'rss-parser';

const FEED_URL = 'https://pa.tedcdn.com/feeds/talks.rss';

async function checkFeed() {
    try {
        const parser = new Parser();
        const feed = await parser.parseURL(FEED_URL);

        console.log('Feed Title:', feed.title);
        console.log('First item full structure:');
        console.log(JSON.stringify(feed.items[0], null, 2));

        feed.items.slice(0, 3).forEach((item, i) => {
            console.log(`[${i}] Title: ${item.title}`);
            console.log(`    Link: ${item.link}`);
            console.log(`    GUID: ${item.guid}`);
            console.log(`    Content: ${item.content?.substring(0, 50)}...`);
        });

    } catch (error) {
        console.error('Error:', error);
    }
}

checkFeed();
