import { countWords } from "@/lib/translationDifficulty";
import type {
    ListeningBandPosition,
    ListeningBankItem,
    ListeningMemoryLoad,
    ListeningNaturalness,
    ListeningReducedFormsPresence,
    ListeningReviewStatus,
} from "./listening-drill-bank";

type HighBandCefr = "C2" | "C2+";

type HighBandSeed = {
    id: string;
    chinese: string;
    referenceEnglish: string;
    targetEnglishVocab: string[];
    theme: string;
    scene: string;
    tags: string[];
    cefr: HighBandCefr;
    bandPosition: ListeningBandPosition;
    clauseCount: number;
    qualityScore: number;
    reviewStatus?: ListeningReviewStatus;
};

type ThemeBundle = {
    theme: string;
    scene: string;
    focusEn: string;
    focusZh: string;
    placeEn: string;
    placeZh: string;
    issueEn: string;
    issueZh: string;
    supportEn: string;
    supportZh: string;
    eventEn: string;
    eventZh: string;
    personEn: string;
    personZh: string;
};

type BucketKey = `${HighBandCefr}-${ListeningBandPosition}`;

const HIGH_BAND_WINDOWS: Record<HighBandCefr, Record<ListeningBandPosition, { min: number; max: number }>> = {
    C2: {
        entry: { min: 2400, max: 2529 },
        mid: { min: 2530, max: 2664 },
        exit: { min: 2665, max: 2799 },
    },
    "C2+": {
        entry: { min: 2800, max: 2929 },
        mid: { min: 2930, max: 3064 },
        exit: { min: 3065, max: 3600 },
    },
};

const HIGH_BAND_DEFAULTS: Record<HighBandCefr, {
    memoryLoad: ListeningMemoryLoad;
    spokenNaturalness: ListeningNaturalness;
    reducedFormsPresence: ListeningReducedFormsPresence;
}> = {
    C2: {
        memoryLoad: "high",
        spokenNaturalness: "high",
        reducedFormsPresence: "frequent",
    },
    "C2+": {
        memoryLoad: "high",
        spokenNaturalness: "high",
        reducedFormsPresence: "frequent",
    },
};

const HIGH_BAND_WORD_RANGES: Record<HighBandCefr, { min: number; max: number }> = {
    C2: { min: 20, max: 32 },
    "C2+": { min: 20, max: 32 },
};

const HIGH_BAND_BUCKET_TARGETS: Record<BucketKey, number> = {
    "C2-entry": 167,
    "C2-mid": 167,
    "C2-exit": 166,
    "C2+-entry": 167,
    "C2+-mid": 167,
    "C2+-exit": 166,
};

