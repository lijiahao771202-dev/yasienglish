import { getCatRankTier } from "@/lib/cat-score";

export type TopicDifficulty = "cet4" | "cet6" | "ielts";

export interface TopicSelection {
    source: "user" | "random";
    domainId: string;
    domainLabel: string;
    subtopicId: string;
    subtopicLabel: string;
    angle: string;
    topicLine: string;
}

type TopicSubtopic = {
    id: string;
    label: string;
    angles: string[];
};

type TopicDomain = {
    id: string;
    label: string;
    subtopics: TopicSubtopic[];
};

type TopicCombo = {
    key: string;
    domain: TopicDomain;
    subtopic: TopicSubtopic;
    angle: string;
};

type TopicChannel = "ai_gen" | "cat";

type TopicHistory = {
    comboKeys: string[];
    subtopicKeys: string[];
    domainIds: string[];
    topicLines: string[];
};

const TOPIC_DOMAINS: TopicDomain[] = [
    {
        id: "economy",
        label: "经济与商业",
        subtopics: [
            { id: "money-policy", label: "货币与通胀", angles: ["How inflation changes student spending decisions", "Why interest-rate changes do not affect all households equally", "Digital payments and everyday money behavior"] },
            { id: "employment", label: "就业与失业结构", angles: ["How AI reshapes entry-level job demand", "Why structural unemployment is harder than cyclical unemployment", "Reskilling pathways for graduates in a shifting labor market"] },
            { id: "platform-economy", label: "平台经济", angles: ["Convenience versus labor rights in platform work", "How recommendation systems affect small business visibility", "When platform growth creates market concentration risks"] },
            { id: "supply-chain", label: "供应链", angles: ["Why supply-chain resilience matters after disruptions", "Cost versus resilience in inventory strategy", "How local production and global sourcing can be balanced"] },
            { id: "consumer-behavior", label: "消费行为", angles: ["Why consumers downshift spending under uncertainty", "How social media influences purchase timing", "Price sensitivity across essential and non-essential goods"] },
            { id: "startup-finance", label: "创业与融资", angles: ["Why early-stage startups fail despite strong ideas", "How funding cycles change innovation priorities", "Tradeoffs between fast growth and sustainable operations"] },
        ],
    },
    {
        id: "technology-ai",
        label: "科技与AI",
        subtopics: [
            { id: "ai-learning", label: "AI辅助学习", angles: ["When AI improves learning efficiency and when it weakens deep understanding", "How to design prompts that support critical thinking", "Balancing AI convenience with independent practice"] },
            { id: "ai-workflow", label: "人机协作", angles: ["Which tasks are best split between humans and AI", "How to prevent automation bias in decision workflows", "Why review loops matter in AI-assisted output"] },
            { id: "privacy", label: "数据隐私", angles: ["What users trade away for personalization", "How consent design shapes privacy behavior", "Practical privacy habits for students and workers"] },
            { id: "algorithm-fairness", label: "算法公平", angles: ["How biased data produces unequal outcomes", "Why fairness metrics can conflict with each other", "Governance approaches for high-stakes algorithms"] },
            { id: "digital-divide", label: "数字鸿沟", angles: ["How access gaps create long-term skill inequality", "Device quality versus internet access in learning outcomes", "Policy tools to narrow digital inequality"] },
            { id: "ai-governance", label: "AI治理", angles: ["Hard rules versus principle-based regulation", "How sector-specific rules can reduce compliance burden", "Cross-border challenges in AI policy coordination"] },
        ],
    },
    {
        id: "education",
        label: "教育与学习",
        subtopics: [
            { id: "study-method", label: "学习方法", angles: ["Spaced repetition versus massed practice", "How retrieval practice improves long-term memory", "Why reflection logs increase learning transfer"] },
            { id: "exam-fairness", label: "考试公平", angles: ["How test design affects opportunity equity", "Standardization benefits and blind spots", "Balancing reliability and real-world validity"] },
            { id: "online-learning", label: "在线学习", angles: ["Why completion rates drop in self-paced courses", "How peer interaction changes motivation in online programs", "Designing low-friction feedback loops for remote learners"] },
            { id: "attention-control", label: "注意力管理", angles: ["Context switching costs in study sessions", "How notification hygiene impacts deep work", "Planning routines that protect focus blocks"] },
            { id: "lifelong-learning", label: "终身学习", angles: ["Why adult learners need different curriculum pacing", "Skill stacking for long-term career resilience", "How micro-credentials influence hiring signals"] },
            { id: "edu-technology", label: "教育科技", angles: ["When adaptive learning systems truly help", "Risk of over-optimization in personalized learning", "Teacher roles in AI-enabled classrooms"] },
        ],
    },
    {
        id: "psychology",
        label: "心理与行为",
        subtopics: [
            { id: "habit", label: "习惯养成", angles: ["Cue-routine-reward loops in daily study", "Why tiny habits outperform dramatic plans", "Habit tracking without obsession"] },
            { id: "procrastination", label: "拖延机制", angles: ["Emotion regulation as a hidden driver of procrastination", "Task framing to reduce avoidance", "How deadlines and accountability interact"] },
            { id: "cognitive-bias", label: "认知偏差", angles: ["Confirmation bias in everyday information choices", "How anchoring distorts judgment under uncertainty", "Debiasing routines for better decisions"] },
            { id: "stress-recovery", label: "压力与恢复", angles: ["Stress performance curve and overtraining risk", "Micro-recovery strategies during high workload weeks", "How sleep debt impairs learning precision"] },
            { id: "motivation", label: "动机设计", angles: ["Intrinsic versus extrinsic motivation in long-term goals", "Why progress visibility sustains effort", "Motivation collapse and restart strategies"] },
            { id: "social-behavior", label: "群体行为", angles: ["How social norms shape individual choices", "Peer effects in learning communities", "Conformity pressure and independent thinking"] },
        ],
    },
    {
        id: "health",
        label: "健康与医学",
        subtopics: [
            { id: "sleep", label: "睡眠科学", angles: ["How sleep architecture supports memory consolidation", "Late-night schedules and cognitive tradeoffs", "Practical sleep routines for exam periods"] },
            { id: "nutrition", label: "营养与饮食", angles: ["Common nutrition myths among students", "Energy stability and meal timing", "How food environments influence health choices"] },
            { id: "exercise", label: "运动行为", angles: ["Minimum effective dose for fitness consistency", "Why adherence matters more than intensity spikes", "Exercise and stress regulation"] },
            { id: "public-health", label: "公共卫生", angles: ["Risk communication during health events", "Prevention behavior and trust", "Community-level interventions and compliance"] },
            { id: "mental-health", label: "心理健康服务", angles: ["Barriers to seeking support in young adults", "Early intervention in campus settings", "Digital mental health tools: promise and limits"] },
            { id: "digital-health", label: "数字医疗", angles: ["Telemedicine access and quality concerns", "Wearable data interpretation pitfalls", "Privacy and consent in health platforms"] },
        ],
    },
    {
        id: "environment",
        label: "环境与气候",
        subtopics: [
            { id: "energy-transition", label: "能源转型", angles: ["Grid reliability during renewable expansion", "Cost pathways in clean energy adoption", "Policy incentives versus market signals"] },
            { id: "extreme-weather", label: "极端天气", angles: ["Urban preparedness for heatwaves and floods", "Risk perception versus actual vulnerability", "Adaptation planning at community scale"] },
            { id: "carbon-market", label: "碳市场", angles: ["How carbon pricing changes business behavior", "Measurement credibility in carbon accounting", "Fairness concerns across sectors"] },
            { id: "waste-system", label: "废弃物管理", angles: ["Why recycling systems often underperform", "Designing reduction-first consumption habits", "Extended producer responsibility and outcomes"] },
            { id: "biodiversity", label: "生态与生物多样性", angles: ["Biodiversity loss and local livelihood risks", "Habitat restoration tradeoffs", "Conservation policy and land-use pressure"] },
            { id: "sustainable-city", label: "可持续城市", angles: ["Transit design for lower emissions", "Compact city model and quality-of-life tradeoffs", "Green space as climate and health infrastructure"] },
        ],
    },
    {
        id: "society-governance",
        label: "社会与治理",
        subtopics: [
            { id: "aging", label: "老龄化", angles: ["How aging changes healthcare and pension pressure", "Intergenerational policy fairness", "Community support models for older adults"] },
            { id: "population-mobility", label: "人口流动", angles: ["Migration and urban service pressure", "How mobility reshapes labor allocation", "Social integration and identity formation"] },
            { id: "public-trust", label: "公共信任", angles: ["Institutional trust and policy compliance", "Why transparency does not always build trust", "Trust repair after public failure"] },
            { id: "local-governance", label: "基层治理", angles: ["Community feedback loops in policy execution", "Street-level implementation gaps", "Data-informed local governance"] },
            { id: "policy-evaluation", label: "政策评估", angles: ["How to detect policy side effects early", "Pilot programs versus full rollout", "Evidence standards in public decisions"] },
            { id: "social-equity", label: "社会公平", angles: ["Targeted support versus universal programs", "Opportunity equality in education and employment", "Measuring fairness in multi-goal policy"] },
        ],
    },
    {
        id: "media-communication",
        label: "媒体与传播",
        subtopics: [
            { id: "misinformation", label: "虚假信息", angles: ["How misinformation spreads faster than corrections", "Practical verification habits for readers", "Platform responsibility in rumor control"] },
            { id: "attention-economy", label: "注意力经济", angles: ["How engagement metrics distort content quality", "Slow media habits for deeper learning", "Designing healthier information diets"] },
            { id: "filter-bubble", label: "信息茧房", angles: ["Recommendation loops and worldview narrowing", "Diversity exposure strategies in news consumption", "Algorithm tuning versus user literacy"] },
            { id: "science-communication", label: "科学传播", angles: ["Translating uncertainty for general audiences", "Why oversimplification creates backlash", "Trust signals in expert communication"] },
            { id: "public-opinion", label: "舆论形成", angles: ["How framing changes policy preference", "Silent majority and visible minority dynamics", "Opinion volatility during crises"] },
            { id: "creator-ecosystem", label: "内容创作者生态", angles: ["Monetization pressure and content integrity", "Audience capture in niche communities", "Sustainability of creator careers"] },
        ],
    },
    {
        id: "culture-history",
        label: "文化与历史",
        subtopics: [
            { id: "heritage", label: "文化遗产", angles: ["Balancing preservation and modern city development", "Heritage commercialization risks", "Community participation in preservation"] },
            { id: "cross-culture", label: "跨文化沟通", angles: ["Hidden assumptions in cross-cultural teamwork", "Pragmatic language differences in professional settings", "Conflict resolution across communication norms"] },
            { id: "language-change", label: "语言演变", angles: ["How digital media accelerates language change", "Borrowed words and identity debates", "Standard language versus regional variation"] },
            { id: "historical-memory", label: "历史记忆", angles: ["How collective memory shapes civic identity", "Competing narratives of the same event", "Education and historical responsibility"] },
            { id: "tradition-modernity", label: "传统与现代", angles: ["Tradition as social resource versus constraint", "Intergenerational negotiation in value change", "How rituals adapt in urban life"] },
            { id: "cultural-industry", label: "文化产业", angles: ["Creative economy and authenticity tension", "Global distribution and local voice", "Platform effects on cultural diversity"] },
        ],
    },
    {
        id: "law-ethics",
        label: "法律与伦理",
        subtopics: [
            { id: "platform-liability", label: "平台责任", angles: ["Content moderation boundaries and free expression", "Liability allocation in user-generated ecosystems", "Appeal mechanisms and procedural fairness"] },
            { id: "labor-rights", label: "劳动权益", angles: ["Algorithmic management and worker autonomy", "Contract flexibility versus social protection", "Gig work protections in evolving regulation"] },
            { id: "data-rights", label: "数据权利", angles: ["Ownership, access, and portability tradeoffs", "Consent fatigue and meaningful choice", "Public value uses of private data"] },
            { id: "ip-innovation", label: "知识产权", angles: ["Patent incentives and innovation diffusion", "Copyright boundaries in AI-generated content", "Open access versus proprietary models"] },
            { id: "bioethics", label: "生物伦理", angles: ["Consent and fairness in genetic data use", "Clinical trial ethics under urgency", "Balancing innovation speed with patient safety"] },
            { id: "tech-ethics", label: "技术伦理", angles: ["Responsibility gaps in autonomous systems", "Ethical review in product release cycles", "Value alignment in high-impact tools"] },
        ],
    },
    {
        id: "city-life",
        label: "城市与生活",
        subtopics: [
            { id: "housing", label: "住房与居住", angles: ["Rent pressure and youth career choices", "Affordable housing policy tradeoffs", "How commute time shapes wellbeing"] },
            { id: "mobility", label: "通勤与交通", angles: ["Transit reliability and job access", "Micromobility and street safety design", "Congestion pricing acceptance and fairness"] },
            { id: "public-space", label: "公共空间", angles: ["How public spaces influence social cohesion", "Designing inclusive shared environments", "Night-time economy and safety governance"] },
            { id: "cost-of-living", label: "生活成本", angles: ["Cost-of-living pressure on learning investment", "Budget adaptation strategies in cities", "Service quality under rising urban costs"] },
            { id: "community", label: "社区网络", angles: ["Weak ties and opportunity access", "Neighborhood trust and resilience", "Volunteer networks in crisis response"] },
            { id: "urban-design", label: "城市设计", angles: ["Walkability and health outcomes", "Mixed-use planning and daily efficiency", "Human-centered design in dense districts"] },
        ],
    },
    {
        id: "career-workplace",
        label: "职场与职业发展",
        subtopics: [
            { id: "skill-transfer", label: "技能迁移", angles: ["How general skills transfer across industries", "Building adaptive competence in uncertain markets", "Portfolio careers and identity stability"] },
            { id: "remote-collab", label: "远程协作", angles: ["Communication friction in distributed teams", "Async versus sync collaboration tradeoffs", "Remote trust building without micromanagement"] },
            { id: "performance", label: "绩效与反馈", angles: ["Frequent feedback versus annual review models", "Metric design and unintended behavior", "How psychological safety influences performance"] },
            { id: "burnout", label: "职业倦怠", angles: ["Systemic causes beyond personal resilience", "Recovery design in high-pressure teams", "Manager practices that reduce burnout risk"] },
            { id: "leadership", label: "领导力", angles: ["Decision clarity under ambiguity", "Delegation and accountability balance", "Leading cross-functional projects effectively"] },
            { id: "career-planning", label: "职业路径", angles: ["Short-term opportunities versus long-term fit", "How to evaluate growth ceilings in a role", "Career pivot strategies with minimal downside"] },
        ],
    },
    {
        id: "research-methods",
        label: "科学与研究方法",
        subtopics: [
            { id: "causal-inference", label: "因果推断", angles: ["Correlation traps in policy interpretation", "When randomized studies are impractical", "Causal claims under observational data"] },
            { id: "sample-bias", label: "样本偏差", angles: ["How sampling bias distorts conclusions", "Selection effects in online data", "Improving representativeness in applied studies"] },
            { id: "replicability", label: "可重复性", angles: ["Replication challenges in social science", "Publication bias and incentive structure", "Transparent methods for stronger credibility"] },
            { id: "uncertainty", label: "不确定性表达", angles: ["How confidence intervals should be communicated", "Risk communication under model uncertainty", "Decision-making with incomplete evidence"] },
            { id: "measurement", label: "测量质量", angles: ["Reliability versus validity in assessment design", "When proxy metrics break down", "Measurement error and policy consequences"] },
            { id: "evidence-hierarchy", label: "证据分层", angles: ["Strength of evidence in fast-changing contexts", "Combining qualitative and quantitative insights", "Evidence thresholds for practical action"] },
        ],
    },
];

