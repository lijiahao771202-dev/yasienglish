import { buildRebuildSentenceDifficultyProfile } from "@/lib/rebuild-difficulty";

export const RANDOM_SCENARIO_TOPIC = "Random Scenario" as const;

export type BattleQuickMatchTopic = {
    id: string;
    domainId: string;
    domainLabel: string;
    subthemeId: string;
    subthemeLabel: string;
    scenarioId: string;
    scenarioLabel: string;
    roleFrameId: string;
    roleFrameLabel: string;
    intent: string;
    tone: string;
    constraint: string;
    label: string;
    detail: string;
    topicLine: string;
};

export type BattleQuickMatchScenarioContext = {
    topicLine: string;
    topicPrompt: string;
    domainLabel: string;
    subthemeLabel: string;
    scenarioLabel: string;
    roleFrameLabel: string;
    intent: string;
};

type BattleQuickMatchSubtheme = {
    id: string;
    label: string;
};

type BattleQuickMatchDomain = {
    id: string;
    label: string;
    subthemes: BattleQuickMatchSubtheme[];
};

type BattleQuickMatchScenario = {
    id: string;
    label: string;
    intent: "clarify" | "reschedule" | "request" | "apologize" | "coordinate" | "suggest" | "follow_up" | "confirm" | "refuse";
    promptTemplate: string;
    tone: string;
    constraint: string;
};

type BattleQuickMatchRoleFrame = {
    id: string;
    relation: string;
    position: string;
    label: string;
    detail: string;
    minElo: number;
};

type BattleQuickMatchHistory = {
    topicIds: string[];
    domainIds: string[];
    subthemeIds: string[];
    scenarioIds: string[];
    roleFrameIds: string[];
    intents: string[];
};

const QUICKMATCH_TOPIC_HISTORY_KEY = "battle.quickmatch.recent-topic-ids.v3";
const QUICKMATCH_DOMAIN_HISTORY_KEY = "battle.quickmatch.recent-domain-ids.v3";
const QUICKMATCH_SUBTHEME_HISTORY_KEY = "battle.quickmatch.recent-subtheme-ids.v1";
const QUICKMATCH_SCENARIO_HISTORY_KEY = "battle.quickmatch.recent-scenario-ids.v1";
const QUICKMATCH_ROLE_FRAME_HISTORY_KEY = "battle.quickmatch.recent-role-frame-ids.v1";
const QUICKMATCH_INTENT_HISTORY_KEY = "battle.quickmatch.recent-intents.v1";

const QUICKMATCH_TOPIC_WINDOW = 32;
const QUICKMATCH_DOMAIN_WINDOW = 8;
const QUICKMATCH_SUBTHEME_WINDOW = 5;
const QUICKMATCH_SCENARIO_WINDOW = 4;
const QUICKMATCH_ROLE_FRAME_WINDOW = 4;
const QUICKMATCH_INTENT_WINDOW = 3;