const HIGH_BAND_THEMES: ThemeBundle[] = [
    { theme: "工作基础沟通", scene: "执行复盘", focusEn: "rollout memo", focusZh: "上线备忘", placeEn: "briefing room", placeZh: "简报室", issueEn: "scope drift", issueZh: "范围漂移", supportEn: "fallback schedule", supportZh: "备用排期", eventEn: "launch review", eventZh: "上线复盘", personEn: "ops director", personZh: "运营总监" },
    { theme: "客户服务", scene: "大客户交付", focusEn: "delivery summary", focusZh: "交付摘要", placeEn: "client suite", placeZh: "客户会议室", issueEn: "approval gap", issueZh: "审批断层", supportEn: "service credit", supportZh: "补偿方案", eventEn: "handover call", eventZh: "交接电话", personEn: "account lead", personZh: "客户负责人" },
    { theme: "旅行住宿", scene: "跨城改签", focusEn: "rebooking file", focusZh: "改签资料", placeEn: "transfer lounge", placeZh: "中转休息室", issueEn: "seat mismatch", issueZh: "座位错配", supportEn: "hotel voucher", supportZh: "酒店券", eventEn: "overnight transfer", eventZh: "跨夜转机", personEn: "duty manager", personZh: "值班经理" },
    { theme: "通勤出行", scene: "线路故障", focusEn: "incident log", focusZh: "事故记录", placeEn: "control room", placeZh: "控制室", issueEn: "signal fault", issueZh: "信号故障", supportEn: "rail shuttle", supportZh: "替代接驳", eventEn: "peak dispatch", eventZh: "高峰调度", personEn: "route supervisor", personZh: "线路主管" },
    { theme: "教育培训", scene: "课程审查", focusEn: "module draft", focusZh: "模块草案", placeEn: "faculty office", placeZh: "教研办公室", issueEn: "rubric mismatch", issueZh: "评分标准错位", supportEn: "review notes", supportZh: "审查备注", eventEn: "curriculum review", eventZh: "课程审查", personEn: "programme chair", personZh: "项目主任" },
    { theme: "数字生活", scene: "系统恢复", focusEn: "recovery brief", focusZh: "恢复简报", placeEn: "ops console", placeZh: "运维控制台", issueEn: "sync failure", issueZh: "同步故障", supportEn: "mirror cluster", supportZh: "镜像集群", eventEn: "service restart", eventZh: "服务恢复", personEn: "infra lead", personZh: "基础设施负责人" },
    { theme: "银行邮局", scene: "合规追溯", focusEn: "transfer trail", focusZh: "转账链路", placeEn: "audit desk", placeZh: "审计工位", issueEn: "identity breach", issueZh: "身份核验漏洞", supportEn: "holding notice", supportZh: "冻结通知", eventEn: "compliance review", eventZh: "合规复核", personEn: "risk officer", personZh: "风控专员" },
    { theme: "文化活动", scene: "演出统筹", focusEn: "stage plan", focusZh: "舞台方案", placeEn: "backstage hall", placeZh: "后台走廊", issueEn: "cue collapse", issueZh: "提示点失控", supportEn: "standby crew", supportZh: "替补团队", eventEn: "opening set", eventZh: "开场演出", personEn: "show caller", personZh: "演出调度" },
    { theme: "社区邻里", scene: "公共事故", focusEn: "building notice", focusZh: "楼栋通知", placeEn: "maintenance office", placeZh: "物业办公室", issueEn: "water leak", issueZh: "漏水事故", supportEn: "access note", supportZh: "通行说明", eventEn: "resident briefing", eventZh: "住户说明会", personEn: "site manager", personZh: "现场经理" },
    { theme: "兴趣休闲", scene: "户外组织", focusEn: "permit pack", focusZh: "许可材料", placeEn: "ridge station", placeZh: "山脊站点", issueEn: "weather shift", issueZh: "天气突变", supportEn: "reserve route", supportZh: "备用路线", eventEn: "summit attempt", eventZh: "冲顶安排", personEn: "expedition lead", personZh: "领队" },
    { theme: "运动健身", scene: "赛事协调", focusEn: "match brief", focusZh: "比赛简报", placeEn: "video room", placeZh: "录像分析室", issueEn: "fixture clash", issueZh: "赛程冲突", supportEn: "travel squad", supportZh: "出行名单", eventEn: "away fixture", eventZh: "客场比赛", personEn: "team manager", personZh: "球队经理" },
    { theme: "宠物照看", scene: "寄养争议", focusEn: "care record", focusZh: "照看记录", placeEn: "boarding unit", placeZh: "寄养区", issueEn: "feeding dispute", issueZh: "喂食争议", supportEn: "vet clearance", supportZh: "兽医证明", eventEn: "collection visit", eventZh: "接宠探视", personEn: "boarding lead", personZh: "寄养主管" },
    { theme: "城市办事", scene: "窗口解释", focusEn: "case bundle", focusZh: "案件材料", placeEn: "service hall", placeZh: "政务大厅", issueEn: "filing conflict", issueZh: "申报冲突", supportEn: "appeal note", supportZh: "申诉说明", eventEn: "hearing slot", eventZh: "听证时段", personEn: "case officer", personZh: "案件经办人" },
    { theme: "物流配送", scene: "仓配失衡", focusEn: "routing sheet", focusZh: "分拨表", placeEn: "loading bay", placeZh: "装货区", issueEn: "inventory lag", issueZh: "库存滞后", supportEn: "priority truck", supportZh: "优先车次", eventEn: "night dispatch", eventZh: "夜间发运", personEn: "depot manager", personZh: "仓配经理" },
    { theme: "医疗管理", scene: "病区协调", focusEn: "admission note", focusZh: "收治记录", placeEn: "ward desk", placeZh: "病区护士站", issueEn: "referral delay", issueZh: "转诊延误", supportEn: "bed roster", supportZh: "床位表", eventEn: "triage review", eventZh: "分诊复核", personEn: "clinical lead", personZh: "临床负责人" },
    { theme: "采购供应", scene: "招采复核", focusEn: "vendor matrix", focusZh: "供应商矩阵", placeEn: "procurement hub", placeZh: "采购中心", issueEn: "pricing gap", issueZh: "报价落差", supportEn: "waiver note", supportZh: "豁免说明", eventEn: "bid review", eventZh: "招标复核", personEn: "procurement head", personZh: "采购主管" },
    { theme: "法律合规", scene: "问责准备", focusEn: "evidence file", focusZh: "证据材料", placeEn: "hearing room", placeZh: "听证室", issueEn: "disclosure breach", issueZh: "披露违规", supportEn: "counsel memo", supportZh: "法律备忘", eventEn: "disciplinary panel", eventZh: "问责小组", personEn: "compliance counsel", personZh: "合规律师" },
    { theme: "科研项目", scene: "结果复核", focusEn: "trial dataset", focusZh: "试验数据集", placeEn: "lab annex", placeZh: "实验附楼", issueEn: "sampling bias", issueZh: "抽样偏差", supportEn: "method appendix", supportZh: "方法附录", eventEn: "grant review", eventZh: "项目评审", personEn: "research lead", personZh: "课题负责人" },
    { theme: "媒体传播", scene: "舆情处理", focusEn: "press line", focusZh: "口径文案", placeEn: "media desk", placeZh: "媒体席", issueEn: "narrative drift", issueZh: "叙事偏移", supportEn: "holding line", supportZh: "临时口径", eventEn: "press briefing", eventZh: "新闻吹风会", personEn: "press secretary", personZh: "新闻秘书" },
    { theme: "保险理赔", scene: "赔付争议", focusEn: "claim summary", focusZh: "理赔摘要", placeEn: "assessment unit", placeZh: "评估组", issueEn: "coverage dispute", issueZh: "保障争议", supportEn: "loss report", supportZh: "损失报告", eventEn: "settlement call", eventZh: "结案电话", personEn: "claims lead", personZh: "理赔主管" },
    { theme: "制造质控", scene: "停线判断", focusEn: "inspection batch", focusZh: "检验批次", placeEn: "quality station", placeZh: "质检站", issueEn: "tolerance drift", issueZh: "公差漂移", supportEn: "containment plan", supportZh: "围堵方案", eventEn: "line restart", eventZh: "复线安排", personEn: "plant supervisor", personZh: "车间主管" },
    { theme: "公共政策", scene: "执行评估", focusEn: "impact note", focusZh: "影响说明", placeEn: "policy unit", placeZh: "政策处", issueEn: "uptake gap", issueZh: "落实落差", supportEn: "field brief", supportZh: "一线简报", eventEn: "implementation review", eventZh: "执行评估", personEn: "policy adviser", personZh: "政策顾问" },
    { theme: "能源运维", scene: "检修追责", focusEn: "shutdown plan", focusZh: "停机方案", placeEn: "control bay", placeZh: "控制舱", issueEn: "load imbalance", issueZh: "负荷失衡", supportEn: "backup feed", supportZh: "备用馈线", eventEn: "repair window", eventZh: "检修窗口", personEn: "shift engineer", personZh: "值班工程师" },
    { theme: "非营利项目", scene: "捐助复盘", focusEn: "donor note", focusZh: "捐助方说明", placeEn: "field office", placeZh: "项目办公室", issueEn: "reporting gap", issueZh: "汇报缺口", supportEn: "grant extension", supportZh: "延期申请", eventEn: "funding review", eventZh: "资金复盘", personEn: "programme manager", personZh: "项目经理" },
];

