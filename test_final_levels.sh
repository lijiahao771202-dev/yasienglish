#!/bin/bash
# Comprehensive Test Script for ALL Elo Tiers

API_URL="http://localhost:3000/api/ai/generate_drill"

# Define Tiers: Elo | Name | Listen Target | Trans Target
# 0-400 | A1 | 5-8 | 8-15
# 400-800 | A2- | 8-12 | 15-25
# 800-1200 | A2+ | 12-15 | 25-35
# 1200-1600 | B1 | 15-20 | 35-50
# 1600-2000 | B2 | 20-30 | 50-70
# 2000-2400 | C1 | 25-35 | 70-90
# 2400-2800 | C2 | 35-45 | 90-110
# 2800-3200 | C2+ | 45-55 | 110-130
# 3200+ | EXEC | 60+ | 130-150

TIERS=(
  "200|A1 新手"
  "600|A2- 青铜"
  "1000|A2+ 白银"
  "1400|B1 黄金"
  "1800|B2 铂金"
  "2200|C1 钻石"
  "2600|C2 大师"
  "3000|C2+ 王者"
  "3200|处决模式"
)

echo "=================================================="
echo "      🚀 FINAL DIFFICULTY VERIFICATION"
echo "=================================================="

# Function to test a specific mode and elo
test_tier() {
    elo=$1
    name=$2
    mode=$3
    bossType=$4
    
    echo "--------------------------------------------------"
    if [ "$bossType" == "roulette_execution" ]; then
        echo "Testing [3200 处决] in $mode mode..."
        payload="{\"articleTitle\":\"Business\",\"articleContent\":\"\",\"mode\":\"$mode\",\"eloRating\":3200,\"bossType\":\"roulette_execution\"}"
    else
        echo "Testing [$elo $name] in $mode mode..."
        payload="{\"articleTitle\":\"Business\",\"articleContent\":\"\",\"mode\":\"$mode\",\"eloRating\":$elo}"
    fi

    response=$(curl -s -X POST "$API_URL" -H "Content-Type: application/json" -d "$payload")
    
    english=$(echo "$response" | jq -r '.reference_english // "ERROR"')
    word_count=$(echo "$english" | wc -w | tr -d ' ')
    
    # Print result
    echo "  📝 Content: $(echo "$english" | cut -c 1-80)..."
    echo "  📊 Words: $word_count"
}

# 1. Test Listening Mode (Optimized)
echo ""
echo "🎧 LISTENING MODE (Target: 5 -> 60+)"
for tier in "${TIERS[@]}"; do
    IFS="|" read -r elo name <<< "$tier"
    if [ "$elo" == "3200" ]; then
        test_tier "$elo" "$name" "listening" "roulette_execution"
    else
        test_tier "$elo" "$name" "listening" ""
    fi
done

# 2. Test Translation Mode (Complex)
echo ""
echo "📝 TRANSLATION MODE (Target: 8 -> 150)"
for tier in "${TIERS[@]}"; do
    IFS="|" read -r elo name <<< "$tier"
    if [ "$elo" == "3200" ]; then
        test_tier "$elo" "$name" "translation" "roulette_execution"
    else
        test_tier "$elo" "$name" "translation" ""
    fi
done

echo ""
echo "=================================================="
echo "Verification Complete."