const QUICKMATCH_DOMAINS: BattleQuickMatchDomain[] = [
    { id: "daily-life", label: "日常生活", subthemes: [{ id: "home-routines", label: "居家安排" }, { id: "daily-errands", label: "日常跑腿" }, { id: "shared-space", label: "共享空间" }, { id: "personal-plans", label: "个人计划" }] },
    { id: "social-relations", label: "社交关系", subthemes: [{ id: "friend-catchups", label: "朋友相聚" }, { id: "group-invites", label: "群体邀约" }, { id: "casual-boundaries", label: "礼貌边界" }, { id: "social-followups", label: "事后跟进" }] },
    { id: "family-home", label: "家庭亲密", subthemes: [{ id: "shared-errands", label: "家庭分工" }, { id: "schedule-checkins", label: "时间确认" }, { id: "household-needs", label: "居家需求" }, { id: "care-reminders", label: "照顾提醒" }] },
    { id: "education-learning", label: "学习教育", subthemes: [{ id: "classroom-participation", label: "课堂互动" }, { id: "group-projects", label: "小组作业" }, { id: "campus-admin", label: "校园行政" }, { id: "study-planning", label: "学习安排" }] },
    { id: "workplace-career", label: "职场工作", subthemes: [{ id: "meeting-rhythm", label: "会议协作" }, { id: "deadline-adjustments", label: "排期调整" }, { id: "cross-team-updates", label: "跨组沟通" }, { id: "task-handoffs", label: "任务交接" }] },
    { id: "business-communication", label: "商务沟通", subthemes: [{ id: "client-requests", label: "客户需求" }, { id: "proposal-review", label: "方案确认" }, { id: "vendor-alignment", label: "供应商对齐" }, { id: "contract-followup", label: "合同跟进" }] },
    { id: "travel-transport", label: "出行旅行", subthemes: [{ id: "airport-pickups", label: "机场接送" }, { id: "hotel-arrivals", label: "酒店入住" }, { id: "route-checks", label: "路线确认" }, { id: "delay-handling", label: "延误处理" }] },
    { id: "city-living", label: "居住城市", subthemes: [{ id: "commute-plans", label: "通勤安排" }, { id: "building-issues", label: "楼宇事务" }, { id: "local-services", label: "本地服务" }, { id: "neighborhood-activity", label: "社区活动" }] },
    { id: "food-consumer", label: "饮食消费", subthemes: [{ id: "restaurant-orders", label: "点单沟通" }, { id: "reservation-changes", label: "订位调整" }, { id: "product-choices", label: "商品选择" }, { id: "service-feedback", label: "服务反馈" }] },
    { id: "health-medical", label: "健康医疗", subthemes: [{ id: "appointments", label: "预约安排" }, { id: "symptom-checks", label: "症状说明" }, { id: "care-followups", label: "复诊跟进" }, { id: "wellness-advice", label: "健康建议" }] },
    { id: "mental-emotion", label: "心理情绪", subthemes: [{ id: "stress-checkins", label: "压力沟通" }, { id: "encouragement", label: "情绪支持" }, { id: "set-boundaries", label: "情绪边界" }, { id: "reflection", label: "自我反思" }] },
    { id: "tech-ai", label: "科技与AI", subthemes: [{ id: "tool-setup", label: "工具设置" }, { id: "feature-questions", label: "功能咨询" }, { id: "bug-followups", label: "问题跟进" }, { id: "workflow-updates", label: "流程优化" }] },
    { id: "science-research", label: "科学研究", subthemes: [{ id: "lab-coordination", label: "实验协调" }, { id: "data-checks", label: "数据确认" }, { id: "paper-feedback", label: "论文反馈" }, { id: "research-planning", label: "研究安排" }] },
    { id: "media-communication", label: "媒体传播", subthemes: [{ id: "content-scheduling", label: "内容排期" }, { id: "audience-feedback", label: "受众反馈" }, { id: "message-framing", label: "信息表达" }, { id: "publication-followup", label: "发布跟进" }] },
    { id: "culture-history", label: "文化历史", subthemes: [{ id: "museum-guides", label: "博物馆导览" }, { id: "exhibition-events", label: "展览活动" }, { id: "city-memory", label: "城市记忆" }, { id: "heritage-discussion", label: "文保讨论" }] },
    { id: "entertainment-film", label: "娱乐影视", subthemes: [{ id: "screening-plans", label: "观影安排" }, { id: "show-feedback", label: "观后反馈" }, { id: "casting-discussion", label: "角色讨论" }, { id: "release-followup", label: "上映跟进" }] },
    { id: "music-arts", label: "音乐艺术", subthemes: [{ id: "rehearsal-adjustment", label: "排练调整" }, { id: "performance-setup", label: "演出准备" }, { id: "gallery-visits", label: "画廊参观" }, { id: "creative-feedback", label: "作品反馈" }] },
    { id: "sports-fitness", label: "体育竞技", subthemes: [{ id: "training-plans", label: "训练安排" }, { id: "team-coordination", label: "团队配合" }, { id: "match-followup", label: "赛后跟进" }, { id: "fitness-checkins", label: "健身打卡" }] },
    { id: "finance-economy", label: "经济金融", subthemes: [{ id: "budget-checks", label: "预算确认" }, { id: "payment-issues", label: "支付问题" }, { id: "expense-updates", label: "报销跟进" }, { id: "market-briefs", label: "行情简报" }] },
    { id: "society-governance", label: "社会治理", subthemes: [{ id: "community-rules", label: "社区规则" }, { id: "public-feedback", label: "公众反馈" }, { id: "policy-explanation", label: "政策说明" }, { id: "service-coordination", label: "服务协调" }] },
    { id: "law-ethics", label: "法律伦理", subthemes: [{ id: "compliance-checks", label: "合规确认" }, { id: "rights-questions", label: "权利咨询" }, { id: "case-clarification", label: "案例澄清" }, { id: "ethics-review", label: "伦理讨论" }] },
    { id: "environment-climate", label: "环境气候", subthemes: [{ id: "weather-changes", label: "天气变化" }, { id: "sustainability-actions", label: "环保行动" }, { id: "field-observations", label: "现场观察" }, { id: "resource-planning", label: "资源安排" }] },
    { id: "public-service", label: "公共服务", subthemes: [{ id: "counter-services", label: "窗口办事" }, { id: "document-topups", label: "材料补交" }, { id: "queue-guidance", label: "排队引导" }, { id: "reservation-shifts", label: "预约调整" }] },
    { id: "personal-growth", label: "个人成长", subthemes: [{ id: "habit-adjustments", label: "习惯调整" }, { id: "goal-checkins", label: "目标复盘" }, { id: "time-planning", label: "时间管理" }, { id: "learning-reflection", label: "成长反思" }] },
    { id: "lifestyle", label: "生活方式", subthemes: [{ id: "weekend-plans", label: "周末安排" }, { id: "routine-upgrades", label: "日常优化" }, { id: "home-comfort", label: "生活舒适度" }, { id: "personal-preferences", label: "偏好讨论" }] },
    { id: "hobbies-interest", label: "休闲兴趣", subthemes: [{ id: "club-events", label: "兴趣活动" }, { id: "gear-choices", label: "器材选择" }, { id: "practice-sharing", label: "练习交流" }, { id: "casual-invites", label: "随性邀约" }] },
    { id: "online-shopping", label: "网购与服务", subthemes: [{ id: "order-changes", label: "订单修改" }, { id: "delivery-issues", label: "配送异常" }, { id: "return-requests", label: "退换沟通" }, { id: "seller-followups", label: "商家跟进" }] },
    { id: "communication-conflict", label: "沟通冲突", subthemes: [{ id: "misunderstanding-repair", label: "误会修复" }, { id: "tone-adjustments", label: "语气调整" }, { id: "boundary-restate", label: "重申边界" }, { id: "cooldown-followup", label: "冷静跟进" }] },
    { id: "planning-management", label: "计划管理", subthemes: [{ id: "priority-sorting", label: "优先级排序" }, { id: "timeline-checks", label: "时间线确认" }, { id: "capacity-review", label: "资源盘点" }, { id: "handover-planning", label: "交接规划" }] },
    { id: "future-trends", label: "未来趋势", subthemes: [{ id: "new-ideas", label: "新趋势讨论" }, { id: "prediction-checks", label: "预测判断" }, { id: "impact-review", label: "影响评估" }, { id: "next-moves", label: "下一步推演" }] },
    { id: "housing-renting", label: "房屋租住", subthemes: [{ id: "viewing-schedule", label: "看房安排" }, { id: "lease-questions", label: "租约确认" }, { id: "repair-followup", label: "维修跟进" }, { id: "roommate-coordination", label: "室友协调" }] },
    { id: "pets-care", label: "宠物照护", subthemes: [{ id: "feeding-reminders", label: "喂养提醒" }, { id: "vet-visits", label: "看诊安排" }, { id: "walk-schedule", label: "遛宠安排" }, { id: "pet-services", label: "宠物服务" }] },
    { id: "digital-products", label: "数码产品", subthemes: [{ id: "device-setup", label: "设备设置" }, { id: "account-recovery", label: "账号找回" }, { id: "accessory-choice", label: "配件选择" }, { id: "feature-comparison", label: "功能比较" }] },
    { id: "online-collaboration", label: "线上协作", subthemes: [{ id: "async-updates", label: "异步同步" }, { id: "file-handovers", label: "文件交接" }, { id: "meeting-links", label: "会议链接" }, { id: "status-clarity", label: "状态澄清" }] },
    { id: "content-creation", label: "内容创作", subthemes: [{ id: "draft-feedback", label: "草稿反馈" }, { id: "posting-schedule", label: "发布时间" }, { id: "brand-tone", label: "风格统一" }, { id: "asset-requests", label: "素材需求" }] },
    { id: "weather-outdoor", label: "天气出行", subthemes: [{ id: "rain-plans", label: "下雨备选" }, { id: "heat-adjustments", label: "高温调整" }, { id: "outdoor-events", label: "户外活动" }, { id: "safety-checks", label: "安全确认" }] },
    { id: "public-events", label: "公共活动", subthemes: [{ id: "entry-flow", label: "入场安排" }, { id: "volunteer-shifts", label: "志愿者排班" }, { id: "speaker-timing", label: "环节时间" }, { id: "crowd-guidance", label: "人流引导" }] },
    { id: "consumer-rights", label: "消费维权", subthemes: [{ id: "refund-escalation", label: "退款升级" }, { id: "warranty-questions", label: "保修咨询" }, { id: "service-complaints", label: "服务投诉" }, { id: "evidence-checks", label: "凭证确认" }] },
];

