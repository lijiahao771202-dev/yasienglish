export const RANDOM_TRANSLATION_SCENARIO_TOPIC = "Translation Random Scenario" as const;

export type TranslationQuickMatchTopic = {
    id: string;
    domainId: string;
    domainLabel: string;
    scenarioId: string;
    scenarioLabel: string;
    genreId: string;
    genreLabel: string;
    topicLine: string;
    topicPrompt: string;
};

type DifficultyBand = {
    minElo: number;
    maxElo: number;
};

type ThemeSceneSeed = {
    id: string;
    label: string;
    detail: string;
    weight?: number;
};

type ThemeCluster = DifficultyBand & {
    id: string;
    label: string;
    summary: string;
    weight?: number;
    sceneSeeds: ThemeSceneSeed[];
};

type SceneFrame = {
    id: string;
    labelTemplate: string;
    promptTemplate: string;
    weight?: number;
    allowedStyleIds?: string[];
};

type WritingStyle = DifficultyBand & {
    id: string;
    label: string;
    detail: string;
    weight?: number;
};

type TranslationSceneCard = DifficultyBand & {
    id: string;
    label: string;
    detail: string;
    weight: number;
    allowedStyleIds?: string[];
};

const HIST_THEMES = "transl.quickmatch.recent.themes.v2";
const HIST_SCENES = "transl.quickmatch.recent.scenes.v2";
const HIST_STYLES = "transl.quickmatch.recent.styles.v2";
const HIST_TOPICS = "transl.quickmatch.recent.topics.v2";

const WINDOW_THEME = 6;
const WINDOW_SCENE = 18;
const WINDOW_STYLE = 6;
const WINDOW_TOPICS = 36;

function theme(
    id: string,
    label: string,
    minElo: number,
    maxElo: number,
    summary: string,
    sceneSeeds: Array<[string, string, string]>,
    weight = 1,
): ThemeCluster {
    return {
        id,
        label,
        minElo,
        maxElo,
        summary,
        weight,
        sceneSeeds: sceneSeeds.map(([seedId, seedLabel, detail]) => ({
            id: seedId,
            label: seedLabel,
            detail,
        })),
    };
}