const MANUAL_HIGH_BAND_SEEDS: HighBandSeed[] = [
    {
        id: "listen-c2-curated-001",
        chinese: "即使董事会原则上批准了提案，几个部门负责人还是一直拖延，说时间表不现实，长期成本也被低估了。",
        referenceEnglish: "Even after the board approved the proposal in principle, several department heads kept stalling, arguing that the timeline was unrealistic and the long-term costs had been underestimated.",
        targetEnglishVocab: ["proposal", "stalling", "timeline"],
        theme: "工作基础沟通",
        scene: "提案推进",
        tags: ["curated", "c2", "entry"],
        cefr: "C2",
        bandPosition: "entry",
        clauseCount: 2,
        qualityScore: 0.99,
    },
    {
        id: "listen-c2-curated-002",
        chinese: "如果第一次审计回来时那些警告被认真对待了，这次上线就不会在三个部门的拉扯下崩掉。",
        referenceEnglish: "Had the warnings been taken seriously when the first audit came back, the rollout wouldn't have collapsed under pressure from three competing departments.",
        targetEnglishVocab: ["warnings", "audit", "rollout"],
        theme: "工作基础沟通",
        scene: "上线复盘",
        tags: ["curated", "c2", "entry"],
        cefr: "C2",
        bandPosition: "entry",
        clauseCount: 2,
        qualityScore: 0.99,
    },
    {
        id: "listen-c2-curated-003",
        chinese: "直到线路主管把事故记录和调度版本并排放出来，大家才承认晚高峰根本不是运气差，而是判断一路都偏了。",
        referenceEnglish: "Not until the route supervisor laid the incident log beside the dispatch revision did everyone admit the evening peak had gone wrong because the judgment itself had drifted.",
        targetEnglishVocab: ["route supervisor", "incident log", "dispatch revision"],
        theme: "通勤出行",
        scene: "晚高峰失控",
        tags: ["curated", "c2", "entry"],
        cefr: "C2",
        bandPosition: "entry",
        clauseCount: 2,
        qualityScore: 0.99,
    },
    {
        id: "listen-c2-curated-004",
        chinese: "当项目主任把旧版评分标准和新版模块并排放出来时，大家才发现课程争议根本不是老师执行不稳，而是设计本身就没对齐。",
        referenceEnglish: "When the programme chair laid the older marking rubric beside the revised module, it became obvious the teaching dispute came from the design itself, not from inconsistent delivery.",
        targetEnglishVocab: ["programme chair", "marking rubric", "inconsistent delivery"],
        theme: "教育培训",
        scene: "课程对齐",
        tags: ["curated", "c2", "mid"],
        cefr: "C2",
        bandPosition: "mid",
        clauseCount: 2,
        qualityScore: 0.99,
    },
    {
        id: "listen-c2-curated-005",
        chinese: "虽然客户还在电话里追问交接为什么滑掉了，但真正把局面拖坏的，是前一版摘要把风险写得过于轻描淡写。",
        referenceEnglish: "Although the client kept pressing on the call about why the handover had slipped, what really prolonged the mess was how lightly the earlier summary had framed the risk.",
        targetEnglishVocab: ["handover", "slipped", "framed the risk"],
        theme: "客户服务",
        scene: "交付追问",
        tags: ["curated", "c2", "mid"],
        cefr: "C2",
        bandPosition: "mid",
        clauseCount: 2,
        qualityScore: 0.99,
    },
    {
        id: "listen-c2-curated-006",
        chinese: "等风控专员终于承认那份冻结通知只是为了暂时止血时，真正需要解释的转账链路早就被三轮口头说明弄得更模糊了。",
        referenceEnglish: "By the time the risk officer admitted the holding notice was only buying time, the transfer trail that actually needed explaining had been blurred by three rounds of verbal reassurance.",
        targetEnglishVocab: ["risk officer", "holding notice", "transfer trail"],
        theme: "银行邮局",
        scene: "口头安抚",
        tags: ["curated", "c2", "mid"],
        cefr: "C2",
        bandPosition: "mid",
        clauseCount: 2,
        qualityScore: 0.99,
    },
    {
        id: "listen-c2-curated-007",
        chinese: "即使第一次复核已经指出样本有偏，课题负责人还是让团队沿着原叙述继续写下去，结果整场评审都围着一个站不住脚的前提打转。",
        referenceEnglish: "Even after the first review flagged the sampling bias, the research lead kept the team writing along the same storyline, so the whole panel ended up circling a premise that wouldn't hold.",
        targetEnglishVocab: ["sampling bias", "storyline", "panel"],
        theme: "科研项目",
        scene: "前提失真",
        tags: ["curated", "c2", "exit"],
        cefr: "C2",
        bandPosition: "exit",
        clauseCount: 2,
        qualityScore: 0.99,
    },
    {
        id: "listen-c2-curated-008",
        chinese: "如果演出调度没有在开场前十分钟把替补团队叫上来，后台那套已经错开的提示点会让整场开场像是临时拼起来的一样。",
        referenceEnglish: "Had the show caller not brought in the standby crew ten minutes before the opening set, the cues already drifting backstage would have made the whole start feel patched together.",
        targetEnglishVocab: ["show caller", "standby crew", "patched together"],
        theme: "文化活动",
        scene: "开场救火",
        tags: ["curated", "c2", "exit"],
        cefr: "C2",
        bandPosition: "exit",
        clauseCount: 2,
        qualityScore: 0.99,
    },
    {
        id: "listen-c2-curated-009",
        chinese: "直到车间主管把最早那批检验记录和复线方案并排对上，大家才承认所谓偶发波动其实一直在系统性地推高返工。",
        referenceEnglish: "Not until the plant supervisor matched the earliest inspection batch against the restart plan did anyone admit the so-called isolated fluctuation had been driving rework up all along.",
        targetEnglishVocab: ["plant supervisor", "inspection batch", "rework"],
        theme: "制造质控",
        scene: "返工追因",
        tags: ["curated", "c2", "exit"],
        cefr: "C2",
        bandPosition: "exit",
        clauseCount: 2,
        qualityScore: 0.99,
    },
    {
        id: "listen-c2p-curated-001",
        chinese: "直到区域总监把原始数字并排比对，才有人承认所谓效率提升，其实只是把延误往下游甩，让地方团队在没预算也没权限的情况下临时补洞。",
        referenceEnglish: "Not until the regional directors compared the raw figures side by side did anyone admit the efficiency gains came from shifting delays downstream, where local teams were left improvising fixes without budget.",
        targetEnglishVocab: ["regional directors", "efficiency gains", "downstream"],
        theme: "工作基础沟通",
        scene: "数据追责",
        tags: ["curated", "c2p", "entry"],
        cefr: "C2+",
        bandPosition: "entry",
        clauseCount: 2,
        qualityScore: 0.99,
    },
    {
        id: "listen-c2p-curated-002",
        chinese: "临时调查结果泄露、投资人开始追问到底是谁批准了那些假设之后，高层才承认模型一直在夸大需求、低估风险，还悄悄忽略了最差的区域数据。",
        referenceEnglish: "Only after the interim findings leaked and investors started asking who had approved the assumptions did executives concede the model had been overstating demand, understating risk, and ignoring the weakest regional data.",
        targetEnglishVocab: ["interim findings", "assumptions", "regional data"],
        theme: "工作基础沟通",
        scene: "模型失真",
        tags: ["curated", "c2p", "entry"],
        cefr: "C2+",
        bandPosition: "entry",
        clauseCount: 2,
        qualityScore: 0.99,
    },
    {
        id: "listen-c2p-curated-003",
        chinese: "如果那份临时声明一开始不是拿来压舆情、而是真拿来解释事实，新闻秘书就不会在第三轮提问里还得为一条已经站不住脚的口径找补。",
        referenceEnglish: "Had the holding statement been used to explain the facts rather than merely dampen the coverage, the press secretary wouldn't have been patching an unsustainable line by the third round of questions.",
        targetEnglishVocab: ["holding statement", "press secretary", "unsustainable line"],
        theme: "媒体传播",
        scene: "舆情失控",
        tags: ["curated", "c2p", "entry"],
        cefr: "C2+",
        bandPosition: "entry",
        clauseCount: 2,
        qualityScore: 0.99,
    },
    {
        id: "listen-c2p-curated-004",
        chinese: "真正让合规律师放弃继续替那份披露解释的，并不是措辞本身，而是越往前追，越能看出整个问责流程都是围着一个被刻意缩小的问题搭起来的。",
        referenceEnglish: "What finally made compliance counsel stop defending the disclosure wasn't the wording alone, but how every step backward made it clearer the whole inquiry had been built around a deliberately narrowed problem.",
        targetEnglishVocab: ["compliance counsel", "disclosure", "inquiry"],
        theme: "法律合规",
        scene: "披露辩护",
        tags: ["curated", "c2p", "mid"],
        cefr: "C2+",
        bandPosition: "mid",
        clauseCount: 2,
        qualityScore: 0.99,
    },
    {
        id: "listen-c2p-curated-005",
        chinese: "等政策顾问终于承认所谓执行落差不是地区懒散、而是指标从一开始就没有覆盖真实情境时，那份影响说明已经误导了两轮资源分配。",
        referenceEnglish: "By the time the policy adviser admitted the uptake gap came from indicators that never captured the field reality, the impact note had already distorted two rounds of resource allocation.",
        targetEnglishVocab: ["policy adviser", "uptake gap", "resource allocation"],
        theme: "公共政策",
        scene: "指标误导",
        tags: ["curated", "c2p", "mid"],
        cefr: "C2+",
        bandPosition: "mid",
        clauseCount: 2,
        qualityScore: 0.99,
    },
    {
        id: "listen-c2p-curated-006",
        chinese: "即使值班工程师一开始就看见负荷失衡正在放大，真正把检修窗口拖成连锁事故的，还是那条一直被拿来粉饰稳定性的备用馈线。",
        referenceEnglish: "Even though the shift engineer saw the load imbalance widening from the start, what turned the repair window into a chain failure was the backup feed everyone cited as proof of stability.",
        targetEnglishVocab: ["shift engineer", "load imbalance", "backup feed"],
        theme: "能源运维",
        scene: "稳定性幻觉",
        tags: ["curated", "c2p", "mid"],
        cefr: "C2+",
        bandPosition: "mid",
        clauseCount: 2,
        qualityScore: 0.99,
    },
    {
        id: "listen-c2p-curated-007",
        chinese: "如果那份理赔摘要没有把争议写成单纯的资料缺口，评估组本该更早看出，真正被悄悄转移掉的其实是责任归属，而不是证据本身。",
        referenceEnglish: "Had the claim summary not reduced the dispute to a paperwork gap, the assessment unit might have seen earlier that what was being quietly shifted was liability itself, not the evidence.",
        targetEnglishVocab: ["claim summary", "assessment unit", "liability"],
        theme: "保险理赔",
        scene: "责任转移",
        tags: ["curated", "c2p", "exit"],
        cefr: "C2+",
        bandPosition: "exit",
        clauseCount: 2,
        qualityScore: 0.99,
    },
    {
        id: "listen-c2p-curated-008",
        chinese: "直到项目经理把捐助说明、现场简报和延期申请并排摊开，大家才承认所谓汇报缺口并非单点失误，而是整套资金叙事从头到尾都在回避最不利的事实。",
        referenceEnglish: "Not until the programme manager laid the donor note beside the extension request did everyone admit the reporting gap belonged to a funding narrative built to avoid the hardest facts.",
        targetEnglishVocab: ["programme manager", "extension request", "funding narrative"],
        theme: "非营利项目",
        scene: "资金叙事",
        tags: ["curated", "c2p", "exit"],
        cefr: "C2+",
        bandPosition: "exit",
        clauseCount: 2,
        qualityScore: 0.99,
    },
    {
        id: "listen-c2p-curated-009",
        chinese: "当基础设施负责人把恢复简报和最早的同步错误记录重新对照时，大家才意识到，真正崩塌的不是那次重启，而是此前几周一直被默许的判断方式。",
        referenceEnglish: "When the infra lead set the recovery brief against the earliest sync-failure logs, it became clear the real collapse was not the restart itself, but the judgment everyone had been normalizing.",
        targetEnglishVocab: ["infra lead", "recovery brief", "normalizing"],
        theme: "数字生活",
        scene: "判断失真",
        tags: ["curated", "c2p", "exit"],
        cefr: "C2+",
        bandPosition: "exit",
        clauseCount: 2,
        qualityScore: 0.99,
    },
];

