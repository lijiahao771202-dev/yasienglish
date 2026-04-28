import nlp from 'compromise';

const text = "We discussed squeezing in time to meet, so maybe we could try video chatting every Wednesday evening for flexibility and connection.";
const doc = nlp(text);
const chunks = doc.chunks().json();

console.log(chunks);
