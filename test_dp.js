const userText = "i don't actually mind making";
const referenceText = "I don't actually mind making our relationship public, but I just hope we can have more private moments to deepen our connection.";

const calculateMatchedIndex = (userStr, refStr) => {
    if (!userStr.trim() || !refStr.trim()) return 0;
    const uWords = userStr.trim().split(/\s+/);
    const rWords = refStr.trim().replace(/[.,!?]$/, "").split(/\s+/);
    
    let matchCount = 0;
    for (let i = 0; i < Math.min(uWords.length, rWords.length); i++) {
        const uW = uWords[i].replace(/[.,!?]/g, "").toLowerCase();
        const rW = rWords[i].replace(/[.,!?]/g, "").toLowerCase();
        if (uW === rW || rW.startsWith(uW)) {
            matchCount = i + 1;
        } else {
            break;
        }
    }
    return matchCount;
};

console.log("matchedIndex:", calculateMatchedIndex(userText, referenceText));
console.log("Next word for matched index is:", referenceText.split(/\s+/)[calculateMatchedIndex(userText, referenceText)]);
