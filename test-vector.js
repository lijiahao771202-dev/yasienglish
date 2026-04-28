async function test() {
    console.log("Testing error_ledger...");
    const res1 = await fetch('http://localhost:3000/api/ai/vector_search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'my friend advice', topK: 1, namespace: 'error_ledger' })
    });
    console.log(await res1.json());

    console.log("\nTesting note...");
    const res2 = await fetch('http://localhost:3000/api/ai/vector_search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'my friend advice', topK: 1, namespace: 'note' })
    });
    console.log(await res2.json());
}
test();