const AI_DOMAIN_IDS_BY_DIFFICULTY: Record<TopicDifficulty, string[]> = {
    cet4: ["education", "psychology", "city-life", "health", "technology-ai", "culture-history"],
    cet6: ["education", "psychology", "city-life", "health", "technology-ai", "economy", "media-communication", "career-workplace", "environment"],
    ielts: TOPIC_DOMAINS.map((domain) => domain.id),
};

const ALL_TOPIC_DOMAIN_IDS = TOPIC_DOMAINS.map((domain) => domain.id);

const CAT_DOMAIN_IDS_BY_RANK_ID: Record<string, string[]> = {
    a0: ["education", "psychology", "city-life", "health", "culture-history"],
    a1: ["education", "psychology", "city-life", "health", "culture-history", "technology-ai"],
    a2: ["education", "psychology", "city-life", "health", "culture-history", "technology-ai", "media-communication"],
    b1: ["education", "psychology", "city-life", "health", "culture-history", "technology-ai", "media-communication"],
    b1_plus: ["education", "psychology", "city-life", "health", "culture-history", "technology-ai", "media-communication", "career-workplace"],
    b2_minus: ["education", "psychology", "city-life", "health", "culture-history", "technology-ai", "media-communication", "career-workplace", "environment", "economy"],
    b2: ["education", "psychology", "city-life", "health", "technology-ai", "media-communication", "career-workplace", "environment", "economy"],
    b2_plus: ["education", "psychology", "technology-ai", "media-communication", "career-workplace", "environment", "economy", "society-governance", "city-life"],
    c1_minus: ["education", "psychology", "technology-ai", "media-communication", "career-workplace", "environment", "economy", "society-governance", "culture-history"],
    c1: ["technology-ai", "media-communication", "career-workplace", "environment", "economy", "society-governance", "law-ethics", "education", "psychology"],
    c1_plus: ["technology-ai", "media-communication", "career-workplace", "environment", "economy", "society-governance", "law-ethics", "research-methods", "culture-history", "education"],
    c2_minus: ["economy", "technology-ai", "environment", "society-governance", "law-ethics", "career-workplace", "research-methods", "media-communication", "culture-history"],
    c2: ["economy", "technology-ai", "environment", "society-governance", "law-ethics", "career-workplace", "research-methods", "media-communication", "culture-history", "psychology"],
    c2_plus: ["economy", "technology-ai", "environment", "society-governance", "law-ethics", "career-workplace", "research-methods", "media-communication", "culture-history", "psychology", "education", "health"],
    s1: ["economy", "technology-ai", "environment", "society-governance", "law-ethics", "career-workplace", "research-methods", "media-communication", "culture-history", "psychology", "education", "health", "city-life"],
    s2: ALL_TOPIC_DOMAIN_IDS,
    master: ALL_TOPIC_DOMAIN_IDS,
};

