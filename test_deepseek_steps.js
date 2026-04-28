const reference = "I don't actually mind making our relationship public, but I just hope we can have more private moments to deepen our connection.";

const words = reference.replace(/[.,!?]$/, "").split(/\s+/);
console.log("0-indexed words:");
words.forEach((w,i) => console.log(`${i}: ${w}`));