function buildHighBandItem(seed: HighBandSeed): ListeningBankItem {
    const window = HIGH_BAND_WINDOWS[seed.cefr][seed.bandPosition];
    const defaults = HIGH_BAND_DEFAULTS[seed.cefr];

    return {
        id: seed.id,
        status: "active",
        reviewStatus: seed.reviewStatus ?? "curated",
        mode: "listening",
        chinese: seed.chinese,
        reference_english: seed.referenceEnglish,
        target_english_vocab: seed.targetEnglishVocab,
        theme: seed.theme,
        scene: seed.scene,
        tags: seed.tags,
        eloMin: window.min,
        eloMax: window.max,
        bandPosition: seed.bandPosition,
        cefr: seed.cefr,
        clauseCount: seed.clauseCount,
        memoryLoad: defaults.memoryLoad,
        spokenNaturalness: defaults.spokenNaturalness,
        reducedFormsPresence: defaults.reducedFormsPresence,
        qualityScore: seed.qualityScore,
    };
}

function keyFor(cefr: HighBandCefr, bandPosition: ListeningBandPosition): BucketKey {
    return `${cefr}-${bandPosition}`;
}

function inWordRange(seed: HighBandSeed) {
    const range = HIGH_BAND_WORD_RANGES[seed.cefr];
    const words = countWords(seed.referenceEnglish);
    return words >= range.min && words <= range.max;
}