const THEME_CLUSTERS: ThemeCluster[] = [
    theme("campus-course-club", "校园课程与社团", 0, 1800, "Focus on student routines, deadlines, group friction, and campus coordination.", [
        ["schedule", "课表调整", "a class arrangement, timetable conflict, or changed session"],
        ["group-work", "小组作业", "shared responsibility inside a group assignment"],
        ["club", "社团招新", "joining, quitting, or participating in a campus club"],
        ["mentor", "导师反馈", "comments, revision requests, or pressure from a tutor"],
        ["dorm", "宿舍作息", "rest, noise, privacy, and rhythm inside shared living"],
        ["course-select", "选课冲突", "trade-offs and constraints when picking modules"],
        ["presentation", "演讲展示", "preparation, nerves, and public speaking on campus"],
        ["internship", "实习申请", "application pressure and career planning from school"],
    ]),
    theme("office-teamwork", "职场协作与办公室", 800, 3200, "Focus on meetings, feedback loops, accountability, and team execution.", [
        ["meeting", "会议改期", "rescheduling or re-scoping a meeting plan"],
        ["handover", "任务交接", "passing unfinished work to someone else responsibly"],
        ["cross-team", "跨组协作", "dependencies and communication between teams"],
        ["reporting", "汇报压力", "status updates and performance visibility"],
        ["manager", "上司反馈", "revisions, criticism, or expectations from a manager"],
        ["overtime", "加班边界", "limits around availability, deadlines, and fairness"],
        ["onboarding", "新人适应", "learning pace and uncertainty in a new role"],
        ["remote-ops", "远程沟通", "clarity and timing in asynchronous work exchanges"],
    ]),
    theme("remote-digital-work", "远程办公与数字沟通", 800, 3200, "Focus on digital overload, fragmented work, and online coordination.", [
        ["video-call", "在线会议", "video meetings, awkward silences, or unstable attention"],
        ["notif", "信息轰炸", "too many notifications and response pressure"],
        ["docs", "文档协作", "editing, versioning, and ownership in shared documents"],
        ["timezone", "时区错位", "cross-time-zone friction and scheduling strain"],
        ["isolation", "工位孤独", "working alone and losing daily connection"],
        ["training", "线上培训", "absorbing new material in remote sessions"],
        ["response", "即时回复", "expectations of fast replies and emotional load"],
        ["home-interrupt", "家庭打断", "home life colliding with concentration"],
    ]),
    theme("renting-roommates", "租房搬家与室友", 0, 2400, "Focus on housing logistics, co-living compromise, and practical negotiation.", [
        ["viewing", "看房比较", "choosing between housing options under limits"],
        ["contract", "合同细节", "lease clauses, obligations, or unclear terms"],
        ["repair", "维修拖延", "a household issue not being fixed in time"],
        ["noise", "室友噪音", "sleep, privacy, and frustration in shared space"],
        ["cleaning", "公共清洁", "standards and fairness in common areas"],
        ["moving", "搬家预算", "money and effort involved in relocation"],
        ["deposit", "押金退还", "friction around deposit deductions and evidence"],
        ["neighbor", "邻里关系", "shared building etiquette and quiet coexistence"],
    ]),
    theme("family-care", "家庭分工与照护", 0, 2400, "Focus on family responsibility, care fatigue, and practical affection.", [
        ["housework", "家务分配", "uneven routines and fairness in chores"],
        ["elder-checkup", "长辈体检", "appointments, worry, and care planning"],
        ["childcare", "育儿安排", "scheduling, attention, and parenting compromise"],
        ["holiday", "节日探望", "family expectations around visits and rituals"],
        ["generation-gap", "代际分歧", "different values between age groups"],
        ["care-burnout", "照护疲劳", "exhaustion from long-term care duties"],
        ["family-budget", "家庭财务", "shared expenses and uncomfortable trade-offs"],
        ["urgent-help", "临时求助", "last-minute requests inside family networks"],
    ]),
    theme("friendship-boundaries", "朋友聚会与礼貌边界", 0, 2200, "Focus on casual friendship, disappointment, invitations, and polite limits.", [
        ["invite", "聚会邀约", "social invitations and differing enthusiasm"],
        ["lateness", "迟到失约", "broken timing and the effort to repair it"],
        ["borrowing", "借东西", "lending, returning, and awkward reminders"],
        ["group-chat", "群聊误会", "tone slipping in a group conversation"],
        ["support", "情绪陪伴", "trying to support a friend without overreaching"],
        ["gift", "礼物压力", "expectation and emotional cost around giving"],
        ["trip", "旅行合拍", "compatibility problems during shared plans"],
        ["drift", "渐行渐远", "distance growing without a clear conflict"],
    ]),
    theme("relationship-emotion", "亲密关系与情绪沟通", 800, 2600, "Focus on expectations, repair, intimacy, and everyday emotional labor.", [
        ["expectation", "沟通期待", "what each side assumes should happen"],
        ["cold-war", "冷战后恢复", "starting to talk again after distance"],
        ["schedule", "日程磨合", "finding shared time under busy routines"],
        ["future", "未来规划", "misaligned timelines and uncertain promises"],
        ["security", "安全感", "reassurance, silence, and interpretation"],
        ["boundary", "公开边界", "how public the relationship should feel"],
        ["jealousy", "吃醋误会", "a small incident triggering insecurity"],
        ["imbalance", "分工失衡", "who keeps the relationship running day to day"],
    ]),
    theme("city-commute", "城市通勤与公共空间", 0, 1800, "Focus on crowding, lateness, movement, and shared urban rules.", [
        ["subway", "地铁拥挤", "crowding, waiting, and forced proximity"],
        ["traffic", "堵车绕路", "unexpected traffic and route changes"],
        ["cost", "通勤成本", "time and money spent getting around"],
        ["bike", "共享单车", "convenience, mess, and fragile public systems"],
        ["rain", "雨天出行", "weather turning a simple trip into a burden"],
        ["signage", "站内指引", "confusing directions in transit spaces"],
        ["closure", "临时封路", "road closures and sudden inconvenience"],
        ["late-explain", "迟到解释", "explaining lateness without sounding weak"],
    ]),
    theme("travel-disruption", "旅行计划与突发状况", 0, 2400, "Focus on delays, logistics, and small crises while traveling.", [
        ["flight-delay", "航班延误", "plans collapsing because transport shifts"],
        ["luggage", "行李问题", "missing, delayed, or damaged belongings"],
        ["hotel", "酒店入住", "check-in friction and expectation gaps"],
        ["route", "路线迷失", "getting lost and improvising under stress"],
        ["companion", "同行分歧", "small disagreements turning into travel tension"],
        ["budget", "预算超支", "money pressure during a trip"],
        ["weather", "天气变化", "weather forcing a different plan"],
        ["queue", "景点排队", "tourist crowding and patience limits"],
    ]),
    theme("food-service", "餐饮消费与服务体验", 0, 2000, "Focus on everyday service interactions, preferences, and mild dissatisfaction.", [
        ["takeout", "外卖选择", "fast choices under hunger and indecision"],
        ["reservation", "餐厅订位", "timing, availability, and minor plan shifts"],
        ["service-error", "服务失误", "an order or service detail going wrong"],
        ["preference", "饮食偏好", "personal taste or dietary constraints"],
        ["price", "价格落差", "value expectation not matching reality"],
        ["queue", "排队等待", "time cost and fading patience"],
        ["safety", "食品安全", "trust, cleanliness, and hesitation"],
        ["taste", "口味争议", "a shared meal producing different reactions"],
    ]),
    theme("health-routine", "健康管理与身体状态", 0, 2600, "Focus on routines, medical decisions, fatigue, and recovery.", [
        ["appointment", "预约挂号", "getting access to care and timing it"],
        ["sleep", "睡眠不足", "brain fog and poor self-control from tiredness"],
        ["fitness", "健身计划", "trying to stay consistent under pressure"],
        ["pain", "慢性疼痛", "small but persistent physical discomfort"],
        ["advice", "医嘱执行", "following or resisting practical advice"],
        ["mood", "情绪低落", "trying to explain low energy or sadness"],
        ["diet", "饮食控制", "discipline, cravings, and frustration"],
        ["recovery", "康复节奏", "how slowly improvement can actually happen"],
    ]),
    theme("tech-products", "科技产品与使用习惯", 0, 2400, "Focus on devices, software, subscriptions, and digital dependence.", [
        ["device", "新设备上手", "learning friction when using a new tool"],
        ["update", "软件更新", "small disruption after an update lands"],
        ["security", "账号安全", "suspicion, passwords, and recovery steps"],
        ["subscription", "订阅续费", "automatic payments and value doubts"],
        ["privacy", "隐私担忧", "feeling watched or overly tracked"],
        ["algorithm", "推荐算法", "machines shaping attention and choice"],
        ["battery", "电量焦虑", "low battery driving irrational decisions"],
        ["repair", "售后维修", "support channels and repair delays"],
    ]),
    theme("social-media-content", "线上内容与社交媒体", 0, 2600, "Focus on visibility, self-presentation, and platform pressure.", [
        ["comments", "评论压力", "other people's reactions changing your mood"],
        ["posting", "发帖犹豫", "second-guessing whether to say something"],
        ["traffic", "流量起伏", "attention spikes and drops shaping confidence"],
        ["expression", "个人表达", "trying to sound authentic in public"],
        ["homogeneity", "内容同质化", "seeing everyone make the same thing"],
        ["dm", "私信边界", "private access becoming emotionally heavy"],
        ["ops", "账号运营", "content planning becoming routine labor"],
        ["persona", "虚假人设", "distance between identity and presentation"],
    ]),
    theme("shopping-consumer", "购物退换与平台售后", 0, 2200, "Focus on buying decisions, returns, and consumer frustration.", [
        ["impulse", "冲动消费", "buying before thinking through consequences"],
        ["return", "退货流程", "effort, proof, and platform friction"],
        ["compare", "比价选择", "searching for value among too many options"],
        ["after-sales", "售后扯皮", "support avoiding responsibility"],
        ["discount", "优惠套路", "promotions shaping irrational behavior"],
        ["waste", "包装浪费", "consumer convenience producing unnecessary waste"],
        ["resale", "二手转卖", "passing on something that no longer fits"],
        ["membership", "会员订阅", "small recurring charges adding up"],
    ]),
    theme("money-budget", "理财消费与预算选择", 800, 2800, "Focus on money conversations, budgeting trade-offs, and financial behavior.", [
        ["monthly", "月度预算", "trying to balance multiple categories"],
        ["hidden", "隐性支出", "small costs quietly damaging a plan"],
        ["aa", "朋友AA", "fairness and discomfort when splitting costs"],
        ["saving", "储蓄目标", "delayed gratification colliding with desire"],
        ["invest", "投资犹豫", "risk tolerance and partial understanding"],
        ["reimburse", "报销拖延", "administrative friction around money back"],
        ["downgrade", "消费降级", "adjusting expectations to reality"],
        ["transparent", "财务透明", "how open people should be about money"],
    ]),
    theme("time-productivity", "时间管理与个人效率", 0, 2600, "Focus on deadlines, procrastination, and the emotional side of efficiency.", [
        ["delay", "拖延爆发", "avoidance growing until pressure peaks"],
        ["squeeze", "日程挤压", "too many obligations packed together"],
        ["multitask", "多任务切换", "attention loss from fragmented work"],
        ["fragments", "碎片时间", "trying to use scattered minutes well"],
        ["priority", "优先级混乱", "not knowing what matters most"],
        ["plan-fail", "计划落空", "the emotional drop when discipline breaks"],
        ["rest", "休息愧疚", "feeling guilty for stopping"],
        ["countdown", "截止倒计时", "pressure rising as time disappears"],
    ]),
    theme("environment-community", "环保生活与公共责任", 800, 2800, "Focus on ordinary environmental choices and shared responsibility.", [
        ["sorting", "垃圾分类", "compliance, confusion, and practical effort"],
        ["energy", "节能习惯", "small household choices with moral framing"],
        ["green", "社区绿化", "public space care and local involvement"],
        ["noise", "公共噪音", "shared comfort harmed by inconsiderate behavior"],
        ["volunteer", "志愿参与", "wanting to help but managing time limits"],
        ["resource", "共享资源", "common goods being overused or ignored"],
        ["eco-buying", "环保消费", "trying to buy responsibly under constraints"],
        ["weather", "天气异常", "climate signals becoming hard to ignore"],
    ]),
    theme("culture-entertainment", "文化活动与审美体验", 800, 3000, "Focus on taste, public reaction, and cultural participation.", [
        ["film", "电影口碑", "expectation and disappointment around a release"],
        ["show", "演出排期", "scheduling around performances and events"],
        ["exhibition", "展览观感", "how people differently interpret the same work"],
        ["idol", "偶像争议", "fan identity colliding with public controversy"],
        ["copyright", "版权问题", "creative ownership and copying anxiety"],
        ["taste", "审美差异", "taste becoming a source of mild conflict"],
        ["binge", "追剧节奏", "habit, attention, and losing time to entertainment"],
        ["misread", "文化误读", "meaning shifting across audiences"],
    ]),
    theme("ai-work-impact", "AI 工具与工作影响", 1200, 3600, "Focus on automation, dependence, trust, and changing expectations.", [
        ["replace", "自动化替代", "fear of being replaced by tools"],
        ["upskill", "技能升级", "having to learn faster than feels comfortable"],
        ["copilot", "AI协作", "balancing convenience with judgment"],
        ["wrong", "错误输出", "tool confidence masking bad results"],
        ["ownership", "创意归属", "credit and authorship becoming unclear"],
        ["efficiency", "效率焦虑", "higher output expectations after automation"],
        ["depend", "工具依赖", "losing confidence without assistance"],
        ["job", "岗位重塑", "roles changing rather than disappearing outright"],
    ]),
    theme("public-issue-governance", "公共议题与城市治理", 1600, 3600, "Focus on rules, services, fairness, and public trust.", [
        ["policy", "政策解释", "translating rules into ordinary understanding"],
        ["queue", "排队秩序", "small acts of disorder in shared systems"],
        ["safety", "公共安全", "how caution changes public behavior"],
        ["counter", "服务窗口", "bureaucratic friction in simple tasks"],
        ["community", "社区规则", "balancing individual comfort and common order"],
        ["renewal", "城市更新", "improvement bringing both gain and loss"],
        ["transparency", "信息透明", "when people feel details are withheld"],
        ["feedback", "公众反馈", "citizen frustration and slow response"],
    ]),
    theme("education-pressure", "教育压力与成长焦虑", 0, 2600, "Focus on performance, comparison, identity, and family expectation.", [
        ["exam", "升学焦虑", "how tests distort attention and mood"],
        ["compare", "分数比较", "ranking oneself against peers"],
        ["parents", "家长期待", "ambition and pressure coming from family"],
        ["self-study", "自学计划", "discipline without enough structure"],
        ["tutoring", "补课依赖", "outsourcing learning to endless support"],
        ["intern", "实习竞争", "career planning arriving too early"],
        ["speak", "表达障碍", "knowing ideas but struggling to voice them"],
        ["confusion", "成长困惑", "not knowing what kind of person to become"],
    ]),
    theme("psychology-self-regulation", "心理疲劳与自我调节", 800, 3600, "Focus on burnout, self-doubt, emotional rhythm, and recovery attempts.", [
        ["doubt", "自我怀疑", "questioning one's own judgment and worth"],
        ["social", "社交耗竭", "needing distance after too much people time"],
        ["ruminate", "过度反思", "thinking looping without resolution"],
        ["perfect", "完美主义", "standards turning into paralysis"],
        ["breakdown", "情绪崩溃", "losing control after holding on too long"],
        ["please", "讨好倾向", "saying yes to avoid tension"],
        ["fomo", "错失恐惧", "fear that everyone else is moving ahead"],
        ["recover", "孤独恢复", "using solitude to feel whole again"],
    ], 1.2),
    theme("career-transition", "职业转型与身份焦虑", 1200, 3600, "Focus on uncertainty, skill gaps, and re-defining professional identity.", [
        ["jump", "跳槽犹豫", "staying put versus starting over"],
        ["gap", "技能缺口", "realizing your tools no longer match the market"],
        ["identity", "职业身份", "not knowing how to describe what you are now"],
        ["resume", "简历包装", "how much framing crosses into distortion"],
        ["industry", "行业变化", "a field changing under your feet"],
        ["interview", "面试复盘", "reading too much into a short interaction"],
        ["offer", "offer比较", "choosing between imperfect opportunities"],
        ["probation", "试用期压力", "wanting to prove yourself too quickly"],
    ]),
    theme("global-society", "全球议题与社会变化", 1800, 4000, "Focus on big systems expressed through ordinary consequences.", [
        ["supply", "全球供应链", "fragile systems behind daily convenience"],
        ["climate", "气候责任", "shared blame and unequal exposure"],
        ["platform", "平台垄断", "concentration of power behind choice"],
        ["aging", "老龄化", "social systems strained by demographic shifts"],
        ["global-local", "本地化与全球化", "tension between openness and resilience"],
        ["ethics", "技术伦理", "progress arriving faster than norms"],
        ["mobility", "社会流动", "whether effort still reliably changes lives"],
        ["distortion", "信息失真", "truth bending as it moves through systems"],
    ]),
    theme("pets-care", "宠物照护与陪伴关系", 0, 2200, "Focus on care routines, emotional attachment, and shared living friction.", [
        ["vet", "看病预约", "organizing medical care for an animal companion"],
        ["feeding", "喂养安排", "routine care being disrupted or forgotten"],
        ["boarding", "寄养选择", "trust and guilt around temporary care"],
        ["damage", "破坏家具", "frustration colliding with affection"],
        ["walk", "遛宠冲突", "shared spaces and clashing expectations"],
        ["cost", "宠物消费", "how care becomes expensive over time"],
        ["comfort", "情绪陪伴", "the quiet emotional role of a pet"],
        ["rules", "社区规范", "pet care meeting public rules and judgment"],
    ]),
    theme("neighborhood-shared-space", "邻里关系与共享秩序", 0, 2200, "Focus on everyday co-existence inside buildings and neighborhoods.", [
        ["parcel", "快递堆放", "convenience cluttering shared access"],
        ["parking", "停车问题", "space scarcity and repeated tension"],
        ["renovation", "装修噪音", "private improvement disturbing collective rest"],
        ["elevator", "电梯礼仪", "small shared rules that reveal character"],
        ["fridge", "公共冰箱", "ownership and cleanliness in common resources"],
        ["hallway", "楼道杂物", "mess slowly becoming normal"],
        ["property", "物业沟通", "how management handles minor complaints"],
        ["mutual-aid", "邻里互助", "small kindnesses that change the tone of a place"],
    ]),
    theme("learning-language-growth", "语言学习与个人成长", 0, 2400, "Focus on learning habits, embarrassment, feedback, and persistence.", [
        ["plateau", "学英语瓶颈", "feeling stuck despite continued effort"],
        ["shame", "口语羞耻", "fear of speaking before being fully ready"],
        ["overload", "输入过载", "consuming too much without digesting it"],
        ["break", "复习中断", "what happens when momentum is lost"],
        ["partner", "学习搭子", "motivation rising and falling with others"],
        ["certificate", "证书压力", "external validation dominating learning"],
        ["method", "方法试错", "switching systems before one takes root"],
        ["feedback", "反馈吸收", "turning correction into actual change"],
    ]),
    theme("platform-gig-economy", "平台接单与零工经济", 800, 2600, "Focus on ratings, algorithmic control, and unstable work.", [
        ["orders", "接单波动", "income shifting with opaque demand"],
        ["ratings", "评分机制", "being judged by compressed feedback"],
        ["delivery", "配送超时", "small delays producing bigger consequences"],
        ["penalty", "平台罚款", "rules applied with little room for explanation"],
        ["complaint", "客户投诉", "one interaction affecting future work"],
        ["flex", "灵活时间", "freedom that still feels constrained"],
        ["income", "收入不稳", "uncertainty shaping daily decisions"],
        ["dispatch", "算法派单", "machine choices deciding human rhythm"],
    ]),
    theme("art-creative-work", "艺术创作与审稿修改", 1200, 3400, "Focus on feedback, originality, compromise, and uncertain value.", [
        ["block", "创作卡顿", "ideas stalling despite effort"],
        ["edit", "审稿修改", "notes that partly help and partly distort"],
        ["inspiration", "灵感耗尽", "routine draining what once felt alive"],
        ["commercial", "商业妥协", "market demands changing creative decisions"],
        ["credit", "版权署名", "ownership and recognition becoming disputed"],
        ["client", "客户反馈", "trying to satisfy unclear expectations"],
        ["collab", "合作分工", "creative teamwork under mismatched standards"],
        ["chance", "展示机会", "rare visibility carrying outsized pressure"],
    ]),
    theme("science-innovation", "科研实验与创新落地", 1600, 4000, "Focus on uncertainty, revision, evidence, and practical translation of ideas.", [
        ["delay", "实验延误", "timelines shifting because reality resists plans"],
        ["data", "数据异常", "numbers challenging what you expected to find"],
        ["collab", "科研合作", "shared credit and uneven labor in research"],
        ["ethics", "伦理审查", "procedural checks slowing urgent work"],
        ["paper", "论文修改", "rewriting an argument under criticism"],
        ["budget", "预算申请", "translating importance into persuasive requests"],
        ["landing", "技术落地", "good ideas meeting messy real conditions"],
        ["failure", "失败复盘", "what a failed attempt actually teaches"],
    ]),
    theme("law-ethics-rights", "规则意识与权利边界", 1800, 4000, "Focus on consent, obligations, exceptions, and moral ambiguity.", [
        ["privacy", "隐私权", "access to data and the meaning of consent"],
        ["consent", "同意边界", "when agreement is partial or pressured"],
        ["liability", "平台责任", "who should bear responsibility when systems fail"],
        ["procedure", "程序正义", "fair process versus efficient outcome"],
        ["speech", "言论尺度", "expression meeting social consequence"],
        ["contract", "合同理解", "formal terms hiding practical risk"],
        ["evidence", "证据保存", "proof becoming essential after trust breaks"],
        ["exception", "规则例外", "whether a good reason justifies bending a rule"],
    ]),
    theme("future-lifestyle", "未来生活方式与技术想象", 1800, 4000, "Focus on speculative but grounded futures affecting ordinary life.", [
        ["remote-city", "远程城市", "location losing its old importance"],
        ["avatar", "虚拟身份", "multiple selves across digital spaces"],
        ["co-living", "人机共居", "domestic life shaped by automation"],
        ["smart-home", "智能家居", "comfort trading against control and privacy"],
        ["longevity", "长寿工作制", "careers stretched across longer lives"],
        ["edu-shift", "教育形态", "how learning changes when delivery changes"],
        ["mobility", "出行模式", "transport systems reordering daily behavior"],
        ["ownership", "共享所有权", "access replacing possession in more areas"],
    ]),
    theme("media-public-opinion", "媒体信息与舆论判断", 1200, 3600, "Focus on framing, bias, overreaction, and credibility.", [
        ["headline", "标题党", "attention-grabbing framing distorting substance"],
        ["commentary", "评论失真", "hot takes replacing patient understanding"],
        ["speed", "新闻时效", "speed outrunning verification"],
        ["bias", "立场偏差", "audiences rewarding what confirms them"],
        ["rumor", "流言扩散", "uncertain claims spreading too quickly"],
        ["fatigue", "信息疲劳", "constant updates reducing clarity"],
        ["trust", "信任崩塌", "institutions losing credibility over time"],
        ["silence", "选择沉默", "withholding reaction as a deliberate act"],
    ]),
];

