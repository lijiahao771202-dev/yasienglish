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

    it("uses an explicit GitHub Models payload key before the server env key", async () => {
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
            github_api_key: "stale-profile-key",
            github_model: "openai/gpt-4.1-mini",
        });

        expect(result.model).toBe("openai/gpt-4.1-mini");
        expect(openAiConstructorMock).toHaveBeenCalledWith(expect.objectContaining({
            apiKey: "stale-profile-key",
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

    it("uses the stored GitHub profile key before the server env key for current-user resolution", async () => {
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
            apiKey: "stale-profile-key",
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
