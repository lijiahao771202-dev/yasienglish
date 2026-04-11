const fs = require('fs');

const sourceText = "工作人员提前透露了派对计划，完全毁掉了这个惊喜。";
const referenceAnswer = "The staff leaked the party plans early, completely ruining the surprise.";
const currentInput = "the staff predite";
const wordCount = 1;

const prompt = `Return strict JSON: {"prediction": "", "replaceLen": 0, "replaceStr": ""}.
Chinese source: "${sourceText}"
Reference translation: "${referenceAnswer}"
Current user text: "${currentInput}"

CRITICAL MAGIC SPELL (SEMANTIC RESCUE): 
If the user's last typed word is a clear synonym, typo, or contextual deviation from the optimal Reference vocabulary, DO NOT just blindly continue.
Instead, issue a surgical REPLACEMENT command to correct the user's trajectory back to the Reference.
- "replaceLen": The exact number of characters at the very end of the user's current text to delete.
- "replaceStr": The perfect vocabulary word from the Reference to inject in its place.
- "prediction": Any remaining words to append AFTER the replacement (max ${wordCount} words).

Important guidelines if no correction needed:
- Keep following the user's current wording and sentence structure.
- If the user's text is already perfect on trajectory, leave replaceLen as 0.
- The continuation must fit IMMEDIATELY after the user's last word (or after the replacement) and remain locally grammatical.
- Do not rewrite entire sentences, only target the final trailing incorrect word if needed.
- If no short continuation is clearly helpful, return an empty prediction.
Return JSON only, with no explanations.`;

console.log(prompt);
