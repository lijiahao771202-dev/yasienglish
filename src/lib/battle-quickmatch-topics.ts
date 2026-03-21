export const RANDOM_SCENARIO_TOPIC = "Random Scenario" as const;

export type BattleQuickMatchTopic = {
    id: string;
    domainId: string;
    domainLabel: string;
    label: string;
    detail: string;
    topicLine: string;
};

type BattleQuickMatchScene = {
    id: string;
    label: string;
    detailTemplate: string;
};

type BattleQuickMatchDomain = {
    id: string;
    label: string;
};

type BattleQuickMatchViewpoint = {
    id: string;
    label: string;
    detail: string;
    minElo: number;
};

type BattleQuickMatchHistory = {
    topicIds: string[];
    domainIds: string[];
};

const QUICKMATCH_TOPIC_HISTORY_KEY = "battle.quickmatch.recent-topic-ids.v2";
const QUICKMATCH_DOMAIN_HISTORY_KEY = "battle.quickmatch.recent-domain-ids.v2";
const QUICKMATCH_TOPIC_WINDOW = 32;
const QUICKMATCH_DOMAIN_WINDOW = 8;

const QUICKMATCH_DOMAINS: BattleQuickMatchDomain[] = [
    { id: "daily-life", label: "日常生活" },
    { id: "social-relations", label: "社交关系" },
    { id: "family-home", label: "家庭亲密" },
    { id: "education-learning", label: "学习教育" },
    { id: "workplace-career", label: "职场工作" },
    { id: "business-communication", label: "商务沟通" },
    { id: "travel-transport", label: "出行旅行" },
    { id: "city-living", label: "居住城市" },
    { id: "food-consumer", label: "饮食消费" },
    { id: "health-medical", label: "健康医疗" },
    { id: "mental-emotion", label: "心理情绪" },
    { id: "tech-ai", label: "科技与AI" },
    { id: "science-research", label: "科学研究" },
    { id: "media-communication", label: "媒体传播" },
    { id: "culture-history", label: "文化历史" },
    { id: "entertainment-film", label: "娱乐影视" },
    { id: "music-arts", label: "音乐艺术" },
    { id: "sports-fitness", label: "体育竞技" },
    { id: "finance-economy", label: "经济金融" },
    { id: "society-governance", label: "社会治理" },
    { id: "law-ethics", label: "法律伦理" },
    { id: "environment-climate", label: "环境气候" },
    { id: "public-service", label: "公共服务" },
    { id: "personal-growth", label: "个人成长" },
    { id: "lifestyle", label: "生活方式" },
    { id: "hobbies-interest", label: "休闲兴趣" },
    { id: "online-shopping", label: "网购与服务" },
    { id: "communication-conflict", label: "沟通冲突" },
    { id: "planning-management", label: "计划管理" },
    { id: "future-trends", label: "未来趋势" },
];

