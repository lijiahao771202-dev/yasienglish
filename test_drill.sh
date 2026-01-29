curl -X POST http://localhost:3000/api/ai/generate_drill   -H "Content-Type: application/json"   -d '{
    "articleTitle": "Test",
    "articleContent": "This is a test context about artificial intelligence.",
    "eloRating": 1500,
    "mode": "listening"
  }'
