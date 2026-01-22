const fs = require('fs');

const html = fs.readFileSync('ted_talk_page.html', 'utf8');

// Find MP4 URLs
const mp4Regex = /https?:\/\/[^\s"'<>]*\.mp4[^\s"'<>]*/g;
const mp4Matches = html.match(mp4Regex) || [];
console.log('=== MP4 URLs found ===');
mp4Matches.forEach((url, i) => console.log(`${i + 1}: ${url.substring(0, 120)}`));

// Find M3U8 (HLS) URLs
const m3u8Regex = /https?:\/\/[^\s"'<>]*\.m3u8[^\s"'<>]*/g;
const m3u8Matches = html.match(m3u8Regex) || [];
console.log('\n=== M3U8/HLS URLs found ===');
m3u8Matches.forEach((url, i) => console.log(`${i + 1}: ${url.substring(0, 120)}`));

// Check if we have any video URLs
console.log('\nTotal MPs:', mp4Matches.length, 'Total M3U8:', m3u8Matches.length);