const SCENE_FRAMES: SceneFrame[] = [
    {
        id: "sudden-shift",
        labelTemplate: "{seedLabel}里的临时变动",
        promptTemplate: "The writing should center on an unexpected change around {seedDetail}. The writer needs to explain what changed, why it matters, and what should happen next.",
        weight: 1.15,
    },
    {
        id: "misunderstanding-repair",
        labelTemplate: "{seedLabel}后的误解澄清",
        promptTemplate: "The writing should revolve around a misunderstanding related to {seedDetail}. The writer must clarify intent, correct assumptions, and lower tension without sounding defensive.",
        weight: 1,
    },
    {
        id: "tradeoff-decision",
        labelTemplate: "{seedLabel}中的两难取舍",
        promptTemplate: "The writing should portray a real trade-off inside {seedDetail}. The writer has to weigh two imperfect options and justify the more reasonable choice.",
        weight: 1.1,
    },
    {
        id: "follow-up-suggestion",
        labelTemplate: "{seedLabel}后的跟进与建议",
        promptTemplate: "The writing should begin after something has already happened around {seedDetail}. The writer needs to follow up, propose one practical improvement, and keep the tone constructive.",
        weight: 1,
    },
    {
        id: "observation-reflection",
        labelTemplate: "围绕{seedLabel}的一次观察与反思",
        promptTemplate: "The writing should turn a concrete observation about {seedDetail} into reflection. It should connect one small scene to a broader personal or social meaning.",
        weight: 1.05,
    },
    {
        id: "value-clash",
        labelTemplate: "{seedLabel}引发的价值冲突",
        promptTemplate: "The writing should frame {seedDetail} as a clash between two values, expectations, or priorities. The writer needs to show why both sides make sense before leaning toward one position.",
        weight: 0.95,
    },
];