const RECENT_TOPIC_HISTORY: Record<TopicChannel, TopicHistory> = {
    ai_gen: {
        comboKeys: [],
        subtopicKeys: [],
        domainIds: [],
        topicLines: [],
    },
    cat: {
        comboKeys: [],
        subtopicKeys: [],
        domainIds: [],
        topicLines: [],
    },
};

const RECENT_TOPIC_WINDOWS = {
    comboKeys: 36,
    subtopicKeys: 24,
    domainIds: 10,
    topicLines: 24,
} as const;

function randomPick<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)];
}

function pushBounded(list: string[], value: string, limit: number) {
    list.push(value);
    if (list.length > limit) {
        list.splice(0, list.length - limit);
    }
}

function buildTopicLine(combo: TopicCombo) {
    return `${combo.subtopic.label} · ${combo.angle}`;
}

function buildSubtopicKey(combo: TopicCombo) {
    return `${combo.domain.id}:${combo.subtopic.id}`;
}

function rememberTopicCombo(channel: TopicChannel, combo: TopicCombo) {
    const history = RECENT_TOPIC_HISTORY[channel];
    pushBounded(history.comboKeys, combo.key, RECENT_TOPIC_WINDOWS.comboKeys);
    pushBounded(history.subtopicKeys, buildSubtopicKey(combo), RECENT_TOPIC_WINDOWS.subtopicKeys);
    pushBounded(history.domainIds, combo.domain.id, RECENT_TOPIC_WINDOWS.domainIds);
    pushBounded(history.topicLines, normalizeUserTopic(buildTopicLine(combo)), RECENT_TOPIC_WINDOWS.topicLines);
}

