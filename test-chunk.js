const fetch = require('node-fetch');
async function test() {
    const res = await fetch("http://localhost:3000/api/ai/generate_drill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            topic: "Science",
            difficulty: "intermediate"
        })
    });
    const data = await res.json();
    console.log(data.syntax_chunks);
}
test();
