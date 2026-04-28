const winkNLP = require('wink-nlp');
const model = require('wink-eng-lite-web-model');
const nlp = winkNLP(model);

const patterns = [
  { name: 'verb_phrase', patterns: [ '[|AUX] [|ADV] [|PART] [VERB] [|ADV] [|PART] [|VERB]' ] },
  { name: 'noun_phrase', patterns: [ '[|DET] [|ADJ] [|NOUN] [NOUN]' ] },
  { name: 'prep_phrase', patterns: [ '[ADP] [|DET] [|ADJ] [|NOUN] [NOUN]' ] },
  { name: 'pronoun', patterns: [ '[PRON]' ] },
  { name: 'conjunction', patterns: [ '[CCONJ]' ] },
  { name: 'subordinating_conjunction', patterns: [ '[SCONJ]' ] }
];
nlp.learnCustomEntities(patterns);

const text = "I don't actually mind making our relationship public, but I just hope we can have more private moments to deepen our connection.";
const doc = nlp.readDoc(text);

console.log("\nExtracted Entities:");
console.log(doc.customEntities().out(nlp.its.detail));