function buildCombos(domainIds: string[]) {
    const domainSet = new Set(domainIds);
    const combos: TopicCombo[] = [];
    TOPIC_DOMAINS
        .filter((domain) => domainSet.has(domain.id))
        .forEach((domain) => {
            domain.subtopics.forEach((subtopic) => {
                subtopic.angles.forEach((angle, index) => {
                    combos.push({
                        key: `${domain.id}:${subtopic.id}:${index}`,
                        domain,
                        subtopic,
                        angle,
                    });
                });
            });
        });
    return combos;
}

function normalizeUserTopic(topic: string) {
    return topic.trim().replace(/\s+/g, " ");
}

function pickCandidateCombos(params: {
    combos: TopicCombo[];
    channel: TopicChannel;
    recentTopicLines?: string[];
}) {
    const { combos, channel, recentTopicLines = [] } = params;
    const history = RECENT_TOPIC_HISTORY[channel];
    const recentComboKeys = new Set(history.comboKeys);
    const recentSubtopicKeys = new Set(history.subtopicKeys);
    const recentDomainIds = new Set(history.domainIds);
    const blockedTopicLines = new Set([
        ...history.topicLines,
        ...recentTopicLines.map((topic) => normalizeUserTopic(topic)),
    ]);

    const stages = [
        combos.filter((combo) => !blockedTopicLines.has(normalizeUserTopic(buildTopicLine(combo))) && !recentComboKeys.has(combo.key) && !recentSubtopicKeys.has(buildSubtopicKey(combo)) && !recentDomainIds.has(combo.domain.id)),
        combos.filter((combo) => !blockedTopicLines.has(normalizeUserTopic(buildTopicLine(combo))) && !recentComboKeys.has(combo.key) && !recentSubtopicKeys.has(buildSubtopicKey(combo))),
        combos.filter((combo) => !blockedTopicLines.has(normalizeUserTopic(buildTopicLine(combo))) && !recentComboKeys.has(combo.key) && !recentDomainIds.has(combo.domain.id)),
        combos.filter((combo) => !blockedTopicLines.has(normalizeUserTopic(buildTopicLine(combo))) && !recentComboKeys.has(combo.key)),
        combos.filter((combo) => !blockedTopicLines.has(normalizeUserTopic(buildTopicLine(combo))) && !recentSubtopicKeys.has(buildSubtopicKey(combo)) && !recentDomainIds.has(combo.domain.id)),
        combos.filter((combo) => !blockedTopicLines.has(normalizeUserTopic(buildTopicLine(combo))) && !recentSubtopicKeys.has(buildSubtopicKey(combo))),
        combos.filter((combo) => !blockedTopicLines.has(normalizeUserTopic(buildTopicLine(combo))) && !recentDomainIds.has(combo.domain.id)),
        combos.filter((combo) => !blockedTopicLines.has(normalizeUserTopic(buildTopicLine(combo)))),
        combos.filter((combo) => !recentComboKeys.has(combo.key)),
        combos,
    ];

    return stages.find((stage) => stage.length > 0) ?? combos;
}