const WRITING_STYLES: WritingStyle[] = [
    { id: "casual-diary", label: "日常叙述", detail: "Write like a grounded personal recount with simple but natural sequencing and clear emotional logic.", minElo: 0, maxElo: 1600, weight: 1.2 },
    { id: "direct-message", label: "消息沟通", detail: "Write as a realistic text or chat message. Keep it direct, natural, and socially believable.", minElo: 0, maxElo: 1800, weight: 1.2 },
    { id: "narrative-recount", label: "经历复述", detail: "Write as a compact narrative with a clear timeline, concrete actions, and one emotional turn.", minElo: 400, maxElo: 2200, weight: 1.1 },
    { id: "practical-explanation", label: "说明分析", detail: "Write as a practical explanation that clarifies reasons, consequences, and next steps without drifting into abstraction.", minElo: 800, maxElo: 2800, weight: 1.15 },
    { id: "semi-formal-email", label: "半正式邮件", detail: "Write in a semi-formal register suitable for email or workplace communication, polite but efficient.", minElo: 1000, maxElo: 3200, weight: 1 },
    { id: "balanced-commentary", label: "观点表达", detail: "Write as a balanced commentary that acknowledges tension, compares positions, and lands on a reasoned view.", minElo: 1400, maxElo: 3600, weight: 1 },
    { id: "reflective-essay", label: "反思短文", detail: "Write as a reflective paragraph that links a concrete event to a more layered personal insight.", minElo: 1800, maxElo: 4000, weight: 0.95 },
    { id: "analytical-paragraph", label: "议论段落", detail: "Write as a tightly reasoned analytical paragraph with strong causal logic, contrast, and abstraction.", minElo: 2200, maxElo: 4000, weight: 0.9 },
];

