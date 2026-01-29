echo "Testing Beginner (Elo 800)..."
curl -X POST http://localhost:3000/api/ai/generate_drill   -H "Content-Type: application/json"   -d '{
    "articleTitle": "Test",
    "articleContent": "This is a test context about artificial intelligence.",
    "eloRating": 800,
    "mode": "listening"
  }' -o response_800.json

echo "Testing Advanced (Elo 2300)..."
curl -X POST http://localhost:3000/api/ai/generate_drill   -H "Content-Type: application/json"   -d '{
    "articleTitle": "Test",
    "articleContent": "This is a test context about artificial intelligence.",
    "eloRating": 2300,
    "mode": "listening"
  }' -o response_2300.json