const QUICKMATCH_SCENARIOS: BattleQuickMatchScenario[] = [
    { id: "confirm-info", label: "信息确认", intent: "clarify", promptTemplate: "你要先确认 {subtheme} 里的关键信息，避免双方理解不同。", tone: "clear, natural, cooperative", constraint: "keep it easy to follow in spoken English" },
    { id: "adjust-time", label: "临时改期", intent: "reschedule", promptTemplate: "你想就 {subtheme} 临时改一下时间，但对方已经按原计划做了准备。", tone: "polite, flexible, realistic", constraint: "do not sound abrupt or demanding" },
    { id: "request-help", label: "请求帮助", intent: "request", promptTemplate: "你在 {subtheme} 里需要对方帮一个具体的小忙。", tone: "friendly, direct, spoken", constraint: "make the request specific without sounding stiff" },
    { id: "apologize-fix", label: "道歉补救", intent: "apologize", promptTemplate: "你需要为 {subtheme} 里的小问题道歉，并顺手给出补救办法。", tone: "calm, accountable, natural", constraint: "keep the apology short and believable" },
    { id: "coordinate-people", label: "多方协调", intent: "coordinate", promptTemplate: "你要围绕 {subtheme} 协调两边或多边，让安排继续往前走。", tone: "steady, practical, spoken", constraint: "there is mild friction, but no dramatic conflict" },
    { id: "follow-up", label: "再次跟进", intent: "follow_up", promptTemplate: "你在 {subtheme} 里对之前说过的事做一次自然跟进。", tone: "light, practical, low-pressure", constraint: "sound like a real follow-up, not a formal reminder" },
    { id: "suggest-improvement", label: "改进建议", intent: "suggest", promptTemplate: "你在 {subtheme} 场景里提出一个可执行的小改进。", tone: "constructive, polite, realistic", constraint: "offer one concrete suggestion, not a speech" },
    { id: "next-step", label: "下一步确认", intent: "confirm", promptTemplate: "你想确认 {subtheme} 接下来谁做什么、什么时候做。", tone: "organized, spoken, collaborative", constraint: "keep the plan clear with one next step" },
    { id: "gentle-refusal", label: "礼貌拒绝", intent: "refuse", promptTemplate: "你需要在 {subtheme} 里礼貌地拒绝一个请求或安排。", tone: "warm, firm, natural", constraint: "protect the relationship while staying clear" },
    { id: "change-explanation", label: "变动说明", intent: "clarify", promptTemplate: "你要解释 {subtheme} 为什么临时有变动，避免对方误解。", tone: "clear, human, spoken", constraint: "include just enough reason, not a full explanation essay" },
    { id: "service-check", label: "服务确认", intent: "confirm", promptTemplate: "你在 {subtheme} 里确认服务细节或交付结果。", tone: "polite, attentive, efficient", constraint: "sound natural for real spoken service communication" },
    { id: "reassure-update", label: "安抚更新", intent: "follow_up", promptTemplate: "你在 {subtheme} 里给出一个带安抚感的最新进展。", tone: "reassuring, steady, spoken", constraint: "reduce tension without sounding theatrical" },
];