function autoId(cefr: HighBandCefr, bandPosition: ListeningBandPosition, index: number) {
    const prefix = cefr === "C2" ? "c2" : "c2p";
    return `listen-auto-${prefix}-${bandPosition}-${String(index).padStart(3, "0")}`;
}

function shortSlot(value: string) {
    const parts = value.split(" ");
    if (parts.length <= 2) return value;
    return parts.slice(-2).join(" ");
}

function bandOpening(cefr: HighBandCefr, bandPosition: ListeningBandPosition, index: number) {
    const openers: Record<HighBandCefr, Record<ListeningBandPosition, string[]>> = {
        C2: {
            entry: ["Early,", "First,", "Initially,"],
            mid: ["Midway,", "Then,", "Later,"],
            exit: ["Finally,", "Eventually,", "In the end,"],
        },
        "C2+": {
            entry: ["First,", "Soon,", "Initially,"],
            mid: ["Later,", "Midway,", "Afterward,"],
            exit: ["Eventually,", "Finally,", "Looking back,"],
        },
    };

    const options = openers[cefr][bandPosition];
    return options[index % options.length] ?? "Later,";
}

function generatedQualityScore(cefr: HighBandCefr, bandPosition: ListeningBandPosition, index: number) {
    const base = cefr === "C2"
        ? bandPosition === "entry" ? 0.97 : bandPosition === "mid" ? 0.965 : 0.96
        : bandPosition === "entry" ? 0.965 : bandPosition === "mid" ? 0.96 : 0.955;
    return Math.max(0.91, base - index * 0.002);
}