const PASSAGE_STYLE_BONUS = new Set(["practical-explanation", "balanced-commentary", "reflective-essay", "analytical-paragraph"]);

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

function trimHistory(ids: string[], size: number) {
    return Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean))).slice(-size);
}

function chooseFreshCandidates<T extends { id: string }>(items: T[], recentIds: Set<string>) {
    const candidates = items.filter((item) => !recentIds.has(item.id));
    return candidates.length > 0 ? candidates : items;
}

function weightedRandomPick<T extends { weight?: number }>(items: T[]): T {
    if (!items.length) {
        return items[0];
    }

    const totalWeight = items.reduce((sum, item) => sum + (item.weight ?? 1), 0);
    let cursor = Math.random() * totalWeight;

    for (const item of items) {
        cursor -= item.weight ?? 1;
        if (cursor <= 0) {
            return item;
        }
    }

    return items[items.length - 1]!;
}

function buildSceneCard(themeCluster: ThemeCluster, sceneSeed: ThemeSceneSeed, sceneFrame: SceneFrame): TranslationSceneCard {
    const label = sceneFrame.labelTemplate.replace("{seedLabel}", sceneSeed.label);
    const detail = [
        `Theme focus: ${themeCluster.summary}`,
        sceneFrame.promptTemplate.replace("{seedDetail}", sceneSeed.detail),
    ].join(" ");

    return {
        id: `${themeCluster.id}:${sceneSeed.id}:${sceneFrame.id}`,
        label,
        detail,
        minElo: themeCluster.minElo,
        maxElo: themeCluster.maxElo,
        weight: (themeCluster.weight ?? 1) * (sceneSeed.weight ?? 1) * (sceneFrame.weight ?? 1),
        allowedStyleIds: sceneFrame.allowedStyleIds,
    };
}