const QUICKMATCH_ROLE_FRAMES: BattleQuickMatchRoleFrame[] = [
    { id: "friend-initiator", relation: "朋友", position: "发起方", label: "朋友 / 发起方", detail: "You are starting the exchange with a familiar, casual tone.", minElo: 0 },
    { id: "friend-decliner", relation: "朋友", position: "回应方", label: "朋友 / 回应方", detail: "You are responding to a friend and shaping the tone.", minElo: 0 },
    { id: "family-coordinator", relation: "家人", position: "协调方", label: "家人 / 协调方", detail: "You are helping a family situation move smoothly.", minElo: 0 },
    { id: "student-clarifier", relation: "学生", position: "澄清方", label: "学生 / 澄清方", detail: "You are clarifying a practical issue in a school setting.", minElo: 0 },
    { id: "colleague-initiator", relation: "同事", position: "发起方", label: "同事 / 发起方", detail: "You are opening a work exchange with clear purpose.", minElo: 0 },
    { id: "service-explainer", relation: "工作人员", position: "解释方", label: "工作人员 / 解释方", detail: "You are explaining a service detail in calm spoken English.", minElo: 0 },
    { id: "customer-asker", relation: "顾客", position: "提问方", label: "顾客 / 提问方", detail: "You are asking for practical clarity as a customer or visitor.", minElo: 0 },
    { id: "teammate-follower", relation: "队友", position: "跟进方", label: "队友 / 跟进方", detail: "You are following up after earlier coordination.", minElo: 700 },
    { id: "manager-feedback", relation: "管理者", position: "反馈方", label: "管理者 / 反馈方", detail: "You are responding with moderate authority and practical direction.", minElo: 700 },
    { id: "neighbor-coordinator", relation: "邻居", position: "协调方", label: "邻居 / 协调方", detail: "You are smoothing out a shared-life issue with a neighbor.", minElo: 700 },
    { id: "advisor-suggester", relation: "建议者", position: "建议方", label: "建议者 / 建议方", detail: "You are offering a grounded suggestion rather than just reacting.", minElo: 1400 },
    { id: "organizer-decision", relation: "组织者", position: "决定方", label: "组织者 / 决定方", detail: "You are making a practical call under mild constraints.", minElo: 1400 },
    { id: "mediator-bridge", relation: "协调者", position: "调和方", label: "协调者 / 调和方", detail: "You are balancing multiple sides and lowering friction.", minElo: 2000 },
];

