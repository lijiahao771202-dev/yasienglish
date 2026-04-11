const { Editor } = require('@tiptap/core');
const StarterKit = require('@tiptap/starter-kit');
const editor = new Editor({
  extensions: [StarterKit],
  content: '<p>because the laboratory <s>doorcard broken</s> access</p>'
});

let text = "";
editor.state.doc.descendants((node) => {
    if (node.isText) {
        const isStrike = node.marks?.some(mark => mark.type.name === 'strike');
        if (!isStrike) {
            text += node.text;
        }
    }
});
console.log(text);