const QUICKMATCH_SCENES: BattleQuickMatchScene[] = [
    { id: "adjust-time", label: "临时改期", detailTemplate: "围绕 {domain} 的安排需要临时调整时间。" },
    { id: "confirm-info", label: "信息确认", detailTemplate: "先确认 {domain} 相关的关键信息，避免误解。" },
    { id: "slight-delay", label: "轻微迟到", detailTemplate: "面对 {domain} 场景里的轻微迟到，给出自然解释。" },
    { id: "ask-help", label: "请求帮助", detailTemplate: "在 {domain} 场景里主动提出帮助或求助。" },
    { id: "apologize", label: "道歉说明", detailTemplate: "为 {domain} 中的小问题礼貌道歉并说明原因。" },
    { id: "negotiate", label: "小型协商", detailTemplate: "围绕 {domain} 的条件进行小幅协商。" },
    { id: "reorganize", label: "重新安排", detailTemplate: "把 {domain} 相关事项重新排布。" },
    { id: "coordinate", label: "任务协调", detailTemplate: "对 {domain} 任务进行分工或协调。" },
    { id: "feedback", label: "反馈回应", detailTemplate: "回应 {domain} 里的反馈或建议。" },
    { id: "clarify", label: "误会澄清", detailTemplate: "澄清 {domain} 场景里的误会或偏差。" },
    { id: "boundary", label: "边界说明", detailTemplate: "在 {domain} 场景中设定边界，但保持礼貌。" },
    { id: "progress", label: "进度更新", detailTemplate: "更新 {domain} 相关进度。" },
    { id: "compare", label: "方案比较", detailTemplate: "比较 {domain} 场景下的两个方案。" },
    { id: "risk", label: "风险提醒", detailTemplate: "提醒 {domain} 场景中的潜在风险。" },
    { id: "multi-party", label: "多方协调", detailTemplate: "协调 {domain} 场景中多个相关方。" },
    { id: "intro", label: "身份说明", detailTemplate: "从 {domain} 场景里快速做一个自我介绍或身份说明。" },
    { id: "urgent", label: "紧急处理", detailTemplate: "在 {domain} 场景里处理紧急但不至于失控的问题。" },
    { id: "review", label: "结果复盘", detailTemplate: "复盘 {domain} 场景中的结果和原因。" },
    { id: "quality", label: "质量评价", detailTemplate: "评价 {domain} 场景中的质量、体验或效果。" },
    { id: "follow-up", label: "再次跟进", detailTemplate: "再次跟进 {domain} 场景中的未决事项。" },
    { id: "improve", label: "改进建议", detailTemplate: "提出 {domain} 场景的改进建议。" },
    { id: "close", label: "自然收尾", detailTemplate: "用一句自然的感谢或收尾结束 {domain} 场景。" },
    { id: "change", label: "突发变动", detailTemplate: "应对 {domain} 场景里的突发变化。" },
    { id: "limited-resources", label: "资源不足", detailTemplate: "在 {domain} 场景中面对资源不足时继续推进。" },
    { id: "next-step", label: "下一步确认", detailTemplate: "确认 {domain} 场景接下来的计划和下一步。" },
];