function buildC2Candidates(bundle: ThemeBundle) {
    const focus = shortSlot(bundle.focusEn);
    const place = shortSlot(bundle.placeEn);
    const issue = shortSlot(bundle.issueEn);
    const support = shortSlot(bundle.supportEn);
    const event = shortSlot(bundle.eventEn);
    const person = shortSlot(bundle.personEn);

    return [
        {
            chinese: `虽然${bundle.issueZh}已经被提过两次，${bundle.personZh}还是把${bundle.eventZh}当成例行波动，结果${bundle.placeZh}只能围着${bundle.focusZh}补洞。`,
            referenceEnglish: `Although the ${issue} had surfaced twice, the ${person} still treated the ${event} as routine, leaving the ${place} to patch around the ${focus}.`,
            clauseCount: 2 as const,
        },
        {
            chinese: `等${bundle.personZh}承认${bundle.supportZh}稳不住${bundle.eventZh}时，我们已经改过${bundle.focusZh}，也提醒过${bundle.placeZh}别再相信原计划。`,
            referenceEnglish: `By the time the ${person} admitted the ${support} could not steady the ${event}, we'd already rewritten the ${focus} and warned the ${place}.`,
            clauseCount: 2 as const,
        },
        {
            chinese: `即使${bundle.placeZh}刚把积压清掉，${bundle.personZh}还是没放行${bundle.focusZh}，因为${bundle.issueZh}显然还在扩散。`,
            referenceEnglish: `Even after the ${place} cleared the backlog, the ${person} kept the ${focus} on hold because the ${issue} was still spreading through the ${event}.`,
            clauseCount: 2 as const,
        },
        {
            chinese: `如果${bundle.supportZh}明天在${bundle.eventZh}里再失手一次，${bundle.personZh}就得解释为什么${bundle.placeZh}一直被告知${bundle.focusZh}已经稳住了。`,
            referenceEnglish: `If the ${support} fails again during tomorrow's ${event}, the ${person} will have to explain why the ${place} was told the ${focus} was secure.`,
            clauseCount: 2 as const,
        },
        {
            chinese: `真正拖慢${bundle.eventZh}的并不是${bundle.placeZh}本身，而是${bundle.personZh}在第一版${bundle.focusZh}进来时，把${bundle.issueZh}写得过于轻描淡写。`,
            referenceEnglish: `What slowed the ${event} was not the ${place} itself, but how lightly the ${person} framed the ${issue} when the first ${focus} arrived.`,
            clauseCount: 2 as const,
        },
        {
            chinese: `要是${bundle.personZh}早点把旧版${bundle.focusZh}和最新版对上，${bundle.placeZh}本来有机会在${bundle.issueZh}带偏整场${bundle.eventZh}前拦下来。`,
            referenceEnglish: `Had the ${person} checked the earlier ${focus} against the latest draft, the ${place} might have caught the ${issue} before it bent the ${event}.`,
            clauseCount: 2 as const,
        },
        {
            chinese: `一旦${bundle.personZh}看出来${bundle.supportZh}其实只是在掩盖${bundle.issueZh}，我们就不再替${bundle.eventZh}的时间线辩护，而是直接重写${bundle.focusZh}。`,
            referenceEnglish: `Once the ${person} saw the ${support} was masking the ${issue}, we stopped defending the ${event} timeline and rebuilt the ${focus}.`,
            clauseCount: 2 as const,
        },
        {
            chinese: `直到${bundle.placeZh}把最终的${bundle.focusZh}和原始版本并排比较，大家才承认${bundle.issueZh}其实一直在悄悄重塑整场${bundle.eventZh}。`,
            referenceEnglish: `Not until the ${place} compared the final ${focus} with the original draft did anyone concede the ${issue} had reshaped the whole ${event}.`,
            clauseCount: 2 as const,
        },
    ];
}