function buildThemeScenes(themeCluster: ThemeCluster) {
    return themeCluster.sceneSeeds.flatMap((sceneSeed) => (
        SCENE_FRAMES.map((sceneFrame) => buildSceneCard(themeCluster, sceneSeed, sceneFrame))
    ));
}

function getEligibleThemes(elo: number) {
    return THEME_CLUSTERS.filter((themeCluster) => elo >= themeCluster.minElo && elo <= themeCluster.maxElo);
}

function getEligibleScenes(themeCluster: ThemeCluster, elo: number) {
    return buildThemeScenes(themeCluster).filter((sceneCard) => elo >= sceneCard.minElo && elo <= sceneCard.maxElo);
}

function getEligibleStyles(elo: number, variant: "sentence" | "passage", allowedStyleIds?: string[]) {
    const allowedStyleSet = allowedStyleIds ? new Set(allowedStyleIds) : null;
    return WRITING_STYLES
        .filter((style) => elo >= style.minElo && elo <= style.maxElo)
        .filter((style) => !allowedStyleSet || allowedStyleSet.has(style.id))
        .map((style) => ({
            ...style,
            weight: (style.weight ?? 1) * (variant === "passage" && PASSAGE_STYLE_BONUS.has(style.id) ? 1.2 : 1),
        }));
}