const QUICKMATCH_VIEWPOINTS: BattleQuickMatchViewpoint[] = [
    { id: "first-person", label: "当事人", detail: "Speak as the person directly involved.", minElo: 0 },
    { id: "other-side", label: "对方", detail: "Speak from the other person's side.", minElo: 0 },
    { id: "service-side", label: "服务方", detail: "Speak as the clerk, staff, or helper.", minElo: 0 },
    { id: "bystander", label: "旁观者", detail: "Describe the situation from outside.", minElo: 0 },
    { id: "newcomer", label: "新手", detail: "React as someone who is just figuring things out.", minElo: 0 },
    { id: "experienced", label: "熟手", detail: "Respond as someone who has handled this before.", minElo: 0 },
    { id: "advisor", label: "建议者", detail: "Explain how to handle the situation.", minElo: 700 },
    { id: "manager", label: "管理者", detail: "Respond with decision-making authority.", minElo: 700 },
    { id: "mediator", label: "协调者", detail: "Bridge both sides and reduce tension.", minElo: 700 },
    { id: "reviewer", label: "复盘者", detail: "Look back and summarize what happened.", minElo: 700 },
    { id: "analyst", label: "分析者", detail: "Explain cause, effect, and tradeoffs.", minElo: 1400 },
    { id: "strategist", label: "策略者", detail: "Choose the best route under constraints.", minElo: 1400 },
    { id: "boundary-keeper", label: "边界守护者", detail: "Keep the tone calm while protecting limits.", minElo: 1400 },
    { id: "problem-solver", label: "问题解决者", detail: "Focus on practical next actions.", minElo: 1400 },
    { id: "decision-maker", label: "决策者", detail: "Make a final judgment under uncertainty.", minElo: 2000 },
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

function getViewpointPoolForElo(elo: number) {
    if (elo < 700) {
        return QUICKMATCH_VIEWPOINTS.filter((viewpoint) => viewpoint.minElo <= 0);
    }

    if (elo < 1400) {
        return QUICKMATCH_VIEWPOINTS.filter((viewpoint) => viewpoint.minElo <= 700);
    }

    if (elo < 2000) {
        return QUICKMATCH_VIEWPOINTS.filter((viewpoint) => viewpoint.minElo <= 1400);
    }

    return QUICKMATCH_VIEWPOINTS;
}

function buildTopicPool(domainIds: string[], viewpointPool: BattleQuickMatchViewpoint[]) {
    const domainSet = new Set(domainIds);
    const domains = QUICKMATCH_DOMAINS.filter((domain) => domainSet.has(domain.id));
    const combos: BattleQuickMatchTopic[] = [];

    domains.forEach((domain) => {
        QUICKMATCH_SCENES.forEach((scene) => {
            const sceneDetail = scene.detailTemplate.replace(/\{domain\}/g, domain.label);
            viewpointPool.forEach((viewpoint) => {
                combos.push({
                    id: `${domain.id}:${scene.id}:${viewpoint.id}`,
                    domainId: domain.id,
                    domainLabel: domain.label,
                    label: `${scene.label} · ${viewpoint.label}`,
                    detail: `${sceneDetail} ${viewpoint.detail}`,
                    topicLine: `${domain.label} · ${scene.label} · ${viewpoint.label}`,
                });
            });
        });
    });

    return combos;
}

export function readBattleQuickMatchHistory(): BattleQuickMatchHistory {
    if (typeof window === "undefined") {
        return { topicIds: [], domainIds: [] };
    }

    try {
        const topicIds = normalizeRecentIds(readStoredStringArray(QUICKMATCH_TOPIC_HISTORY_KEY));
        const domainIds = normalizeRecentIds(readStoredStringArray(QUICKMATCH_DOMAIN_HISTORY_KEY));
        return {
            topicIds: topicIds.slice(-QUICKMATCH_TOPIC_WINDOW),
            domainIds: domainIds.slice(-QUICKMATCH_DOMAIN_WINDOW),
        };
    } catch {
        return { topicIds: [], domainIds: [] };
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
        window.localStorage.setItem(QUICKMATCH_TOPIC_HISTORY_KEY, JSON.stringify(nextTopicIds));
        window.localStorage.setItem(QUICKMATCH_DOMAIN_HISTORY_KEY, JSON.stringify(nextDomainIds));
    } catch {
        // Ignore storage failures and keep generation flowing.
    }
}

export function pickBattleQuickMatchTopic(params: {
    elo: number;
    history?: BattleQuickMatchHistory;
}) {
    const history = params.history ?? { topicIds: [], domainIds: [] };
    const viewpointPool = getViewpointPoolForElo(params.elo);
    const recentTopicIds = new Set(normalizeRecentIds(history.topicIds).slice(-QUICKMATCH_TOPIC_WINDOW));
    const recentDomainIds = new Set(normalizeRecentIds(history.domainIds).slice(-QUICKMATCH_DOMAIN_WINDOW));

    const domainCandidates = QUICKMATCH_DOMAINS.filter((domain) => !recentDomainIds.has(domain.id));
    const domainPool = domainCandidates.length > 0 ? domainCandidates : QUICKMATCH_DOMAINS;
    const chosenDomain = randomPick(domainPool);

    const topicPool = buildTopicPool([chosenDomain.id], viewpointPool);
    const topicCandidates = topicPool.filter((topic) => !recentTopicIds.has(topic.id));
    const chosenTopic = randomPick(topicCandidates.length > 0 ? topicCandidates : topicPool);

    return chosenTopic;
}

export function resolveBattleScenarioTopic(topic?: string | null, elo = 1000) {
    const normalized = topic?.trim() ?? "";
    if (normalized && normalized !== RANDOM_SCENARIO_TOPIC) {
        return normalized;
    }

    const selected = pickBattleQuickMatchTopic({
        elo,
        history: readBattleQuickMatchHistory(),
    });
    rememberBattleQuickMatchTopic(selected);
    return selected.topicLine;
}

export function getBattleQuickMatchDomainLabels() {
    return QUICKMATCH_DOMAINS.map((domain) => domain.label);
}

export function getBattleQuickMatchPoolSize(elo = 1000) {
    const viewpointPool = getViewpointPoolForElo(elo);
    return QUICKMATCH_DOMAINS.length * QUICKMATCH_SCENES.length * viewpointPool.length;
}

export function getBattleQuickMatchDomainById(domainId: string) {
    return QUICKMATCH_DOMAIN_MAP.get(domainId) ?? null;
}