const QUICKMATCH_DOMAIN_MAP = new Map(QUICKMATCH_DOMAINS.map((domain) => [domain.id, domain]));

function randomPick<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)] ?? items[0];
}

function normalizeRecentIds(ids: string[]) {
    return Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
}

function readStoredStringArray(storageKey: string) {
    if (typeof window === "undefined") {
        return [] as string[];
    }

    try {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) return [];

        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];

        return parsed.filter((item): item is string => typeof item === "string");
    } catch {
        return [];
    }
}

function getRoleFramePoolForElo(elo: number) {
    return QUICKMATCH_ROLE_FRAMES.filter((roleFrame) => roleFrame.minElo <= elo);
}

function trimHistory(ids: string[], size: number) {
    return normalizeRecentIds(ids).slice(-size);
}

function chooseFreshCandidates<T extends { id: string }>(items: T[], recentIds: Set<string>) {
    const candidates = items.filter((item) => !recentIds.has(item.id));
    return candidates.length > 0 ? candidates : items;
}

function createQuickMatchTopic(params: {
    domain: BattleQuickMatchDomain;
    subtheme: BattleQuickMatchSubtheme;
    scenario: BattleQuickMatchScenario;
    roleFrame: BattleQuickMatchRoleFrame;
}) {
    const { domain, subtheme, scenario, roleFrame } = params;
    const detail = [
        scenario.promptTemplate.replace(/\{domain\}/g, domain.label).replace(/\{subtheme\}/g, subtheme.label),
        `Tone: ${scenario.tone}.`,
        `Constraint: ${scenario.constraint}.`,
        roleFrame.detail,
    ].join(" ");

    return {
        id: `${domain.id}:${subtheme.id}:${scenario.id}:${roleFrame.id}`,
        domainId: domain.id,
        domainLabel: domain.label,
        subthemeId: subtheme.id,
        subthemeLabel: subtheme.label,
        scenarioId: scenario.id,
        scenarioLabel: scenario.label,
        roleFrameId: roleFrame.id,
        roleFrameLabel: roleFrame.label,
        intent: scenario.intent,
        tone: scenario.tone,
        constraint: scenario.constraint,
        label: `${subtheme.label} · ${scenario.label} · ${roleFrame.label}`,
        detail,
        topicLine: `${domain.label} · ${subtheme.label} · ${scenario.label} · ${roleFrame.label}`,
    } satisfies BattleQuickMatchTopic;
}

