const https = require('https');

const word = "hello";
// This is the rich endpoint used by their mobile apps/web
const url = `https://dict.youdao.com/jsonapi?q=${word}`;

https.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        try {
            console.log("Youdao JSONAPI Response Length:", data.length);
            // Log a snippet to see structure
            console.log("Snippet:", data.substring(0, 500));

            const json = JSON.parse(data);
            // Check for phonetics in commonly known paths
            const simple = json.simple;
            const ec = json.ec;
            console.log("Simple:", JSON.stringify(simple, null, 2));
            console.log("EC:", JSON.stringify(ec, null, 2));
        } catch (e) {
            console.error("Parse Error", e);
        }
    });
}).on('error', (e) => {
    console.error(e);
});