function pickRandomFromDomains(domainIds: string[], channel: TopicChannel, recentTopicLines?: string[]): TopicSelection {
    const combos = buildCombos(domainIds);
    if (combos.length === 0) {
        return {
            source: "random",
            domainId: "general",
            domainLabel: "综合主题",
            subtopicId: "general",
            subtopicLabel: "综合话题",
            angle: "Practical analysis with clear examples and balanced reasoning",
            topicLine: "Practical analysis with clear examples and balanced reasoning",
        };
    }

    const available = pickCandidateCombos({
        combos,
        channel,
        recentTopicLines,
    });
    const picked = randomPick(available);
    rememberTopicCombo(channel, picked);

    return {
        source: "random",
        domainId: picked.domain.id,
        domainLabel: picked.domain.label,
        subtopicId: picked.subtopic.id,
        subtopicLabel: picked.subtopic.label,
        angle: picked.angle,
        topicLine: buildTopicLine(picked),
    };
}

export function pickAIGenerationTopicSeed(params: {
    difficulty: TopicDifficulty;
    userTopic?: string;
}): TopicSelection {
    const normalized = normalizeUserTopic(params.userTopic || "");
    if (normalized) {
        return {
            source: "user",
            domainId: "custom",
            domainLabel: "自定义主题",
            subtopicId: "custom",
            subtopicLabel: "用户输入",
            angle: normalized,
            topicLine: normalized,
        };
    }

    return pickRandomFromDomains(AI_DOMAIN_IDS_BY_DIFFICULTY[params.difficulty], "ai_gen");
}

function catDomainIdsByScore(score: number) {
    const rank = getCatRankTier(score);
    return CAT_DOMAIN_IDS_BY_RANK_ID[rank.id] ?? ALL_TOPIC_DOMAIN_IDS;
}

export function pickCatTopicSeed(params: {
    score: number;
    userTopic?: string;
    recentTopicLines?: string[];
}): TopicSelection {
    const normalized = normalizeUserTopic(params.userTopic || "");
    if (normalized) {
        return {
            source: "user",
            domainId: "custom",
            domainLabel: "自定义主题",
            subtopicId: "custom",
            subtopicLabel: "用户输入",
            angle: normalized,
            topicLine: normalized,
        };
    }

    return pickRandomFromDomains(catDomainIdsByScore(params.score), "cat", params.recentTopicLines);
}

export function __resetTopicHistoryForTests() {
    (["ai_gen", "cat"] as const).forEach((channel) => {
        RECENT_TOPIC_HISTORY[channel].comboKeys.length = 0;
        RECENT_TOPIC_HISTORY[channel].subtopicKeys.length = 0;
        RECENT_TOPIC_HISTORY[channel].domainIds.length = 0;
        RECENT_TOPIC_HISTORY[channel].topicLines.length = 0;
    });
}