export function readTranslationQuickMatchHistory() {
    if (typeof window === "undefined") {
        return { themes: [], scenes: [], styles: [], topics: [] };
    }

    return {
        themes: trimHistory(readStoredStringArray(HIST_THEMES), WINDOW_THEME),
        scenes: trimHistory(readStoredStringArray(HIST_SCENES), WINDOW_SCENE),
        styles: trimHistory(readStoredStringArray(HIST_STYLES), WINDOW_STYLE),
        topics: trimHistory(readStoredStringArray(HIST_TOPICS), WINDOW_TOPICS),
    };
}

export function rememberTranslationQuickMatchTopic(topic: TranslationQuickMatchTopic) {
    if (typeof window === "undefined") return;

    try {
        const history = readTranslationQuickMatchHistory();
        window.localStorage.setItem(HIST_THEMES, JSON.stringify([...history.themes.filter((id) => id !== topic.domainId), topic.domainId].slice(-WINDOW_THEME)));
        window.localStorage.setItem(HIST_SCENES, JSON.stringify([...history.scenes.filter((id) => id !== topic.scenarioId), topic.scenarioId].slice(-WINDOW_SCENE)));
        window.localStorage.setItem(HIST_STYLES, JSON.stringify([...history.styles.filter((id) => id !== topic.genreId), topic.genreId].slice(-WINDOW_STYLE)));
        window.localStorage.setItem(HIST_TOPICS, JSON.stringify([...history.topics.filter((id) => id !== topic.id), topic.id].slice(-WINDOW_TOPICS)));
    } catch {
        // ignore storage failures
    }
}

export function getTranslationQuickMatchPoolSize(elo: number, variant: "sentence" | "passage" = "sentence") {
    return getEligibleThemes(elo).reduce((count, themeCluster) => {
        const scenes = getEligibleScenes(themeCluster, elo);
        return count + scenes.reduce((sceneCount, sceneCard) => (
            sceneCount + getEligibleStyles(elo, variant, sceneCard.allowedStyleIds).length
        ), 0);
    }, 0);
}

