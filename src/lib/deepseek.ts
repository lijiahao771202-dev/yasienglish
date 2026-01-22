import OpenAI from "openai";

const apiKey = process.env.DEEPSEEK_API_KEY;
const baseURL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";

if (!apiKey) {
    console.warn("Missing DEEPSEEK_API_KEY environment variable");
}

export const deepseek = new OpenAI({
    apiKey: apiKey || "dummy-key",
    baseURL: baseURL,
});