function buildScenarioPrompt(topic: BattleQuickMatchTopic, elo: number) {
    const difficulty = buildRebuildSentenceDifficultyProfile(elo);

    return [
        `Domain: ${topic.domainLabel}`,
        `Subtheme: ${topic.subthemeLabel}`,
        `Scenario: ${topic.detail}`,
        `Role Frame: ${topic.roleFrameLabel}`,
        `Intent: ${topic.intent}`,
        `Tone: ${topic.tone}`,
        `Constraint: ${topic.constraint}`,
        `CEFR: ${difficulty.practiceTier.cefr}`,
        `Band Position: ${difficulty.bandPosition}`,
        `Preferred length: ${difficulty.wordWindow.preferredMin}-${difficulty.wordWindow.preferredMax} words`,
        `Hard limit: ${difficulty.wordWindow.hardMin}-${difficulty.wordWindow.hardMax} words`,
        `Complexity guidance: ${difficulty.complexityGuidance}`,
    ].join("\n");
}

function buildCustomScenarioContext(topicLine: string, elo: number): BattleQuickMatchScenarioContext {
    const difficulty = buildRebuildSentenceDifficultyProfile(elo);

    return {
        topicLine,
        topicPrompt: [
            "Domain: 用户自定义主题",
            "Subtheme: 自定义重点",
            `Scenario: Keep the spoken material grounded in "${topicLine}" and make it sound like a real listening moment.`,
            "Role Frame: 由情境自然决定，不要硬拗身份标签。",
            "Intent: match the most plausible communicative goal for the topic",
            "Tone: natural, spoken, realistic",
            "Constraint: do not sound like a textbook prompt or an exercise instruction",
            `CEFR: ${difficulty.practiceTier.cefr}`,
            `Band Position: ${difficulty.bandPosition}`,
            `Preferred length: ${difficulty.wordWindow.preferredMin}-${difficulty.wordWindow.preferredMax} words`,
            `Hard limit: ${difficulty.wordWindow.hardMin}-${difficulty.wordWindow.hardMax} words`,
            `Complexity guidance: ${difficulty.complexityGuidance}`,
        ].join("\n"),
        domainLabel: "用户自定义主题",
        subthemeLabel: "自定义重点",
        scenarioLabel: topicLine,
        roleFrameLabel: "自然情境",
        intent: "custom",
    };
}

