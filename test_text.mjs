import nlp from 'compromise';

const text = "Due to station construction, the elevator will be temporarily unavailable this Friday afternoon, so please use the stairs instead.";
let doc = nlp(text);

const chunks = doc.chunks().json();
let concatenated = "";

chunks.forEach((c, idx) => {
    // Check if there should be a space before the chunk
    console.log(`CHUNK [${c.text}]`);
    concatenated += c.text + " ";
});

console.log("Original: " + text);
console.log("Concat  : " + concatenated);
