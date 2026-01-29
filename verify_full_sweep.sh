echo "--- A1 (850) ---"
curl -s -X POST http://localhost:3000/api/ai/generate_drill   -H "Content-Type: application/json"   -d '{"articleTitle":"Test","articleContent":"Test context about space exploration.","eloRating":850,"mode":"listening"}' > sweep_850.json

echo "--- A2 (1250) ---"
curl -s -X POST http://localhost:3000/api/ai/generate_drill   -H "Content-Type: application/json"   -d '{"articleTitle":"Test","articleContent":"Test context about space exploration.","eloRating":1250,"mode":"listening"}' > sweep_1250.json

echo "--- B1 (1650) ---"
curl -s -X POST http://localhost:3000/api/ai/generate_drill   -H "Content-Type: application/json"   -d '{"articleTitle":"Test","articleContent":"Test context about space exploration.","eloRating":1650,"mode":"listening"}' > sweep_1650.json

echo "--- B2 (2050) ---"
curl -s -X POST http://localhost:3000/api/ai/generate_drill   -H "Content-Type: application/json"   -d '{"articleTitle":"Test","articleContent":"Test context about space exploration.","eloRating":2050,"mode":"listening"}' > sweep_2050.json

echo "--- C1 (2450) ---"
curl -s -X POST http://localhost:3000/api/ai/generate_drill   -H "Content-Type: application/json"   -d '{"articleTitle":"Test","articleContent":"Test context about space exploration.","eloRating":2450,"mode":"listening"}' > sweep_2450.json

echo "Sweep Complete."