function buildC2PlusCandidates(bundle: ThemeBundle) {
    const focus = shortSlot(bundle.focusEn);
    const place = shortSlot(bundle.placeEn);
    const issue = shortSlot(bundle.issueEn);
    const support = shortSlot(bundle.supportEn);
    const event = shortSlot(bundle.eventEn);
    const person = shortSlot(bundle.personEn);

    return [
        {
            chinese: `直到${bundle.personZh}把更早的${bundle.focusZh}摊在最新版旁边，大家才承认${bundle.issueZh}已经改写了整场${bundle.eventZh}。`,
            referenceEnglish: `Not until the ${person} laid the earlier ${focus} beside the latest draft did anyone admit the ${issue} had rewritten the ${event}.`,
            clauseCount: 2 as const,
        },
        {
            chinese: `真正让信心松掉的，不是延误本身，而是${bundle.personZh}一直把${bundle.issueZh}绕着${bundle.focusZh}重说。`,
            referenceEnglish: `What broke confidence was not the delay alone, but the way the ${person} kept recasting the ${issue} around the ${focus}.`,
            clauseCount: 2 as const,
        },
        {
            chinese: `如果${bundle.supportZh}一开始没有盖住${bundle.issueZh}的苗头，${bundle.personZh}早就得解释为什么${bundle.eventZh}会一路走偏。`,
            referenceEnglish: `Had the ${support} not masked the first signs of the ${issue}, the ${person} would've had to explain much sooner why the ${event} kept slipping.`,
            clauseCount: 2 as const,
        },
        {
            chinese: `等${bundle.placeZh}承认${bundle.supportZh}已经稳不住${bundle.eventZh}时，${bundle.personZh}早就拿错误的${bundle.focusZh}给三支团队做过说明。`,
            referenceEnglish: `By the time the ${place} admitted the ${support} could not stabilize the ${event}, the ${person} had briefed three teams off the wrong ${focus}.`,
            clauseCount: 2 as const,
        },
        {
            chinese: `即使第一次复核已经把${bundle.issueZh}掀出来了，${bundle.personZh}还是一直替${bundle.focusZh}辩护，结果${bundle.placeZh}只能继续围着同一个故障补救。`,
            referenceEnglish: `Even after the first review exposed the ${issue}, the ${person} kept defending the ${focus}, leaving the ${place} to improvise around the same failure.`,
            clauseCount: 2 as const,
        },
        {
            chinese: `如果${bundle.eventZh}只是单纯地晚了，${bundle.placeZh}大概还能吞下去，可${bundle.issueZh}已经把${bundle.focusZh}扭曲得太厉害。`,
            referenceEnglish: `Were the ${event} merely late, the ${place} could absorb it, but the ${issue} had already distorted the ${focus} beyond repair.`,
            clauseCount: 2 as const,
        },
        {
            chinese: `只有当${bundle.personZh}重建被丢开的${bundle.focusZh}时间线时，大家才真正看清${bundle.issueZh}是怎样一路穿过整场${bundle.eventZh}的。`,
            referenceEnglish: `Only once the ${person} rebuilt the timeline from the discarded ${focus} did everyone grasp how the ${issue} had spread through the ${event}.`,
            clauseCount: 2 as const,
        },
        {
            chinese: `如果${bundle.supportZh}还是在掩盖${bundle.issueZh}而不是压住它，${bundle.personZh}就别想把下一轮${bundle.eventZh}说成普通修正。`,
            referenceEnglish: `If the ${support} is still concealing the ${issue} more than containing it, the ${person} cannot sell the next ${event} as routine.`,
            clauseCount: 2 as const,
        },
    ];
}