export function readBattleQuickMatchHistory(): BattleQuickMatchHistory {
    if (typeof window === "undefined") {
        return {
            topicIds: [],
            domainIds: [],
            subthemeIds: [],
            scenarioIds: [],
            roleFrameIds: [],
            intents: [],
        };
    }

    try {
        return {
            topicIds: trimHistory(readStoredStringArray(QUICKMATCH_TOPIC_HISTORY_KEY), QUICKMATCH_TOPIC_WINDOW),
            domainIds: trimHistory(readStoredStringArray(QUICKMATCH_DOMAIN_HISTORY_KEY), QUICKMATCH_DOMAIN_WINDOW),
            subthemeIds: trimHistory(readStoredStringArray(QUICKMATCH_SUBTHEME_HISTORY_KEY), QUICKMATCH_SUBTHEME_WINDOW),
            scenarioIds: trimHistory(readStoredStringArray(QUICKMATCH_SCENARIO_HISTORY_KEY), QUICKMATCH_SCENARIO_WINDOW),
            roleFrameIds: trimHistory(readStoredStringArray(QUICKMATCH_ROLE_FRAME_HISTORY_KEY), QUICKMATCH_ROLE_FRAME_WINDOW),
            intents: trimHistory(readStoredStringArray(QUICKMATCH_INTENT_HISTORY_KEY), QUICKMATCH_INTENT_WINDOW),
        };
    } catch {
        return {
            topicIds: [],
            domainIds: [],
            subthemeIds: [],
            scenarioIds: [],
            roleFrameIds: [],
            intents: [],
        };
    }
}

export function rememberBattleQuickMatchTopic(topic: BattleQuickMatchTopic) {
    if (typeof window === "undefined") {
        return;
    }

    try {
        const history = readBattleQuickMatchHistory();
        const nextTopicIds = [...history.topicIds.filter((id) => id !== topic.id), topic.id].slice(-QUICKMATCH_TOPIC_WINDOW);
        const nextDomainIds = [...history.domainIds.filter((id) => id !== topic.domainId), topic.domainId].slice(-QUICKMATCH_DOMAIN_WINDOW);
        const nextSubthemeIds = [...history.subthemeIds.filter((id) => id !== topic.subthemeId), topic.subthemeId].slice(-QUICKMATCH_SUBTHEME_WINDOW);
        const nextScenarioIds = [...history.scenarioIds.filter((id) => id !== topic.scenarioId), topic.scenarioId].slice(-QUICKMATCH_SCENARIO_WINDOW);
        const nextRoleFrameIds = [...history.roleFrameIds.filter((id) => id !== topic.roleFrameId), topic.roleFrameId].slice(-QUICKMATCH_ROLE_FRAME_WINDOW);
        const nextIntents = [...history.intents.filter((intent) => intent !== topic.intent), topic.intent].slice(-QUICKMATCH_INTENT_WINDOW);

        window.localStorage.setItem(QUICKMATCH_TOPIC_HISTORY_KEY, JSON.stringify(nextTopicIds));
        window.localStorage.setItem(QUICKMATCH_DOMAIN_HISTORY_KEY, JSON.stringify(nextDomainIds));
        window.localStorage.setItem(QUICKMATCH_SUBTHEME_HISTORY_KEY, JSON.stringify(nextSubthemeIds));
        window.localStorage.setItem(QUICKMATCH_SCENARIO_HISTORY_KEY, JSON.stringify(nextScenarioIds));
        window.localStorage.setItem(QUICKMATCH_ROLE_FRAME_HISTORY_KEY, JSON.stringify(nextRoleFrameIds));
        window.localStorage.setItem(QUICKMATCH_INTENT_HISTORY_KEY, JSON.stringify(nextIntents));
    } catch {
        // Ignore storage failures and keep generation flowing.
    }
}

