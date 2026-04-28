const prev = "i wing to";
const rawErrorW = '"wing"';
const rawFixW = 'won';

const cleanError = rawErrorW.replace(/^["'“”‘’.,:;!?\s\[\]]+|["'“”‘’.,:;!?\s\[\]]+$/g, '');
const cleanFix = rawFixW.replace(/^["'“”‘’.,:;!?\s\[\]]+|["'“”‘’.,:;!?\s\[\]]+$/g, '');

const lowerPrev = prev.toLowerCase();
const lowerError = cleanError.toLowerCase();
const idx = lowerPrev.lastIndexOf(lowerError);
let res = "not replaced";
if (idx !== -1) {
    res = prev.substring(0, idx) + cleanFix + prev.substring(idx + cleanError.length);
} else {
    const regex = new RegExp(cleanError.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    res = prev.replace(regex, cleanFix);
}
console.log("RESULT:", res);
