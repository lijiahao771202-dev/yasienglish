const content = `User text: "i contacted the mall police"
Reference: "I contacted the mall security"
Action: "police" is wrong. Output: {"replaceLen": 6, "replaceStr": "security", "prediction": " because"}
`;
const trimmed = content.trim();
const jsonMatch = trimmed.match(/\{[\s\S]*?\}/);
console.log(jsonMatch);