export function getTranslationQuickMatchTotalCombinationCount() {
    return THEME_CLUSTERS.reduce((count, themeCluster) => {
        const scenes = buildThemeScenes(themeCluster);
        const compatibleStyleCount = WRITING_STYLES.filter((style) => (
            style.maxElo >= themeCluster.minElo && style.minElo <= themeCluster.maxElo
        )).length;
        return count + scenes.length * compatibleStyleCount;
    }, 0);
}

export function pickTranslationQuickMatchTopic(elo: number, variant: "sentence" | "passage" = "sentence"): TranslationQuickMatchTopic {
    const history = readTranslationQuickMatchHistory();
    const recentThemes = new Set(history.themes);
    const recentScenes = new Set(history.scenes);
    const recentStyles = new Set(history.styles);

    const eligibleThemes = getEligibleThemes(elo);
    const freshThemes = chooseFreshCandidates(eligibleThemes.length > 0 ? eligibleThemes : THEME_CLUSTERS, recentThemes);
    const themeCluster = weightedRandomPick(freshThemes);

    const eligibleScenes = getEligibleScenes(themeCluster, elo);
    const freshScenes = chooseFreshCandidates(eligibleScenes.length > 0 ? eligibleScenes : buildThemeScenes(themeCluster), recentScenes);
    const sceneCard = weightedRandomPick(freshScenes);

    const eligibleStyles = getEligibleStyles(elo, variant, sceneCard.allowedStyleIds);
    const freshStyles = chooseFreshCandidates(eligibleStyles.length > 0 ? eligibleStyles : WRITING_STYLES, recentStyles);
    const style = weightedRandomPick(freshStyles);

    const topicLine = `${themeCluster.label} · ${sceneCard.label} · ${style.label}`;
    const structuralDirective = variant === "passage"
        ? "Construct a cohesive Chinese paragraph with clear pronoun references, sentence-to-sentence flow, and natural progression because the text will be split into connected segments."
        : "Construct one compact but vivid Chinese scene that feels complete within a single translation item.";

    const topicPrompt = `
You are generating a Chinese-to-English translation drill.
Theme Cluster: ${themeCluster.label}
Scene Focus: ${sceneCard.detail}
Writing Style: ${style.detail}

${structuralDirective}
The Chinese source text must feel like a realistic writing task rather than a random phrase bundle.
Keep the situation concrete, the emotional logic believable, and the vocabulary level aligned with the requested style.
    `.trim();

    return {
        id: `${themeCluster.id}:${sceneCard.id}:${style.id}`,
        domainId: themeCluster.id,
        domainLabel: themeCluster.label,
        scenarioId: sceneCard.id,
        scenarioLabel: sceneCard.label,
        genreId: style.id,
        genreLabel: style.label,
        topicLine,
        topicPrompt,
    };
}

export function getAvailableTranslationSlotItems(elo: number) {
    const eligibleThemes = getEligibleThemes(elo);
    const themes = eligibleThemes.length > 0 ? eligibleThemes : THEME_CLUSTERS;
    const sceneLabels = Array.from(new Set(themes.flatMap((themeCluster) => getEligibleScenes(themeCluster, elo).map((sceneCard) => sceneCard.label))));
    const styleLabels = Array.from(new Set(WRITING_STYLES.filter((style) => elo >= style.minElo && elo <= style.maxElo).map((style) => style.label)));

    return {
        col1: themes.map((themeCluster) => themeCluster.label),
        col2: sceneLabels,
        col3: styleLabels,
    };
}

export function resolveTranslationScenarioContext(topic?: string | null, elo = 1000, variant: "sentence" | "passage" = "sentence") {
    const normalized = topic?.trim() ?? "";
    if (normalized && normalized !== RANDOM_TRANSLATION_SCENARIO_TOPIC && normalized !== "Random Scenario") {
        return {
            topicLine: normalized,
            topicPrompt: `
You are generating a Chinese-to-English translation drill.
Theme Cluster: 用户自定义主题
Scene Focus: ${normalized}
Writing Style: 自然表达

${variant === "passage" ? "Construct a cohesive Chinese paragraph with clear pronoun references, sentence-to-sentence flow, and natural progression because the text will be split into connected segments." : "Construct one compact but vivid Chinese scene that feels complete within a single translation item."}
The Chinese source text must feel like a realistic writing task rather than a random phrase bundle.
            `.trim(),
            domainLabel: "用户自定义主题",
            scenarioLabel: normalized,
            genreLabel: "自然表达",
        };
    }

    const selected = pickTranslationQuickMatchTopic(elo, variant);
    rememberTranslationQuickMatchTopic(selected);

    return {
        topicLine: selected.topicLine,
        topicPrompt: selected.topicPrompt,
        domainLabel: selected.domainLabel,
        scenarioLabel: selected.scenarioLabel,
        genreLabel: selected.genreLabel,
    };
}
