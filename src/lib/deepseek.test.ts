import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createServerClientMock, cookiesMock, openAiCreateMock, openAiConstructorMock } = vi.hoisted(() => {
    const createMock = vi.fn();
    const constructorMock = vi.fn(function OpenAI(this: { chat: unknown }) {
        this.chat = {
            completions: {
                create: createMock,
            },
        };
    });

    return {
    createServerClientMock: vi.fn(),
    cookiesMock: vi.fn(),
        openAiCreateMock: createMock,
        openAiConstructorMock: constructorMock,
    };
});

vi.mock("openai", () => ({
    default: openAiConstructorMock,
}));

vi.mock("@/lib/supabase/server", () => ({
    createServerClient: createServerClientMock,
}));

vi.mock("next/headers", () => ({
    cookies: cookiesMock,
}));

function buildCookieStore(values: Record<string, string | undefined>) {
    return {
        get(name: string) {
            const value = values[name];
            return typeof value === "string" ? { value } : undefined;
        },
    };
}

describe("deepseek provider resolution", () => {
    beforeEach(() => {
        vi.resetModules();
        createServerClientMock.mockReset();
        cookiesMock.mockReset();
        delete process.env.DEEPSEEK_API_KEY;
        delete process.env.GLM_API_KEY;
        delete process.env.NVIDIA_API_KEY;
        delete process.env.NIM_API_KEY;
        delete process.env.GITHUB_MODELS_API_KEY;
        delete process.env.MIMO_API_KEY;
        delete process.env.MIMO_BASE_URL;
        openAiCreateMock.mockReset();
        openAiConstructorMock.mockClear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("fails closed when cookie hints nvidia but only DeepSeek env exists", async () => {
        process.env.DEEPSEEK_API_KEY = "deepseek-env";
        cookiesMock.mockResolvedValue(buildCookieStore({
            yasi_ai_provider: "nvidia",
            yasi_nvidia_model: "z-ai/glm5",
        }));
        createServerClientMock.mockResolvedValue({
            auth: {
                getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
            },
        });

        const { getCurrentAiExecutionTargetForCurrentUser } = await import("./deepseek");

        await expect(getCurrentAiExecutionTargetForCurrentUser()).rejects.toThrow("Missing NVIDIA API key");
    });

    it("uses same-provider fallback env when cookie hints nvidia", async () => {
        process.env.DEEPSEEK_API_KEY = "deepseek-env";
        process.env.NVIDIA_API_KEY = "nvidia-env";
        cookiesMock.mockResolvedValue(buildCookieStore({
            yasi_ai_provider: "nvidia",
            yasi_nvidia_model: "minimaxai/minimax-m2.7",
        }));
        createServerClientMock.mockResolvedValue({
            auth: {
                getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
            },
        });

        const { getCurrentAiExecutionTargetForCurrentUser } = await import("./deepseek");
        const result = await getCurrentAiExecutionTargetForCurrentUser();

        expect(result).toEqual({
            provider: "nvidia",
            providerLabel: "NVIDIA",
            model: "minimaxai/minimax-m2.7",
        });
    });

    it("still falls back to DeepSeek only when no preference exists", async () => {
        process.env.DEEPSEEK_API_KEY = "deepseek-env";
        cookiesMock.mockResolvedValue(buildCookieStore({}));
        createServerClientMock.mockResolvedValue({
            auth: {
                getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
            },
        });

        const { getCurrentAiExecutionTargetForCurrentUser } = await import("./deepseek");
        const result = await getCurrentAiExecutionTargetForCurrentUser();

        expect(result).toEqual({
            provider: "deepseek",
            providerLabel: "DeepSeek",
            model: "deepseek-v4-flash",
        });
    });

    it("applies DeepSeek global model and thinking options from cookies", async () => {
        process.env.DEEPSEEK_API_KEY = "deepseek-env";
        cookiesMock.mockResolvedValue(buildCookieStore({
            yasi_ai_provider: "deepseek",
            yasi_deepseek_model: "deepseek-v4-pro",
            yasi_deepseek_thinking_mode: "on",
            yasi_deepseek_reasoning_effort: "max",
        }));
        createServerClientMock.mockResolvedValue({
            auth: {
                getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
            },
        });

        const { createDeepSeekClientForCurrentUserWithOverride } = await import("./deepseek");
        const client = await createDeepSeekClientForCurrentUserWithOverride({});
        openAiCreateMock.mockResolvedValue({
            choices: [{ message: { content: "OK" } }],
        });

        await client.chat.completions.create({
            model: "deepseek-chat",
            messages: [{ role: "user", content: "Ping" }],
        } as never);

        expect(openAiCreateMock).toHaveBeenCalledWith(expect.objectContaining({
            model: "deepseek-v4-pro",
            reasoning_effort: "max",
            extra_body: {
                thinking: {
                    type: "enabled",
                },
            },
        }), undefined);
    });

    it("builds a cache fingerprint from the active global AI selection", async () => {
        process.env.DEEPSEEK_API_KEY = "deepseek-env";
        cookiesMock.mockResolvedValue(buildCookieStore({
            yasi_ai_provider: "deepseek",
            yasi_deepseek_model: "deepseek-v4-pro",
            yasi_deepseek_thinking_mode: "on",
            yasi_deepseek_reasoning_effort: "max",
        }));
        createServerClientMock.mockResolvedValue({
            auth: {
                getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
            },
        });

        const { getCurrentAiExecutionFingerprintForCurrentUser } = await import("./deepseek");
        const result = await getCurrentAiExecutionFingerprintForCurrentUser();

        expect(result).toEqual({
            provider: "deepseek",
            providerLabel: "DeepSeek",
            model: "deepseek-v4-pro",
            deepseekThinkingMode: "on",
            deepseekReasoningEffort: "max",
            cacheSignature: "deepseek:deepseek-v4-pro:thinking=on:reasoning=max",
        });
    });

    it("applies the selected GLM model and enables thinking only for supported models", async () => {
        process.env.GLM_API_KEY = "glm-env";
        cookiesMock.mockResolvedValue(buildCookieStore({
            yasi_ai_provider: "glm",
            yasi_glm_model: "glm-5.1",
            yasi_glm_thinking_mode: "on",
        }));
        createServerClientMock.mockResolvedValue({
            auth: {
                getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
            },
        });

        const { createDeepSeekClientForCurrentUserWithOverride } = await import("./deepseek");
        const client = await createDeepSeekClientForCurrentUserWithOverride({});
        openAiCreateMock.mockResolvedValue({
            choices: [{ message: { content: "OK" } }],
        });

        await client.chat.completions.create({
            model: "deepseek-chat",
            messages: [{ role: "user", content: "Ping" }],
        } as never);

        expect(openAiCreateMock).toHaveBeenCalledWith(expect.objectContaining({
            model: "glm-5.1",
            thinking: {
                type: "enabled",
            },
        }), undefined);
    });

    it("omits the GLM thinking field for legacy models that do not support it", async () => {
        process.env.GLM_API_KEY = "glm-env";
        openAiCreateMock.mockResolvedValue({
            choices: [{ message: { content: "OK" } }],
        });

        const { testAiProviderConnection } = await import("./deepseek");
        await testAiProviderConnection({
            ai_provider: "glm",
            glm_model: "glm-4-flash",
            glm_thinking_mode: "on",
        });

        expect(openAiCreateMock).toHaveBeenCalledWith(expect.objectContaining({
            model: "glm-4-flash",
        }));
        expect(openAiCreateMock.mock.calls.at(-1)?.[0]).not.toHaveProperty("thinking");
    });

    it("uses the GLM env key for connection tests when the form key is empty", async () => {
        process.env.GLM_API_KEY = "glm-env";
        openAiCreateMock.mockResolvedValue({
            choices: [{ message: { content: "OK" } }],
        });

        const { testAiProviderConnection } = await import("./deepseek");
        const result = await testAiProviderConnection({
            ai_provider: "glm",
            glm_api_key: "",
            glm_model: "glm-5.1",
            glm_thinking_mode: "off",
        });

        expect(result).toEqual({
            provider: "glm",
            providerLabel: "GLM",
            model: "glm-5.1",
            content: "OK",
        });
        expect(openAiConstructorMock).toHaveBeenCalledWith(expect.objectContaining({
            apiKey: "glm-env",
            baseURL: "https://open.bigmodel.cn/api/paas/v4/",
        }));
    });

    it("includes GLM thinking mode in the cache fingerprint when the selected model supports it", async () => {
        process.env.GLM_API_KEY = "glm-env";
        cookiesMock.mockResolvedValue(buildCookieStore({
            yasi_ai_provider: "glm",
            yasi_glm_model: "glm-5.1",
            yasi_glm_thinking_mode: "on",
        }));
        createServerClientMock.mockResolvedValue({
            auth: {
                getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
            },
        });

        const { getCurrentAiExecutionFingerprintForCurrentUser } = await import("./deepseek");
        const result = await getCurrentAiExecutionFingerprintForCurrentUser();

        expect(result).toEqual({
            provider: "glm",
            providerLabel: "GLM",
            model: "glm-5.1",
            deepseekThinkingMode: undefined,
            deepseekReasoningEffort: undefined,
            cacheSignature: "glm:glm-5.1:thinking=on",
        });
    });

    it("uses the DeepSeek env key before a stale stored profile key for current-user resolution", async () => {
        process.env.DEEPSEEK_API_KEY = "deepseek-env-key";
        createServerClientMock.mockResolvedValue({
            auth: {
                getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
            },
            from: vi.fn(() => ({
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        maybeSingle: vi.fn().mockResolvedValue({
                            data: {
                                ai_provider: "deepseek",
                                deepseek_api_key: "stale-profile-key",
                                deepseek_model: "deepseek-v4-pro",
                                deepseek_thinking_mode: "on",
                                deepseek_reasoning_effort: "max",
                                glm_api_key: "",
                                nvidia_api_key: "",
                                nvidia_model: "z-ai/glm5",
                                github_api_key: "",
                                github_model: "openai/gpt-4.1-mini",
                            },
                            error: null,
                        }),
                    })),
                })),
            })),
        });
        cookiesMock.mockResolvedValue(buildCookieStore({}));

        const { createDeepSeekClientForCurrentUserWithOverride } = await import("./deepseek");
        const client = await createDeepSeekClientForCurrentUserWithOverride({});
        openAiCreateMock.mockResolvedValue({
            choices: [{ message: { content: "OK" } }],
        });

        await client.chat.completions.create({
            model: "deepseek-chat",
            messages: [{ role: "user", content: "Ping" }],
        } as never);

        expect(openAiConstructorMock).toHaveBeenCalledWith(expect.objectContaining({
            apiKey: "deepseek-env-key",
            baseURL: "https://api.deepseek.com",
        }));
    });

    it("ignores explicit GitHub Models payload keys and uses the server env key", async () => {
        process.env.GITHUB_MODELS_API_KEY = "github-env-key";
        openAiCreateMock.mockResolvedValue({
            choices: [
                {
                    message: {
                        content: "OK",
                    },
                },
            ],
        });

        const { testAiProviderConnection } = await import("./deepseek");
        const result = await testAiProviderConnection({
            ai_provider: "github",
            github_api_key: "stale-payload-key",
            github_model: "openai/gpt-4.1-mini",
        });

        expect(result.model).toBe("openai/gpt-4.1-mini");
        expect(openAiConstructorMock).toHaveBeenCalledWith(expect.objectContaining({
            apiKey: "github-env-key",
            baseURL: "https://models.github.ai/inference",
        }));
    });

    it("uses the GitHub Models env key for connection tests when the form key is empty", async () => {
        process.env.GITHUB_MODELS_API_KEY = "github-env-key";
        openAiCreateMock.mockResolvedValue({
            choices: [{ message: { content: "OK" } }],
        });

        const { testAiProviderConnection } = await import("./deepseek");
        const result = await testAiProviderConnection({
            ai_provider: "github",
            github_api_key: "",
            github_model: "openai/gpt-4.1",
        });

        expect(result.model).toBe("openai/gpt-4.1");
        expect(openAiConstructorMock).toHaveBeenCalledWith(expect.objectContaining({
            apiKey: "github-env-key",
            baseURL: "https://models.github.ai/inference",
        }));
    });

    it("uses the MiMo env key and selected model for connection tests", async () => {
        process.env.MIMO_API_KEY = "mimo-env-key";
        openAiCreateMock.mockResolvedValue({
            choices: [{ message: { content: "OK" } }],
        });

        const { testAiProviderConnection } = await import("./deepseek");
        const result = await testAiProviderConnection({
            ai_provider: "mimo",
            mimo_api_key: "stale-payload-key",
            mimo_model: "mimo-v2.5",
        });

        expect(result).toEqual(expect.objectContaining({
            provider: "mimo",
            providerLabel: "Xiaomi MiMo",
            model: "mimo-v2.5",
        }));
        expect(openAiConstructorMock).toHaveBeenCalledWith(expect.objectContaining({
            apiKey: "mimo-env-key",
            baseURL: "https://token-plan-cn.xiaomimimo.com/v1",
        }));
        expect(openAiCreateMock).toHaveBeenCalledWith(expect.objectContaining({
            model: "mimo-v2.5",
        }));
    });

    it("uses a direct fetch transport for MiMo connection tests", async () => {
        process.env.MIMO_API_KEY = "mimo-env-key";
        openAiCreateMock.mockResolvedValue({
            choices: [{ message: { content: "OK" } }],
        });

        const { testAiProviderConnection } = await import("./deepseek");
        await testAiProviderConnection({
            ai_provider: "mimo",
            mimo_model: "mimo-v2.5-pro",
        });

        expect(openAiConstructorMock).toHaveBeenCalledWith(expect.objectContaining({
            fetch: expect.any(Function),
        }));
    });

    it("applies MiMo thinking settings from learning preferences", async () => {
        process.env.MIMO_API_KEY = "mimo-env-key";
        createServerClientMock.mockResolvedValue({
            auth: {
                getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
            },
            from: vi.fn(() => ({
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        maybeSingle: vi.fn().mockResolvedValue({
                            data: {
                                ai_provider: "mimo",
                                mimo_model: "mimo-v2-pro",
                                learning_preferences: {
                                    ai_provider_params: {
                                        mimo: {
                                            thinking_mode: "on",
                                            reasoning_effort: "high",
                                        },
                                    },
                                },
                            },
                            error: null,
                        }),
                    })),
                })),
            })),
        });
        cookiesMock.mockResolvedValue(buildCookieStore({}));
        openAiCreateMock.mockResolvedValue({
            choices: [{ message: { content: "OK" } }],
        });

        const { createDeepSeekClientForCurrentUserWithOverride } = await import("./deepseek");
        const client = await createDeepSeekClientForCurrentUserWithOverride({});
        await client.chat.completions.create({
            model: "deepseek-chat",
            max_tokens: 128,
            messages: [{ role: "user", content: "Ping" }],
        } as never);

        const payload = openAiCreateMock.mock.calls.at(-1)?.[0] as Record<string, unknown>;
        expect(payload).toEqual(expect.objectContaining({
            model: "mimo-v2-pro",
            thinking: { type: "enabled" },
            max_completion_tokens: 8192,
        }));
        expect(payload).not.toHaveProperty("max_tokens");
    });

    it("does not add MiMo reasoning budget when thinking is disabled", async () => {
        process.env.MIMO_API_KEY = "mimo-env-key";
        cookiesMock.mockResolvedValue(buildCookieStore({
            yasi_ai_provider: "mimo",
            yasi_mimo_model: "mimo-v2.5-pro",
            yasi_mimo_thinking_mode: "off",
            yasi_mimo_reasoning_effort: "high",
        }));
        createServerClientMock.mockResolvedValue({
            auth: {
                getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
            },
        });
        openAiCreateMock.mockResolvedValue({
            choices: [{ message: { content: "OK" } }],
        });

        const { createDeepSeekClientForCurrentUserWithOverride } = await import("./deepseek");
        const client = await createDeepSeekClientForCurrentUserWithOverride({});
        await client.chat.completions.create({
            model: "deepseek-chat",
            messages: [{ role: "user", content: "Ping" }],
        } as never);

        const payload = openAiCreateMock.mock.calls.at(-1)?.[0] as Record<string, unknown>;
        expect(payload).toEqual(expect.objectContaining({
            model: "mimo-v2.5-pro",
            thinking: { type: "disabled" },
        }));
        expect(payload).not.toHaveProperty("max_completion_tokens");
    });

    it("creates a current-user client with thinking disabled while preserving the selected MiMo model", async () => {
        process.env.MIMO_API_KEY = "mimo-env-key";
        cookiesMock.mockResolvedValue(buildCookieStore({
            yasi_ai_provider: "mimo",
            yasi_mimo_model: "mimo-v2.5-pro",
            yasi_mimo_thinking_mode: "on",
            yasi_mimo_reasoning_effort: "high",
        }));
        createServerClientMock.mockResolvedValue({
            auth: {
                getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
            },
        });
        openAiCreateMock.mockResolvedValue({
            choices: [{ message: { content: "OK" } }],
        });

        const { createDeepSeekClientForCurrentUserWithoutThinking } = await import("./deepseek");
        const client = await createDeepSeekClientForCurrentUserWithoutThinking();
        await client.chat.completions.create({
            model: "deepseek-chat",
            max_tokens: 128,
            messages: [{ role: "user", content: "Translate." }],
        } as never);

        const payload = openAiCreateMock.mock.calls.at(-1)?.[0] as Record<string, unknown>;
        expect(payload).toEqual(expect.objectContaining({
            model: "mimo-v2.5-pro",
            thinking: { type: "disabled" },
            max_tokens: 128,
        }));
        expect(payload).not.toHaveProperty("max_completion_tokens");
    });

    it("includes MiMo thinking settings in the execution cache fingerprint", async () => {
        process.env.MIMO_API_KEY = "mimo-env-key";
        cookiesMock.mockResolvedValue(buildCookieStore({
            yasi_ai_provider: "mimo",
            yasi_mimo_model: "mimo-v2-pro",
            yasi_mimo_thinking_mode: "on",
            yasi_mimo_reasoning_effort: "high",
        }));
        createServerClientMock.mockResolvedValue({
            auth: {
                getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
            },
        });

        const { getCurrentAiExecutionFingerprintForCurrentUser } = await import("./deepseek");
        const result = await getCurrentAiExecutionFingerprintForCurrentUser();

        expect(result.cacheSignature).toBe("mimo:mimo-v2-pro:thinking=on:reasoning=high");
    });

    it("builds a no-thinking execution fingerprint for JSON-sensitive requests", async () => {
        process.env.MIMO_API_KEY = "mimo-env-key";
        cookiesMock.mockResolvedValue(buildCookieStore({
            yasi_ai_provider: "mimo",
            yasi_mimo_model: "mimo-v2-pro",
            yasi_mimo_thinking_mode: "on",
            yasi_mimo_reasoning_effort: "high",
        }));
        createServerClientMock.mockResolvedValue({
            auth: {
                getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
            },
        });

        const { getCurrentAiExecutionFingerprintForCurrentUserWithoutThinking } = await import("./deepseek");
        const result = await getCurrentAiExecutionFingerprintForCurrentUserWithoutThinking();

        expect(result).toEqual(expect.objectContaining({
            provider: "mimo",
            providerLabel: "Xiaomi MiMo",
            model: "mimo-v2-pro",
            cacheSignature: "mimo:mimo-v2-pro:thinking=off:reasoning=off",
        }));
    });

    it("uses a MiMo cookie preference with the server env key", async () => {
        process.env.DEEPSEEK_API_KEY = "deepseek-env";
        process.env.MIMO_API_KEY = "mimo-env-key";
        cookiesMock.mockResolvedValue(buildCookieStore({
            yasi_ai_provider: "mimo",
            yasi_mimo_model: "mimo-v2-pro",
        }));
        createServerClientMock.mockResolvedValue({
            auth: {
                getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
            },
        });

        const { getCurrentAiExecutionTargetForCurrentUser } = await import("./deepseek");
        const result = await getCurrentAiExecutionTargetForCurrentUser();

        expect(result).toEqual({
            provider: "mimo",
            providerLabel: "Xiaomi MiMo",
            model: "mimo-v2-pro",
        });
    });

    it("does not keep using a stale cached profile after the remote provider changes", async () => {
        process.env.DEEPSEEK_API_KEY = "deepseek-env";
        process.env.MIMO_API_KEY = "mimo-env-key";
        cookiesMock.mockResolvedValue(buildCookieStore({}));
        let remoteProfile = {
            ai_provider: "deepseek",
            deepseek_model: "deepseek-v4-flash",
            deepseek_thinking_mode: "off",
            deepseek_reasoning_effort: "high",
            nvidia_model: "z-ai/glm5",
            github_model: "openai/gpt-4.1",
            mimo_model: "mimo-v2.5-pro",
        };
        const maybeSingle = vi.fn(async () => ({
            data: remoteProfile,
            error: null,
        }));
        createServerClientMock.mockResolvedValue({
            auth: {
                getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
            },
            from: vi.fn(() => ({
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        maybeSingle,
                    })),
                })),
            })),
        });

        const { getCurrentAiExecutionTargetForCurrentUser } = await import("./deepseek");

        await expect(getCurrentAiExecutionTargetForCurrentUser()).resolves.toEqual({
            provider: "deepseek",
            providerLabel: "DeepSeek",
            model: "deepseek-v4-flash",
        });

        remoteProfile = {
            ...remoteProfile,
            ai_provider: "mimo",
            mimo_model: "mimo-v2.5",
        };

        await expect(getCurrentAiExecutionTargetForCurrentUser()).resolves.toEqual({
            provider: "mimo",
            providerLabel: "Xiaomi MiMo",
            model: "mimo-v2.5",
        });
    });

    it("fails closed when GitHub is selected but only DeepSeek env exists", async () => {
        process.env.DEEPSEEK_API_KEY = "deepseek-env";
        cookiesMock.mockResolvedValue(buildCookieStore({
            yasi_ai_provider: "github",
            yasi_github_model: "openai/gpt-4.1-mini",
        }));
        createServerClientMock.mockResolvedValue({
            auth: {
                getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
            },
        });

        const { getCurrentAiExecutionTargetForCurrentUser } = await import("./deepseek");

        await expect(getCurrentAiExecutionTargetForCurrentUser()).rejects.toThrow("Missing GitHub Models API key");
    });

    it("ignores stored GitHub profile keys and uses the server env key for current-user resolution", async () => {
        process.env.GITHUB_MODELS_API_KEY = "github-env-key";
        createServerClientMock.mockResolvedValue({
            auth: {
                getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
            },
            from: vi.fn(() => ({
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        maybeSingle: vi.fn().mockResolvedValue({
                            data: {
                                ai_provider: "github",
                                deepseek_api_key: "",
                                glm_api_key: "",
                                nvidia_api_key: "",
                                nvidia_model: "z-ai/glm5",
                                github_api_key: "stale-profile-key",
                                github_model: "openai/gpt-4.1-mini",
                            },
                            error: null,
                        }),
                    })),
                })),
            })),
        });
        cookiesMock.mockResolvedValue(buildCookieStore({}));

        const { createDeepSeekClientForCurrentUserWithOverride } = await import("./deepseek");
        const client = await createDeepSeekClientForCurrentUserWithOverride({});
        openAiCreateMock.mockResolvedValue({
            choices: [{ message: { content: "OK" } }],
        });

        await client.chat.completions.create({
            model: "deepseek-chat",
            messages: [{ role: "user", content: "Ping" }],
        } as never);

        expect(openAiConstructorMock).toHaveBeenCalledWith(expect.objectContaining({
            apiKey: "github-env-key",
            baseURL: "https://models.github.ai/inference",
        }));
    });

    it("serializes GitHub Models completions to avoid user-concurrency limits", async () => {
        vi.resetModules();
        process.env.GITHUB_MODELS_API_KEY = "github-env-key";
        cookiesMock.mockResolvedValue(buildCookieStore({
            yasi_ai_provider: "github",
            yasi_github_model: "openai/gpt-4.1",
        }));
        createServerClientMock.mockResolvedValue({
            auth: {
                getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
            },
        });

        let releaseFirst!: () => void;
        openAiCreateMock
            .mockImplementationOnce(async () => {
                await new Promise<void>((resolve) => {
                    releaseFirst = resolve;
                });
                return { choices: [{ message: { content: "first" } }] };
            })
            .mockResolvedValueOnce({ choices: [{ message: { content: "second" } }] });

        const { createDeepSeekClientForCurrentUserWithOverride } = await import("./deepseek");
        const client = await createDeepSeekClientForCurrentUserWithOverride({});

        const first = client.chat.completions.create({
            model: "deepseek-chat",
            messages: [{ role: "user", content: "First" }],
        } as never);
        await Promise.resolve();
        await Promise.resolve();
        expect(openAiCreateMock).toHaveBeenCalledTimes(1);

        const second = client.chat.completions.create({
            model: "deepseek-chat",
            messages: [{ role: "user", content: "Second" }],
        } as never);
        await Promise.resolve();
        await Promise.resolve();
        expect(openAiCreateMock).toHaveBeenCalledTimes(1);

        releaseFirst();
        await Promise.all([first, second]);
        expect(openAiCreateMock).toHaveBeenCalledTimes(2);
    });

    it("retries transient GitHub Models 429 responses", async () => {
        vi.resetModules();
        process.env.GITHUB_MODELS_API_KEY = "github-env-key";
        cookiesMock.mockResolvedValue(buildCookieStore({
            yasi_ai_provider: "github",
            yasi_github_model: "openai/gpt-4.1",
        }));
        createServerClientMock.mockResolvedValue({
            auth: {
                getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
            },
        });
        openAiCreateMock
            .mockRejectedValueOnce(Object.assign(new Error("429 Too many requests"), { status: 429 }))
            .mockResolvedValueOnce({ choices: [{ message: { content: "OK" } }] });

        const { createDeepSeekClientForCurrentUserWithOverride } = await import("./deepseek");
        const client = await createDeepSeekClientForCurrentUserWithOverride({});

        await client.chat.completions.create({
            model: "deepseek-chat",
            messages: [{ role: "user", content: "Ping" }],
        } as never);

        expect(openAiCreateMock).toHaveBeenCalledTimes(2);
    });

    it("uses disabled thinking for DeepSeek connection tests by default", async () => {
        process.env.DEEPSEEK_API_KEY = "deepseek-env";
        openAiCreateMock.mockResolvedValue({
            choices: [{ message: { content: "OK" } }],
        });

        const { testAiProviderConnection } = await import("./deepseek");
        await testAiProviderConnection({
            ai_provider: "deepseek",
        });

        expect(openAiCreateMock).toHaveBeenCalledWith(expect.objectContaining({
            model: "deepseek-v4-flash",
            extra_body: {
                thinking: {
                    type: "disabled",
                },
            },
        }));
    });
});