function buildGeneratedCandidates(bundle: ThemeBundle, cefr: HighBandCefr, bandPosition: ListeningBandPosition) {
    const baseSeeds = cefr === "C2" ? buildC2Candidates(bundle) : buildC2PlusCandidates(bundle);
    return baseSeeds.map((seed, index) => ({
        id: "",
        chinese: `${bandOpening(cefr, bandPosition, index)} ${seed.chinese}`,
        referenceEnglish: `${bandOpening(cefr, bandPosition, index)} ${seed.referenceEnglish}`,
        targetEnglishVocab: [bundle.focusEn, bundle.issueEn, bundle.eventEn],
        theme: bundle.theme,
        scene: bundle.scene,
        tags: ["generated", cefr.toLowerCase().replace("+", "p"), bandPosition, `template-${index + 1}`],
        cefr,
        bandPosition,
        clauseCount: seed.clauseCount,
        qualityScore: generatedQualityScore(cefr, bandPosition, index),
    } satisfies HighBandSeed));
}

function buildGeneratedBucket(cefr: HighBandCefr, bandPosition: ListeningBandPosition, existingEnglish: Set<string>) {
    const key = keyFor(cefr, bandPosition);
    const targetCount = HIGH_BAND_BUCKET_TARGETS[key];
    const manualSeeds = MANUAL_HIGH_BAND_SEEDS.filter((seed) => seed.cefr === cefr && seed.bandPosition === bandPosition);
    const selected = [...manualSeeds];
    const candidatePool = HIGH_BAND_THEMES.flatMap((bundle) => buildGeneratedCandidates(bundle, cefr, bandPosition));

    let generatedIndex = 1;
    for (const seed of candidatePool) {
        if (selected.length >= targetCount) break;
        if (!inWordRange(seed)) continue;
        if (existingEnglish.has(seed.referenceEnglish)) continue;
        selected.push({
            ...seed,
            id: autoId(cefr, bandPosition, generatedIndex),
        });
        existingEnglish.add(seed.referenceEnglish);
        generatedIndex += 1;
    }

    if (selected.length !== targetCount) {
        throw new Error(`Unable to build high-band bucket ${key}: expected ${targetCount}, got ${selected.length}`);
    }

    return selected;
}

const existingEnglish = new Set(MANUAL_HIGH_BAND_SEEDS.map((seed) => seed.referenceEnglish));

const HIGH_BAND_GENERATED_SEEDS = [
    ...buildGeneratedBucket("C2", "entry", existingEnglish),
    ...buildGeneratedBucket("C2", "mid", existingEnglish),
    ...buildGeneratedBucket("C2", "exit", existingEnglish),
    ...buildGeneratedBucket("C2+", "entry", existingEnglish),
    ...buildGeneratedBucket("C2+", "mid", existingEnglish),
    ...buildGeneratedBucket("C2+", "exit", existingEnglish),
];

export const HIGH_BAND_LISTENING_DRILLS = HIGH_BAND_GENERATED_SEEDS.map(buildHighBandItem);
