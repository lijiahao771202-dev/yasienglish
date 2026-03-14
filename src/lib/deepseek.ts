import OpenAI from "openai";
import type {
    ChatCompletion,
    ChatCompletionChunk,
    ChatCompletionCreateParamsNonStreaming,
    ChatCompletionCreateParamsStreaming,
} from "openai/resources/chat/completions";
import type { Stream } from "openai/streaming";

import { createServerClient } from "@/lib/supabase/server";

const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
type CompletionRequestOptions = Parameters<OpenAI["chat"]["completions"]["create"]>[1];

function getFallbackDeepSeekApiKey() {
    return process.env.DEEPSEEK_API_KEY?.trim() || null;
}

export async function getDeepSeekApiKeyForCurrentUser() {
    try {
        const supabase = await createServerClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (user) {
            const { data, error } = await supabase
                .from("profiles")
                .select("deepseek_api_key")
                .eq("user_id", user.id)
                .maybeSingle();

            if (!error) {
                const profileKey = typeof data?.deepseek_api_key === "string" ? data.deepseek_api_key.trim() : "";
                if (profileKey) {
                    return profileKey;
                }
            }
        }
    } catch {
        // Fall back to the shared server key when request auth context is unavailable.
    }

    return getFallbackDeepSeekApiKey();
}

export async function createDeepSeekClientForCurrentUser() {
    const apiKey = await getDeepSeekApiKeyForCurrentUser();

    if (!apiKey) {
        throw new Error("Missing DeepSeek API key. Add your DeepSeek key in profile settings or configure DEEPSEEK_API_KEY on the server.");
    }

    return new OpenAI({
        apiKey,
        baseURL: DEEPSEEK_BASE_URL,
    });
}

async function createCompletion(
    body: ChatCompletionCreateParamsNonStreaming,
    options?: CompletionRequestOptions,
): Promise<ChatCompletion>;
async function createCompletion(
    body: ChatCompletionCreateParamsStreaming,
    options?: CompletionRequestOptions,
): Promise<Stream<ChatCompletionChunk>>;
async function createCompletion(
    body: ChatCompletionCreateParamsNonStreaming | ChatCompletionCreateParamsStreaming,
    options?: CompletionRequestOptions,
): Promise<ChatCompletion | Stream<ChatCompletionChunk>> {
    const client = await createDeepSeekClientForCurrentUser();
    return client.chat.completions.create(body as never, options) as Promise<ChatCompletion | Stream<ChatCompletionChunk>>;
}

export const deepseek = {
    chat: {
        completions: {
            create: createCompletion,
        },
    },
};
