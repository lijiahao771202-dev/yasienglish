import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createCompletionMock } = vi.hoisted(() => ({
    createCompletionMock: vi.fn(),
}));

vi.mock("@/lib/deepseek", () => ({
    deepseek: {
        chat: {
            completions: {
                create: createCompletionMock,
            },
        },
    },
}));

import { POST } from "./route";

function buildRequest(body: Record<string, unknown>) {
    return new Request("http://localhost/api/ai/listening-cabin/generate", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });
}

function createCompletionPayload(payload: Record<string, unknown>) {
    return {
        choices: [
            {
                message: {
                    content: JSON.stringify(payload),
                },
            },
        ],
    };
}

const baseRequest = {
    prompt: "做一个工作晨会口播",
    topicMode: "manual",
    topicSource: "manual",
    scriptMode: "monologue",
    thinkingMode: "standard",
    style: "workplace",
    focusTags: ["business_vocabulary", "linking"],
    cefrLevel: "B2",
    lexicalDensity: "balanced",
    sentenceLength: "medium",
    scriptLength: "short",
    speakerPlan: {
        strategy: "fixed",
        primaryVoice: "en-US-JennyNeural",
        assignments: [{ speaker: "Narrator", voice: "en-US-JennyNeural" }],
    },
};

describe("listening cabin generate route", () => {
    beforeEach(() => {
        createCompletionMock.mockReset();
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("returns a normalized spoken script payload for valid requests", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletionPayload({
                title: "Morning Briefing Practice",
                sentences: [
                    { english: "Good morning, everyone, and thanks for joining our weekly update.", chinese: "大家早上好，感谢参加我们每周的更新会议。" },
                    { english: "Today I will walk through the three priorities we must finish before Friday.", chinese: "今天我会讲清楚我们周五前必须完成的三个重点。" },
                    { english: "First, we need to close the proposal draft so sales can send it this afternoon.", chinese: "第一，我们要完成提案草稿，销售下午才能发出去。" },
                    { english: "Second, the design review should focus on user flow clarity instead of visual polish.", chinese: "第二，设计评审要先关注流程清晰度，而不是视觉细节。" },
                    { english: "Third, we should align support notes early so customer replies stay consistent all week.", chinese: "第三，我们要提前统一客服说明，确保整周回复口径一致。" },
                    { english: "If we keep this order, we can reduce rework and still leave room for urgent requests.", chinese: "如果按这个顺序推进，我们既能减少返工，也能留出处理紧急需求的空间。" },
                ],
            }),
        );

        const response = await POST(buildRequest(baseRequest));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.title).toBe("Morning Briefing Practice");
        expect(data.sourcePrompt).toBe("做一个工作晨会口播");
        expect(data.sentences.length).toBeGreaterThan(0);
        expect(data.meta).toEqual(expect.objectContaining({
            cefrLevel: "B2",
            scriptMode: "monologue",
            speakerCount: 1,
            model: "deepseek-chat",
        }));
        expect(createCompletionMock).toHaveBeenCalledTimes(1);
        expect(createCompletionMock).toHaveBeenCalledWith(expect.objectContaining({
            model: "deepseek-chat",
            response_format: { type: "json_object" },
        }));
    });

    it("switches to deepseek-reasoner when thinkingMode is deep", async () => {
        createCompletionMock
            .mockResolvedValueOnce(
                createCompletionPayload({
                    title: "Deep Reasoning Brief",
                    sentences: [
                        { english: "Let's walk through this carefully, because the first choice changes how every downstream task will be executed by the team.", chinese: "我们要仔细梳理，因为第一个选择会影响团队后续每个任务的执行方式。", emotion: "serious", pace: "normal" },
                        { english: "First, we align on trade-offs between speed and quality, then we define what must be delivered this week and what can wait.", chinese: "首先我们对齐速度与质量的取舍，然后明确这周必须交付什么、哪些可以后移。", emotion: "serious", pace: "slow" },
                        { english: "Second, we assign clear owners for each milestone, so nobody is guessing who should follow up when blockers appear unexpectedly.", chinese: "第二，我们为每个里程碑明确负责人，这样遇到阻塞时不会有人不确定该由谁跟进。", emotion: "neutral", pace: "normal" },
                        { english: "Finally, we keep a short risk log and review it every evening, which helps us adjust early instead of fixing problems too late.", chinese: "最后我们维护一份简短风险日志并每日复盘，这能让我们提前调整，而不是太晚才补救。", emotion: "calm", pace: "normal" },
                    ],
                }),
            )
            .mockResolvedValueOnce(
                createCompletionPayload({
                    title: "Deep Reasoning Brief",
                    sentences: [
                        { english: "Let's walk through this carefully, because the first choice changes how every downstream task will be executed by the team.", chinese: "我们要仔细梳理，因为第一个选择会影响团队后续每个任务的执行方式。", emotion: "serious", pace: "normal" },
                        { english: "First, we align on trade-offs between speed and quality, then we define what must be delivered this week and what can wait.", chinese: "首先我们对齐速度与质量的取舍，然后明确这周必须交付什么、哪些可以后移。", emotion: "serious", pace: "slow" },
                        { english: "Second, we assign clear owners for each milestone, so nobody is guessing who should follow up when blockers appear unexpectedly.", chinese: "第二，我们为每个里程碑明确负责人，这样遇到阻塞时不会有人不确定该由谁跟进。", emotion: "neutral", pace: "normal" },
                        { english: "Finally, we keep a short risk log and review it every evening, which helps us adjust early instead of fixing problems too late.", chinese: "最后我们维护一份简短风险日志并每日复盘，这能让我们提前调整，而不是太晚才补救。", emotion: "calm", pace: "normal" },
                    ],
                }),
            );

        const response = await POST(buildRequest({
            ...baseRequest,
            thinkingMode: "deep",
        }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.meta.model).toBe("deepseek-reasoner");
        expect(createCompletionMock).toHaveBeenCalledWith(expect.objectContaining({
            model: "deepseek-reasoner",
        }));
    });

    it("returns 400 for empty prompt in manual mode", async () => {
        const response = await POST(buildRequest({
            ...baseRequest,
            prompt: "   ",
            topicMode: "manual",
        }));
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("Prompt is required for manual topic mode.");
        expect(createCompletionMock).not.toHaveBeenCalled();
    });

    it("supports podcast mode with 2-4 speakers", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletionPayload({
                title: "Weekly Product Podcast",
                sentences: [
                    { speaker: "Host", english: "Welcome back to the show, and today we will unpack one product lesson our team learned during this very busy sprint week.", chinese: "欢迎回到节目，今天我们会拆解团队在这次忙碌迭代中学到的一个产品经验。" },
                    { speaker: "Guest 1", english: "The biggest takeaway was aligning scope before writing any code, because that conversation removed confusion and gave every owner a realistic plan.", chinese: "最大的收获是写代码前先对齐范围，这场讨论消除了混乱，也让每个负责人都有了可执行计划。" },
                    { speaker: "Guest 2", english: "That early alignment reduced rework, protected energy, and helped us keep the launch timeline stable even when two urgent requests arrived suddenly.", chinese: "这种前置对齐减少了返工、保护了精力，也让我们在两个紧急需求突然插入时依然稳住上线节奏。" },
                    { speaker: "Host", english: "Before we wrap up, let's share one practical action listeners can try tomorrow morning to start meetings faster and leave with clear next steps.", chinese: "在结束前，我们分享一个明早就能实践的动作，帮助你更快开会并带着清晰的下一步离开。" },
                ],
            }),
        );

        const response = await POST(buildRequest({
            ...baseRequest,
            scriptMode: "podcast",
            topicMode: "random",
            topicSource: "pool",
            prompt: "",
            speakerPlan: {
                strategy: "mixed_dialogue",
                primaryVoice: "en-US-AvaNeural",
                assignments: [
                    { speaker: "Host", voice: "en-US-AvaNeural" },
                    { speaker: "Guest 1", voice: "en-US-BrianNeural" },
                    { speaker: "Guest 2", voice: "en-US-EmmaNeural" },
                ],
            },
        }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.meta).toEqual(expect.objectContaining({
            scriptMode: "podcast",
            speakerCount: 3,
        }));
    });

    it("repairs podcast drafts that omit configured speakers in a four-person setup", async () => {
        createCompletionMock
            .mockResolvedValueOnce(
                createCompletionPayload({
                    title: "Four Voices Podcast",
                    sentences: [
                        { speaker: "Host", english: "Welcome back, today we're unpacking how teams protect focus during intense weeks.", chinese: "欢迎回来，今天我们要聊团队如何在高压周保护专注力。" },
                        { speaker: "Guest 1", english: "For me, the turning point was cutting meeting time in half and preparing decisions before the call.", chinese: "对我来说，转折点是把会议时间砍半，并在开会前先准备好决策。" },
                        { speaker: "Host", english: "That's a strong start, because fewer meetings usually reveal where the real blockers are hiding.", chinese: "这是个很好的开始，因为更少的会议通常更容易暴露真正的阻塞点。" },
                    ],
                }),
            )
            .mockResolvedValueOnce(
                createCompletionPayload({
                    title: "Four Voices Podcast",
                    sentences: [
                        { speaker: "Host", english: "Welcome back, today we're unpacking how teams protect focus during intense weeks.", chinese: "欢迎回来，今天我们要聊团队如何在高压周保护专注力。" },
                        { speaker: "Guest 1", english: "For me, the turning point was cutting meeting time in half and preparing decisions before the call.", chinese: "对我来说，转折点是把会议时间砍半，并在开会前先准备好决策。" },
                        { speaker: "Guest 2", english: "I would add that people need visible quiet hours, or urgent pings will keep breaking concentration all afternoon.", chinese: "我想补充一点，团队需要明确的安静时段，不然紧急消息会一下午都在打断专注。" },
                        { speaker: "Guest 3", english: "And if leaders keep changing priorities midweek, no system will feel stable no matter how efficient it looks on paper.", chinese: "如果管理者总在周中切换优先级，那再高效的制度也不会真正稳定。" },
                        { speaker: "Host", english: "So the pattern is clear: reduce noise, protect deep work, and make priority changes rare and explicit.", chinese: "所以规律很清楚：减少噪音，保护深度工作，并让优先级变更少而明确。" },
                    ],
                }),
            );

        const response = await POST(buildRequest({
            ...baseRequest,
            scriptMode: "podcast",
            topicMode: "manual",
            prompt: "做一个四人播客，聊团队如何熬过高压周",
            speakerPlan: {
                strategy: "mixed_dialogue",
                primaryVoice: "en-US-AvaNeural",
                assignments: [
                    { speaker: "Host", voice: "en-US-AvaNeural" },
                    { speaker: "Guest 1", voice: "en-US-BrianNeural" },
                    { speaker: "Guest 2", voice: "en-US-EmmaNeural" },
                    { speaker: "Guest 3", voice: "en-US-AndrewNeural" },
                ],
            },
        }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.meta).toEqual(expect.objectContaining({
            scriptMode: "podcast",
            speakerCount: 4,
        }));
        expect(createCompletionMock).toHaveBeenCalledTimes(2);
    });

    it("runs repair once when draft fails lint and returns repaired output", async () => {
        createCompletionMock
            .mockResolvedValueOnce(createCompletionPayload({
                title: "Draft",
                sentences: [
                    { english: "In conclusion, this essay shows something.", chinese: "总之，这篇文章说明了某些事情。" },
                ],
            }))
            .mockResolvedValueOnce(createCompletionPayload({
                title: "Better Spoken Draft",
                sentences: [
                    { english: "Good morning, everyone, I want to share a quick plan for today's work.", chinese: "大家早上好，我想快速分享今天的工作计划。" },
                    { english: "We will finish the customer proposal first and confirm the final timeline this noon.", chinese: "我们会先完成客户提案，并在中午确认最终时间线。" },
                    { english: "After that, we will focus on the onboarding flow so new users can start smoothly.", chinese: "之后我们会优化新手引导流程，让新用户能顺利上手。" },
                    { english: "In the afternoon, I will sync with support to make sure our external replies stay aligned.", chinese: "下午我会和客服同步，确保对外回复保持一致。" },
                    { english: "Before we wrap up, I will summarize blockers so each owner knows the next concrete action.", chinese: "在结束前，我会汇总卡点，让每位负责人都清楚下一步动作。" },
                ],
            }));

        const response = await POST(buildRequest(baseRequest));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.title).toBe("Better Spoken Draft");
        expect(createCompletionMock).toHaveBeenCalledTimes(2);
    });

    it("returns 502 when both draft and repair stay invalid", async () => {
        createCompletionMock
            .mockResolvedValueOnce(createCompletionPayload({
                title: "",
                sentences: [{ english: "", chinese: "" }],
            }))
            .mockResolvedValueOnce(createCompletionPayload({
                title: "",
                sentences: [{ english: "", chinese: "" }],
            }));

        const response = await POST(buildRequest(baseRequest));
        const data = await response.json();

        expect(response.status).toBe(502);
        expect(data.error).toBe("AI listening script unavailable");
        expect(Array.isArray(data.issues)).toBe(true);
    });

    it("returns generation details when model output is invalid JSON", async () => {
        createCompletionMock.mockResolvedValueOnce({
            choices: [
                {
                    message: {
                        content: '{"title":"Broken","sentences":[{"english":"hello"',
                    },
                },
            ],
        });

        const response = await POST(buildRequest(baseRequest));
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data.error).toBe("Failed to generate listening cabin script");
        expect(data.details).toContain("invalid JSON");
    });
});