export function pickBattleQuickMatchTopic(params: {
    elo: number;
    history?: Partial<BattleQuickMatchHistory>;
}) {
    const history = {
        topicIds: params.history?.topicIds ?? [],
        domainIds: params.history?.domainIds ?? [],
        subthemeIds: params.history?.subthemeIds ?? [],
        scenarioIds: params.history?.scenarioIds ?? [],
        roleFrameIds: params.history?.roleFrameIds ?? [],
        intents: params.history?.intents ?? [],
    } satisfies BattleQuickMatchHistory;

    const recentTopicIds = new Set(trimHistory(history.topicIds, QUICKMATCH_TOPIC_WINDOW));
    const recentDomainIds = new Set(trimHistory(history.domainIds, QUICKMATCH_DOMAIN_WINDOW));
    const recentSubthemeIds = new Set(trimHistory(history.subthemeIds, QUICKMATCH_SUBTHEME_WINDOW));
    const recentScenarioIds = new Set(trimHistory(history.scenarioIds, QUICKMATCH_SCENARIO_WINDOW));
    const recentRoleFrameIds = new Set(trimHistory(history.roleFrameIds, QUICKMATCH_ROLE_FRAME_WINDOW));
    const recentIntents = new Set(trimHistory(history.intents, QUICKMATCH_INTENT_WINDOW));

    const domainPool = chooseFreshCandidates(QUICKMATCH_DOMAINS, recentDomainIds);
    const domain = randomPick(domainPool);

    const subthemePool = chooseFreshCandidates(domain.subthemes, recentSubthemeIds);
    const subtheme = randomPick(subthemePool);

    const roleFramePool = getRoleFramePoolForElo(params.elo);
    const freshIntentScenarios = QUICKMATCH_SCENARIOS.filter(
        (scenario) => !recentScenarioIds.has(scenario.id) && !recentIntents.has(scenario.intent),
    );
    const scenarioPool = freshIntentScenarios.length > 0
        ? freshIntentScenarios
        : chooseFreshCandidates(QUICKMATCH_SCENARIOS, recentScenarioIds);
    const scenario = randomPick(scenarioPool);

    const freshRoleFrames = roleFramePool.filter((roleFrame) => !recentRoleFrameIds.has(roleFrame.id));
    const roleFrame = randomPick(freshRoleFrames.length > 0 ? freshRoleFrames : roleFramePool);

    const selectedTopic = createQuickMatchTopic({
        domain,
        subtheme,
        scenario,
        roleFrame,
    });

    if (!recentTopicIds.has(selectedTopic.id)) {
        return selectedTopic;
    }

    const fallbackTopics: BattleQuickMatchTopic[] = [];
    domain.subthemes.forEach((candidateSubtheme) => {
        QUICKMATCH_SCENARIOS.forEach((candidateScenario) => {
            roleFramePool.forEach((candidateRoleFrame) => {
                const topic = createQuickMatchTopic({
                    domain,
                    subtheme: candidateSubtheme,
                    scenario: candidateScenario,
                    roleFrame: candidateRoleFrame,
                });
                if (!recentTopicIds.has(topic.id)) {
                    fallbackTopics.push(topic);
                }
            });
        });
    });

    return randomPick(fallbackTopics.length > 0 ? fallbackTopics : [selectedTopic]);
}

export function resolveBattleScenarioContext(topic?: string | null, elo = 1000): BattleQuickMatchScenarioContext {
    const normalized = topic?.trim() ?? "";
    if (normalized && normalized !== RANDOM_SCENARIO_TOPIC) {
        return buildCustomScenarioContext(normalized, elo);
    }

    const selected = pickBattleQuickMatchTopic({
        elo,
        history: readBattleQuickMatchHistory(),
    });
    rememberBattleQuickMatchTopic(selected);

    return {
        topicLine: selected.topicLine,
        topicPrompt: buildScenarioPrompt(selected, elo),
        domainLabel: selected.domainLabel,
        subthemeLabel: selected.subthemeLabel,
        scenarioLabel: selected.scenarioLabel,
        roleFrameLabel: selected.roleFrameLabel,
        intent: selected.intent,
    };
}

export function resolveBattleScenarioTopic(topic?: string | null, elo = 1000) {
    return resolveBattleScenarioContext(topic, elo).topicLine;
}

export function getBattleQuickMatchDomainLabels() {
    return QUICKMATCH_DOMAINS.map((domain) => domain.label);
}

export function getBattleQuickMatchPoolSize(elo = 1000) {
    const roleFramePool = getRoleFramePoolForElo(elo);
    return QUICKMATCH_DOMAINS.reduce(
        (sum, domain) => sum + domain.subthemes.length * QUICKMATCH_SCENARIOS.length * roleFramePool.length,
        0,
    );
}

export function getBattleQuickMatchDomainById(domainId: string) {
    return QUICKMATCH_DOMAIN_MAP.get(domainId) ?? null;
}
