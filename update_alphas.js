const fs = require('fs');
const path = 'src/components/reading/GenerationOverlay.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
    /ctx\.arc\(x, y, p\.baseSize \* scale \* breathGlow, 0, Math\.PI \* 2\);/,
    "ctx.arc(x, y, p.baseSize * scale * breathGlow * (typeof entranceScale !== 'undefined' ? entranceScale : 1), 0, Math.PI * 2);"
);

content = content.replace(
    /ctx\.globalAlpha = depthAlpha \* breathGlow \* 0\.9;/,
    "ctx.globalAlpha = depthAlpha * breathGlow * 0.9 * (typeof entranceAlphaMod !== 'undefined' ? entranceAlphaMod : 1);"
);

content = content.replace(
    /\`rgba\(192, 132, 252, \\\$\\{0\.08 \+ 0\.1 \* breathFactor\\}\)\`/,
    "\`rgba(192, 132, 252, ${ (0.08 + 0.1 * breathFactor) * (typeof entranceAlphaMod !== 'undefined' ? entranceAlphaMod : 1) })\`"
);

content = content.replace(
    /\`rgba\(129, 140, 248, \\\$\\{0\.03 \+ 0\.05 \* breathFactor\\}\)\`/,
    "\`rgba(129, 140, 248, ${ (0.03 + 0.05 * breathFactor) * (typeof entranceAlphaMod !== 'undefined' ? entranceAlphaMod : 1) })\`"
);

fs.writeFileSync(path, content, 'utf8');
