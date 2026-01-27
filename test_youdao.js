const http = require('http');

const word = "hello";
const url = `http://dict.youdao.com/suggest?num=1&doctype=json&q=${word}`;

http.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        console.log("Youdao Response:", data);
    });
}).on('error', (e) => {
    console.error(e);
});
