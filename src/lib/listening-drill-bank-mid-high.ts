import { countWords } from "@/lib/translationDifficulty";

import type {
    ListeningBandPosition,
    ListeningBankItem,
    ListeningCefr,
    ListeningMemoryLoad,
    ListeningNaturalness,
    ListeningReducedFormsPresence,
    ListeningReviewStatus,
} from "./listening-drill-bank";

type MidHighCefr = "B1" | "B2" | "C1";

type MidHighSeed = {
    id: string;
    chinese: string;
    referenceEnglish: string;
    targetEnglishVocab: string[];
    theme: string;
    scene: string;
    tags: string[];
    cefr: MidHighCefr;
    bandPosition: ListeningBandPosition;
    clauseCount: 1 | 2;
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

type BucketKey = `${MidHighCefr}-${ListeningBandPosition}`;

const MID_HIGH_WINDOWS: Record<MidHighCefr, Record<ListeningBandPosition, { min: number; max: number }>> = {
    B1: {
        entry: { min: 1200, max: 1329 },
        mid: { min: 1330, max: 1464 },
        exit: { min: 1465, max: 1599 },
    },
    B2: {
        entry: { min: 1600, max: 1729 },
        mid: { min: 1730, max: 1864 },
        exit: { min: 1865, max: 1999 },
    },
    C1: {
        entry: { min: 2000, max: 2129 },
        mid: { min: 2130, max: 2264 },
        exit: { min: 2265, max: 2399 },
    },
};

const MID_HIGH_DEFAULTS: Record<MidHighCefr, {
    memoryLoad: ListeningMemoryLoad;
    spokenNaturalness: ListeningNaturalness;
    reducedFormsPresence: ListeningReducedFormsPresence;
}> = {
    B1: {
        memoryLoad: "medium",
        spokenNaturalness: "medium",
        reducedFormsPresence: "some",
    },
    B2: {
        memoryLoad: "high",
        spokenNaturalness: "high",
        reducedFormsPresence: "frequent",
    },
    C1: {
        memoryLoad: "high",
        spokenNaturalness: "high",
        reducedFormsPresence: "frequent",
    },
};

const MID_HIGH_WORD_RANGES: Record<MidHighCefr, { min: number; max: number }> = {
    B1: { min: 12, max: 18 },
    B2: { min: 14, max: 22 },
    C1: { min: 16, max: 26 },
};

const MID_HIGH_BUCKET_TARGETS: Record<BucketKey, number> = {
    "B1-entry": 224,
    "B1-mid": 224,
    "B1-exit": 224,
    "B2-entry": 222,
    "B2-mid": 222,
    "B2-exit": 222,
    "C1-entry": 221,
    "C1-mid": 221,
    "C1-exit": 220,
};

const MID_HIGH_THEMES: ThemeBundle[] = [
    { theme: "工作基础沟通", scene: "项目推进", focusEn: "timeline", focusZh: "时间表", placeEn: "briefing room", placeZh: "简报室", issueEn: "backlog", issueZh: "积压任务", supportEn: "handover notes", supportZh: "交接记录", eventEn: "rollout", eventZh: "上线", personEn: "manager", personZh: "经理" },
    { theme: "通勤出行", scene: "临时改线", focusEn: "ticket batch", focusZh: "车票批次", placeEn: "platform office", placeZh: "站台办公室", issueEn: "service change", issueZh: "线路调整", supportEn: "backup shuttle", supportZh: "备用接驳车", eventEn: "departure", eventZh: "发车", personEn: "dispatcher", personZh: "调度员" },
    { theme: "旅行住宿", scene: "酒店协调", focusEn: "booking file", focusZh: "预订资料", placeEn: "lobby desk", placeZh: "大堂前台", issueEn: "room mix-up", issueZh: "房间分配错误", supportEn: "storage receipt", supportZh: "寄存单", eventEn: "late checkout", eventZh: "延迟退房", personEn: "concierge", personZh: "礼宾员" },
    { theme: "身体状态/简单就医", scene: "检查安排", focusEn: "test report", focusZh: "检查报告", placeEn: "clinic window", placeZh: "诊所窗口", issueEn: "schedule clash", issueZh: "时间冲突", supportEn: "follow-up note", supportZh: "复诊备注", eventEn: "checkup", eventZh: "复查", personEn: "nurse", personZh: "护士" },
    { theme: "校园教室", scene: "课程协调", focusEn: "project draft", focusZh: "项目草稿", placeEn: "media lab", placeZh: "媒体教室", issueEn: "room conflict", issueZh: "教室冲突", supportEn: "feedback sheet", supportZh: "反馈表", eventEn: "presentation", eventZh: "展示", personEn: "lecturer", personZh: "讲师" },
    { theme: "数字生活", scene: "系统异常", focusEn: "login token", focusZh: "登录令牌", placeEn: "admin panel", placeZh: "管理面板", issueEn: "server lag", issueZh: "服务器卡顿", supportEn: "mirror link", supportZh: "镜像链接", eventEn: "sync cycle", eventZh: "同步流程", personEn: "admin", personZh: "管理员" },
    { theme: "银行邮局", scene: "柜台办理", focusEn: "transfer form", focusZh: "转账表格", placeEn: "service counter", placeZh: "服务柜台", issueEn: "identity mismatch", issueZh: "身份信息不符", supportEn: "stamped receipt", supportZh: "盖章回执", eventEn: "wire request", eventZh: "汇款申请", personEn: "clerk", personZh: "柜员" },
    { theme: "文化活动", scene: "演出协调", focusEn: "seat map", focusZh: "座位图", placeEn: "backstage hall", placeZh: "后台走廊", issueEn: "entry delay", issueZh: "入场延误", supportEn: "guest pass", supportZh: "来宾证", eventEn: "concert", eventZh: "演出", personEn: "usher", personZh: "引导员" },
    { theme: "餐厅服务", scene: "高峰服务", focusEn: "reservation card", focusZh: "预订卡", placeEn: "patio section", placeZh: "露台区", issueEn: "table shuffle", issueZh: "桌位调整", supportEn: "extra menu", supportZh: "备用菜单", eventEn: "dinner rush", eventZh: "晚市高峰", personEn: "host", personZh: "领位员" },
    { theme: "社区邻里", scene: "楼栋协调", focusEn: "pickup code", focusZh: "取件码", placeEn: "mail room", placeZh: "收发室", issueEn: "locker jam", issueZh: "柜门卡住", supportEn: "access note", supportZh: "通行说明", eventEn: "parcel handoff", eventZh: "包裹交接", personEn: "caretaker", personZh: "管理员" },
    { theme: "兴趣休闲", scene: "户外活动", focusEn: "trail permit", focusZh: "步道许可", placeEn: "ridge cabin", placeZh: "山脊小屋", issueEn: "weather shift", issueZh: "天气突变", supportEn: "gear checklist", supportZh: "装备清单", eventEn: "hike start", eventZh: "徒步出发", personEn: "guide", personZh: "领队" },
    { theme: "运动健身", scene: "训练安排", focusEn: "practice sheet", focusZh: "训练表", placeEn: "upper court", placeZh: "上层球场", issueEn: "timing error", issueZh: "时间误差", supportEn: "warmup plan", supportZh: "热身计划", eventEn: "scrimmage", eventZh: "对抗训练", personEn: "captain", personZh: "队长" },
    { theme: "宠物照看", scene: "寄养交接", focusEn: "care note", focusZh: "照看说明", placeEn: "grooming room", placeZh: "美容室", issueEn: "feeding mix-up", issueZh: "喂食弄错", supportEn: "backup leash", supportZh: "备用牵引绳", eventEn: "pickup slot", eventZh: "接宠时间", personEn: "handler", personZh: "照看员" },
    { theme: "城市办事", scene: "窗口办理", focusEn: "claim packet", focusZh: "申领材料", placeEn: "records office", placeZh: "档案室", issueEn: "form mismatch", issueZh: "表格不匹配", supportEn: "queue slip", supportZh: "排队单", eventEn: "document pickup", eventZh: "材料领取", personEn: "officer", personZh: "办事员" },
    { theme: "媒体制作", scene: "现场排期", focusEn: "edit log", focusZh: "剪辑记录", placeEn: "control booth", placeZh: "控制间", issueEn: "audio drift", issueZh: "音频偏移", supportEn: "cue sheet", supportZh: "提示表", eventEn: "live segment", eventZh: "直播片段", personEn: "producer", personZh: "制片人" },
    { theme: "客户服务", scene: "问题升级", focusEn: "case file", focusZh: "工单资料", placeEn: "help desk", placeZh: "服务台", issueEn: "refund dispute", issueZh: "退款争议", supportEn: "call summary", supportZh: "通话摘要", eventEn: "follow-up call", eventZh: "回访电话", personEn: "agent", personZh: "客服" },
    { theme: "设施维护", scene: "维修安排", focusEn: "repair slot", focusZh: "维修时段", placeEn: "service corridor", placeZh: "维修走廊", issueEn: "power fault", issueZh: "电力故障", supportEn: "access badge", supportZh: "通行工牌", eventEn: "inspection round", eventZh: "巡检", personEn: "supervisor", personZh: "主管" },
    { theme: "零售运营", scene: "换陈列", focusEn: "promo stand", focusZh: "促销展架", placeEn: "stock room", placeZh: "仓储间", issueEn: "label error", issueZh: "标签错误", supportEn: "price sheet", supportZh: "价目表", eventEn: "store reset", eventZh: "门店调整", personEn: "lead", personZh: "值班主管" },
    { theme: "活动执行", scene: "现场调度", focusEn: "vendor list", focusZh: "供应商名单", placeEn: "check-in tent", placeZh: "签到帐篷", issueEn: "timing slip", issueZh: "时间拖延", supportEn: "run sheet", supportZh: "流程单", eventEn: "opening set", eventZh: "开场环节", personEn: "coordinator", personZh: "统筹" },
    { theme: "教育培训", scene: "培训跟进", focusEn: "module draft", focusZh: "培训模块草稿", placeEn: "training hub", placeZh: "培训中心", issueEn: "version gap", issueZh: "版本差异", supportEn: "review copy", supportZh: "审阅稿", eventEn: "training block", eventZh: "培训场次", personEn: "mentor", personZh: "导师" },
    { theme: "物流配送", scene: "分拨协调", focusEn: "routing sheet", focusZh: "分拨单", placeEn: "loading bay", placeZh: "装货口", issueEn: "address error", issueZh: "地址错误", supportEn: "scan record", supportZh: "扫描记录", eventEn: "dispatch window", eventZh: "发运窗口", personEn: "loader", personZh: "装车员" },
    { theme: "法务合规", scene: "文件复核", focusEn: "policy draft", focusZh: "政策草案", placeEn: "review desk", placeZh: "复核台", issueEn: "approval gap", issueZh: "审批缺口", supportEn: "marked copy", supportZh: "标注版", eventEn: "review cycle", eventZh: "审查轮次", personEn: "counsel", personZh: "法务" },
    { theme: "保险理赔", scene: "补件沟通", focusEn: "claim letter", focusZh: "理赔函", placeEn: "claims office", placeZh: "理赔办公室", issueEn: "coverage dispute", issueZh: "保障争议", supportEn: "evidence pack", supportZh: "证据包", eventEn: "claim review", eventZh: "理赔审核", personEn: "adjuster", personZh: "理算员" },
    { theme: "公共服务", scene: "现场通知", focusEn: "notice board", focusZh: "公告板", placeEn: "service hall", placeZh: "服务大厅", issueEn: "queue surge", issueZh: "排队激增", supportEn: "priority slip", supportZh: "优先单", eventEn: "walk-in hour", eventZh: "现场办理时段", personEn: "staffer", personZh: "工作人员" },
];

const BASE_MID_HIGH_SEEDS: MidHighSeed[] = [
    {
        id: "listen-b1-curated-001",
        chinese: "当我意识到汤已经开了时，我关掉了炉子。",
        referenceEnglish: "I turned off the stove when I realized the soup was already boiling.",
        targetEnglishVocab: ["stove", "realized", "boiling"],
        theme: "家庭日常",
        scene: "厨房提醒",
        tags: ["curated", "b1", "mid"],
        cefr: "B1",
        bandPosition: "mid",
        clauseCount: 1,
        qualityScore: 0.99,
    },
    {
        id: "listen-b1-curated-002",
        chinese: "我们提前离开了演唱会，因为停车场已经快满了。",
        referenceEnglish: "We left the concert early because the parking lot was already filling up.",
        targetEnglishVocab: ["concert", "parking", "filling"],
        theme: "文化活动",
        scene: "散场离开",
        tags: ["curated", "b1", "entry"],
        cefr: "B1",
        bandPosition: "entry",
        clauseCount: 1,
        qualityScore: 0.99,
    },
    {
        id: "listen-b1-curated-003",
        chinese: "包裹被送到了那家周五午饭前就关门的办公室。",
        referenceEnglish: "The package was delivered to the office that closes before lunch on Fridays.",
        targetEnglishVocab: ["package", "office", "Fridays"],
        theme: "物流配送",
        scene: "快递签收",
        tags: ["curated", "b1", "exit"],
        cefr: "B1",
        bandPosition: "exit",
        clauseCount: 1,
        qualityScore: 0.99,
    },
    {
        id: "listen-b2-curated-001",
        chinese: "虽然我们很早就订票了，但航空公司改了座位，把一家人拆到了三排。",
        referenceEnglish: "Although we'd booked early, the airline moved our seats and split the family across three rows.",
        targetEnglishVocab: ["airline", "split", "rows"],
        theme: "旅行住宿",
        scene: "航班改座",
        tags: ["curated", "b2", "entry"],
        cefr: "B2",
        bandPosition: "entry",
        clauseCount: 1,
        qualityScore: 0.99,
    },
    {
        id: "listen-b2-curated-002",
        chinese: "如果供应商再错过一个截止日期，我们会在审查委员会再次开会前失去合同。",
        referenceEnglish: "If the supplier misses another deadline, we're going to lose the contract before the review board meets again.",
        targetEnglishVocab: ["supplier", "deadline", "contract"],
        theme: "工作基础沟通",
        scene: "项目延期",
        tags: ["curated", "b2", "mid"],
        cefr: "B2",
        bandPosition: "mid",
        clauseCount: 1,
        qualityScore: 0.99,
    },
    {
        id: "listen-c1-curated-001",
        chinese: "如果他们早点标出那个差异，我们本可以在董事会开始质疑每项预测前把报告改好。",
        referenceEnglish: "If they'd flagged the discrepancy sooner, we could've fixed the report before the board started questioning every projection.",
        targetEnglishVocab: ["flagged", "discrepancy", "projection"],
        theme: "工作基础沟通",
        scene: "报告修正",
        tags: ["curated", "c1", "entry"],
        cefr: "C1",
        bandPosition: "entry",
        clauseCount: 1,
        qualityScore: 0.99,
    },
    {
        id: "listen-c1-curated-002",
        chinese: "一旦信任崩掉，而且每次更新都被当成危机公关，团队很少还能恢复得这么快。",
        referenceEnglish: "Rarely do teams recover so quickly once trust has broken down and every update is being read as damage control.",
        targetEnglishVocab: ["recover", "trust", "damage control"],
        theme: "工作基础沟通",
        scene: "团队信任",
        tags: ["curated", "c1", "exit"],
        cefr: "C1",
        bandPosition: "exit",
        clauseCount: 1,
        qualityScore: 0.99,
    },
    {
        id: "listen-b1-curated-004",
        chinese: "会议推迟后，我把标注版带去楼上的小会议室重新核对。",
        referenceEnglish: "After the meeting slipped, I carried the marked copy upstairs to check it again.",
        targetEnglishVocab: ["meeting", "marked copy", "upstairs"],
        theme: "法务合规",
        scene: "复核资料",
        tags: ["curated", "b1", "entry"],
        cefr: "B1",
        bandPosition: "entry",
        clauseCount: 1,
        qualityScore: 0.98,
    },
    {
        id: "listen-b1-curated-005",
        chinese: "导览快结束时，讲解员让我们把耳机留在出口旁的桌上。",
        referenceEnglish: "When the tour was wrapping up, the guide asked us to leave the headsets by the exit table.",
        targetEnglishVocab: ["tour", "guide", "headsets"],
        theme: "文化活动",
        scene: "归还设备",
        tags: ["curated", "b1", "mid"],
        cefr: "B1",
        bandPosition: "mid",
        clauseCount: 1,
        qualityScore: 0.98,
    },
    {
        id: "listen-b1-curated-006",
        chinese: "如果前台还没确认寄存单，我们就先把行李放在靠墙那排椅子边。",
        referenceEnglish: "If reception still hasn't checked the storage slip, we'll keep the bags by the wall chairs for now.",
        targetEnglishVocab: ["reception", "storage slip", "bags"],
        theme: "旅行住宿",
        scene: "临时放行李",
        tags: ["curated", "b1", "exit"],
        cefr: "B1",
        bandPosition: "exit",
        clauseCount: 1,
        qualityScore: 0.98,
    },
    {
        id: "listen-b2-curated-003",
        chinese: "虽然清单看上去没问题，但装货口那边的地址错误已经把整批分拨拖慢了。",
        referenceEnglish: "Although the routing sheet looked fine, the address error at the loading bay had already slowed the whole batch.",
        targetEnglishVocab: ["routing sheet", "address error", "batch"],
        theme: "物流配送",
        scene: "分拨出错",
        tags: ["curated", "b2", "entry"],
        cefr: "B2",
        bandPosition: "entry",
        clauseCount: 1,
        qualityScore: 0.98,
    },
    {
        id: "listen-b2-curated-004",
        chinese: "如果客服没先升级那张工单，我们根本不会发现退款争议已经影响到下周的回访。",
        referenceEnglish: "If support hadn't escalated the case first, we wouldn't have noticed the refund dispute was already affecting next week's follow-up.",
        targetEnglishVocab: ["support", "case", "refund dispute"],
        theme: "客户服务",
        scene: "工单升级",
        tags: ["curated", "b2", "mid"],
        cefr: "B2",
        bandPosition: "mid",
        clauseCount: 2,
        qualityScore: 0.98,
    },
    {
        id: "listen-b2-curated-005",
        chinese: "即使现场入口已经稳定下来，统筹还是让我们保留备用流程单，以防开场环节再出差错。",
        referenceEnglish: "Even after the entrance settled down, the coordinator kept the spare run sheet in place in case the opening set slipped again.",
        targetEnglishVocab: ["coordinator", "run sheet", "opening set"],
        theme: "活动执行",
        scene: "保留备用方案",
        tags: ["curated", "b2", "exit"],
        cefr: "B2",
        bandPosition: "exit",
        clauseCount: 2,
        qualityScore: 0.98,
    },
    {
        id: "listen-c1-curated-003",
        chinese: "等管理员承认同步流程根本撑不住那波流量时，前面的补救窗口其实已经过去了。",
        referenceEnglish: "By the time the admin admitted the sync cycle couldn't handle that traffic spike, the easiest recovery window had already gone.",
        targetEnglishVocab: ["admin", "sync cycle", "traffic spike"],
        theme: "数字生活",
        scene: "错过恢复窗口",
        tags: ["curated", "c1", "entry"],
        cefr: "C1",
        bandPosition: "entry",
        clauseCount: 2,
        qualityScore: 0.98,
    },
    {
        id: "listen-c1-curated-004",
        chinese: "真正让理赔审核卡住的，不是补件慢，而是前一版说明把关键证据写得过于轻描淡写。",
        referenceEnglish: "What really stalled the claim review wasn't the delay in paperwork, but how lightly the earlier note had framed the key evidence.",
        targetEnglishVocab: ["claim review", "paperwork", "evidence"],
        theme: "保险理赔",
        scene: "审核卡住",
        tags: ["curated", "c1", "mid"],
        cefr: "C1",
        bandPosition: "mid",
        clauseCount: 2,
        qualityScore: 0.98,
    },
    {
        id: "listen-c1-curated-005",
        chinese: "直到导师把两版培训模块并排比较，大家才承认那处版本差异已经把整轮培训判断带偏了。",
        referenceEnglish: "Not until the mentor compared the two module drafts side by side did everyone admit the version gap had skewed the whole training review.",
        targetEnglishVocab: ["mentor", "module drafts", "version gap"],
        theme: "教育培训",
        scene: "版本差异",
        tags: ["curated", "c1", "exit"],
        cefr: "C1",
        bandPosition: "exit",
        clauseCount: 2,
        qualityScore: 0.98,
    },
    {
        id: "listen-b1-curated-007",
        chinese: "请把备用钥匙留在前台，直到退房。",
        referenceEnglish: "Please keep the spare key at the front desk until checkout today.",
        targetEnglishVocab: ["spare key", "front desk", "checkout"],
        theme: "旅行住宿",
        scene: "前台交接",
        tags: ["curated", "b1", "entry"],
        cefr: "B1",
        bandPosition: "entry",
        clauseCount: 1,
        qualityScore: 0.99,
    },
    {
        id: "listen-b1-curated-008",
        chinese: "午饭结束后，我们把课程挪到了四号教室。",
        referenceEnglish: "We moved the lesson to room four right after lunch was over.",
        targetEnglishVocab: ["lesson", "room four", "lunch"],
        theme: "校园教室",
        scene: "换教室",
        tags: ["curated", "b1", "mid"],
        cefr: "B1",
        bandPosition: "mid",
        clauseCount: 1,
        qualityScore: 0.99,
    },
    {
        id: "listen-b1-curated-009",
        chinese: "公交刚开走，我就给司机打了电话，确认下一站还能不能上车。",
        referenceEnglish: "I called the driver as soon as the bus left the stop to check the next ride.",
        targetEnglishVocab: ["driver", "bus", "stop"],
        theme: "通勤出行",
        scene: "错过公交",
        tags: ["curated", "b1", "exit"],
        cefr: "B1",
        bandPosition: "exit",
        clauseCount: 1,
        qualityScore: 0.99,
    },
    {
        id: "listen-b2-curated-006",
        chinese: "等经理打来电话时，我们已经把设备搬进储物间了。",
        referenceEnglish: "By the time the manager called, we'd already moved the equipment into the storage room.",
        targetEnglishVocab: ["manager", "equipment", "storage room"],
        theme: "工作基础沟通",
        scene: "设备转移",
        tags: ["curated", "b2", "entry"],
        cefr: "B2",
        bandPosition: "entry",
        clauseCount: 1,
        qualityScore: 0.99,
    },
    {
        id: "listen-b2-curated-007",
        chinese: "虽然房间看起来已经准备好了，投影仪在图表讲解那段还是一直断断续续。",
        referenceEnglish: "Although the room looked ready, the projector kept cutting out during the chart review.",
        targetEnglishVocab: ["projector", "chart", "review"],
        theme: "客户服务",
        scene: "设备故障",
        tags: ["curated", "b2", "mid"],
        cefr: "B2",
        bandPosition: "mid",
        clauseCount: 1,
        qualityScore: 0.99,
    },
    {
        id: "listen-b2-curated-008",
        chinese: "如果客户再要一次修改，我们就得在明天早上前把摘要重写一遍。",
        referenceEnglish: "If the client asks for another revision, we'll need to rewrite the summary before morning.",
        targetEnglishVocab: ["client", "revision", "summary"],
        theme: "工作基础沟通",
        scene: "修改摘要",
        tags: ["curated", "b2", "exit"],
        cefr: "B2",
        bandPosition: "exit",
        clauseCount: 1,
        qualityScore: 0.99,
    },
    {
        id: "listen-c1-curated-006",
        chinese: "等我们注意到那个差异时，报告其实已经悄悄影响了董事会的反应。",
        referenceEnglish: "By the time we noticed the discrepancy, the report had already quietly shaped the board's reaction.",
        targetEnglishVocab: ["discrepancy", "report", "board"],
        theme: "工作基础沟通",
        scene: "数据偏差",
        tags: ["curated", "c1", "entry"],
        cefr: "C1",
        bandPosition: "entry",
        clauseCount: 1,
        qualityScore: 0.99,
    },
    {
        id: "listen-c1-curated-007",
        chinese: "真正让这个延误显得棘手的，不是延误本身，而是它一直把注意力从真正的问题上带开。",
        referenceEnglish: "What made the delay awkward was not the delay itself, but the way it kept pulling attention away from the real issue.",
        targetEnglishVocab: ["delay", "attention", "issue"],
        theme: "客户服务",
        scene: "延误解释",
        tags: ["curated", "c1", "mid"],
        cefr: "C1",
        bandPosition: "mid",
        clauseCount: 2,
        qualityScore: 0.99,
    },
    {
        id: "listen-c1-curated-008",
        chinese: "直到第二次复核时，大家才承认前面的备注把问题写得太圆滑了，根本帮不上忙。",
        referenceEnglish: "Not until the second review did everyone admit the earlier notes had framed the problem too neatly to be useful.",
        targetEnglishVocab: ["review", "notes", "problem"],
        theme: "教育培训",
        scene: "复核问题",
        tags: ["curated", "c1", "exit"],
        cefr: "C1",
        bandPosition: "exit",
        clauseCount: 2,
        qualityScore: 0.99,
    },
    {
        id: "listen-b1-curated-010",
        chinese: "老师说等屏幕上的幻灯片加载完，我们就可以离开。",
        referenceEnglish: "The teacher said we could leave once the slides finished loading on screen.",
        targetEnglishVocab: ["teacher", "slides", "screen"],
        theme: "校园教室",
        scene: "课件等待",
        tags: ["curated", "b1", "entry"],
        cefr: "B1",
        bandPosition: "entry",
        clauseCount: 1,
        qualityScore: 0.99,
    },
    {
        id: "listen-b1-curated-011",
        chinese: "我一直等到最后一班接驳车终于来了。",
        referenceEnglish: "I waited by the platform until the last shuttle finally showed up.",
        targetEnglishVocab: ["platform", "shuttle", "finally"],
        theme: "通勤出行",
        scene: "等末班车",
        tags: ["curated", "b1", "exit"],
        cefr: "B1",
        bandPosition: "exit",
        clauseCount: 1,
        qualityScore: 0.99,
    },
    {
        id: "listen-b2-curated-009",
        chinese: "我们把会开得很短，因为半个团队还没看过更新后的简报。",
        referenceEnglish: "We kept the meeting short because half the team still hadn't seen the updated brief.",
        targetEnglishVocab: ["meeting", "brief", "team"],
        theme: "工作基础沟通",
        scene: "简报更新",
        tags: ["curated", "b2", "mid"],
        cefr: "B2",
        bandPosition: "mid",
        clauseCount: 1,
        qualityScore: 0.99,
    },
    {
        id: "listen-b2-curated-010",
        chinese: "如果客户又改范围，我们就得在周五前把计划重新调一遍。",
        referenceEnglish: "If the client changes the scope again, we'll need to adjust the plan before Friday.",
        targetEnglishVocab: ["client", "scope", "plan"],
        theme: "工作基础沟通",
        scene: "范围调整",
        tags: ["curated", "b2", "exit"],
        cefr: "B2",
        bandPosition: "exit",
        clauseCount: 1,
        qualityScore: 0.99,
    },
    {
        id: "listen-c1-curated-009",
        chinese: "等数据最终平稳下来，原来的解释对任何人来说都站不住脚了。",
        referenceEnglish: "By the time the numbers settled, the original explanation no longer held up for anyone else.",
        targetEnglishVocab: ["numbers", "explanation", "settled"],
        theme: "工作基础沟通",
        scene: "解释失效",
        tags: ["curated", "c1", "entry"],
        cefr: "C1",
        bandPosition: "entry",
        clauseCount: 1,
        qualityScore: 0.99,
    },
    {
        id: "listen-c1-curated-010",
        chinese: "我们越是复核它，就越清楚前面的备注已经悄悄改写了整个判断。",
        referenceEnglish: "The more we reviewed it, the more obvious it became that the earlier note had quietly changed the whole reading.",
        targetEnglishVocab: ["reviewed", "note", "reading"],
        theme: "教育培训",
        scene: "复核偏差",
        tags: ["curated", "c1", "mid"],
        cefr: "C1",
        bandPosition: "mid",
        clauseCount: 2,
        qualityScore: 0.99,
    },
];

const MID_HIGH_REFINED_TARGET_PER_BUCKET = 100;

function refinedQualityScore(cefr: MidHighCefr, bandPosition: ListeningBandPosition, themeIndex: number, templateIndex: number) {
    const base = cefr === "B1"
        ? 0.967
        : cefr === "B2"
            ? 0.958
            : 0.948;
    const bandPenalty = bandPosition === "entry" ? 0 : bandPosition === "mid" ? 0.003 : 0.006;
    const themePenalty = Math.min(0.012, themeIndex * 0.00035);
    const templatePenalty = templateIndex * 0.0015;
    return Math.max(0.91, Number((base - bandPenalty - themePenalty - templatePenalty).toFixed(3)));
}

function buildRefinedMidHighCandidates(bundle: ThemeBundle, cefr: MidHighCefr, bandPosition: ListeningBandPosition, themeIndex: number) {
    const focus = shortSlot(bundle.focusEn);
    const place = shortSlot(bundle.placeEn);
    const issue = shortSlot(bundle.issueEn);
    const support = shortSlot(bundle.supportEn);
    const event = shortSlot(bundle.eventEn);
    const person = shortSlot(bundle.personEn);
    const opener = bandOpening(cefr, bandPosition, themeIndex * 5);

    if (cefr === "B1") {
        const core = [
            {
                chinese: `${opener.zh}我们把${bundle.focusZh}挪到${bundle.placeZh}，因为${bundle.issueZh}正在拖慢${bundle.eventZh}。`,
                referenceEnglish: `${opener.en}We moved the ${focus} to the ${place} because the ${issue} was slowing the ${event}.`,
                targetEnglishVocab: [bundle.focusEn, bundle.issueEn, bundle.eventEn],
                theme: bundle.theme,
                scene: bundle.scene,
                tags: ["curated", "refined", "b1", bandPosition, `theme-${themeIndex + 1}`, "template-1"],
                clauseCount: 1 as const,
                qualityScore: refinedQualityScore(cefr, bandPosition, themeIndex, 0),
            },
            {
                chinese: `${opener.zh}${bundle.personZh}让我把${bundle.supportZh}先留在${bundle.placeZh}，等${bundle.eventZh}结束。`,
                referenceEnglish: `${opener.en}The ${person} asked me to leave the ${support} at the ${place} until the ${event} ended.`,
                targetEnglishVocab: [bundle.personEn, bundle.supportEn, bundle.eventEn],
                theme: bundle.theme,
                scene: bundle.scene,
                tags: ["curated", "refined", "b1", bandPosition, `theme-${themeIndex + 1}`, "template-2"],
                clauseCount: 1 as const,
                qualityScore: refinedQualityScore(cefr, bandPosition, themeIndex, 1),
            },
            {
                chinese: `${opener.zh}如果${bundle.issueZh}又回来，我们就把${bundle.focusZh}先放在${bundle.placeZh}边上再试一次。`,
                referenceEnglish: `${opener.en}If the ${issue} comes back, we'll keep the ${focus} by the ${place} and try again.`,
                targetEnglishVocab: [bundle.issueEn, bundle.focusEn, bundle.placeEn],
                theme: bundle.theme,
                scene: bundle.scene,
                tags: ["curated", "refined", "b1", bandPosition, `theme-${themeIndex + 1}`, "template-3"],
                clauseCount: 1 as const,
                qualityScore: refinedQualityScore(cefr, bandPosition, themeIndex, 2),
            },
            {
                chinese: `${opener.zh}${bundle.eventZh}一推迟，我就把${bundle.supportZh}搬回${bundle.placeZh}。`,
                referenceEnglish: `${opener.en}After the ${event} slipped, I carried the ${support} back to the ${place}.`,
                targetEnglishVocab: [bundle.eventEn, bundle.supportEn, bundle.placeEn],
                theme: bundle.theme,
                scene: bundle.scene,
                tags: ["curated", "refined", "b1", bandPosition, `theme-${themeIndex + 1}`, "template-4"],
                clauseCount: 1 as const,
                qualityScore: refinedQualityScore(cefr, bandPosition, themeIndex, 3),
            },
            {
                chinese: `${opener.zh}等${bundle.personZh}确认${bundle.issueZh}后，我们就能把${bundle.focusZh}留在原地。`,
                referenceEnglish: `${opener.en}Once the ${person} checked the ${issue}, we could leave the ${focus} where it was.`,
                targetEnglishVocab: [bundle.personEn, bundle.issueEn, bundle.focusEn],
                theme: bundle.theme,
                scene: bundle.scene,
                tags: ["curated", "refined", "b1", bandPosition, `theme-${themeIndex + 1}`, "template-5"],
                clauseCount: 1 as const,
                qualityScore: refinedQualityScore(cefr, bandPosition, themeIndex, 4),
            },
        ];
        const extra = [
            {
                chinese: `${opener.zh}我们把${bundle.focusZh}放在${bundle.placeZh}边上，等${bundle.personZh}再看。`,
                referenceEnglish: `${opener.en}We left the ${focus} by the ${place} and waited for the ${person}.`,
                targetEnglishVocab: [bundle.focusEn, bundle.placeEn, bundle.personEn],
                theme: bundle.theme,
                scene: bundle.scene,
                tags: ["curated", "refined", "b1", bandPosition, `theme-${themeIndex + 1}`, "template-6"],
                clauseCount: 1 as const,
                qualityScore: refinedQualityScore(cefr, bandPosition, themeIndex, 5),
            },
            {
                chinese: `${opener.zh}${bundle.personZh}把${bundle.supportZh}挪开后，又重新看了${bundle.issueZh}。`,
                referenceEnglish: `${opener.en}The ${person} moved the ${support} and checked the ${issue} again.`,
                targetEnglishVocab: [bundle.personEn, bundle.supportEn, bundle.issueEn],
                theme: bundle.theme,
                scene: bundle.scene,
                tags: ["curated", "refined", "b1", bandPosition, `theme-${themeIndex + 1}`, "template-7"],
                clauseCount: 1 as const,
                qualityScore: refinedQualityScore(cefr, bandPosition, themeIndex, 6),
            },
            {
                chinese: `${opener.zh}如果${bundle.issueZh}又回来，我们还能把${bundle.focusZh}再试一次。`,
                referenceEnglish: `${opener.en}If the ${issue} comes back, we can try the ${focus} once more.`,
                targetEnglishVocab: [bundle.issueEn, bundle.focusEn, bundle.eventEn],
                theme: bundle.theme,
                scene: bundle.scene,
                tags: ["curated", "refined", "b1", bandPosition, `theme-${themeIndex + 1}`, "template-8"],
                clauseCount: 1 as const,
                qualityScore: refinedQualityScore(cefr, bandPosition, themeIndex, 7),
            },
            {
                chinese: `${opener.zh}我把${bundle.supportZh}留在${bundle.placeZh}，方便${bundle.personZh}快点找到。`,
                referenceEnglish: `${opener.en}I kept the ${support} near the ${place} so the ${person} could find it fast.`,
                targetEnglishVocab: [bundle.supportEn, bundle.placeEn, bundle.personEn],
                theme: bundle.theme,
                scene: bundle.scene,
                tags: ["curated", "refined", "b1", bandPosition, `theme-${themeIndex + 1}`, "template-9"],
                clauseCount: 1 as const,
                qualityScore: refinedQualityScore(cefr, bandPosition, themeIndex, 8),
            },
            {
                chinese: `${opener.zh}${bundle.eventZh}一结束，我们就把${bundle.focusZh}放回原位。`,
                referenceEnglish: `${opener.en}Once the ${event} ended, we put the ${focus} back in place.`,
                targetEnglishVocab: [bundle.eventEn, bundle.focusEn, bundle.placeEn],
                theme: bundle.theme,
                scene: bundle.scene,
                tags: ["curated", "refined", "b1", bandPosition, `theme-${themeIndex + 1}`, "template-10"],
                clauseCount: 1 as const,
                qualityScore: refinedQualityScore(cefr, bandPosition, themeIndex, 9),
            },
        ];
        return [...core, ...extra];
    }

    if (cefr === "B2") {
        const core = [
            {
                chinese: `${opener.zh}等${bundle.personZh}打来电话时，我们已经把${bundle.focusZh}挪开了，因为${bundle.issueZh}看起来不轻。`,
                referenceEnglish: `${opener.en}By the time the ${person} called, we'd already moved the ${focus} because the ${issue} looked serious.`,
                targetEnglishVocab: [bundle.personEn, bundle.focusEn, bundle.issueEn],
                theme: bundle.theme,
                scene: bundle.scene,
                tags: ["curated", "refined", "b2", bandPosition, `theme-${themeIndex + 1}`, "template-1"],
                clauseCount: 1 as const,
                qualityScore: refinedQualityScore(cefr, bandPosition, themeIndex, 0),
            },
            {
                chinese: `${opener.zh}虽然${bundle.placeZh}看起来准备好了，${bundle.issueZh}还是把${bundle.eventZh}拖慢了一下午。`,
                referenceEnglish: `${opener.en}Although the ${place} looked ready, the ${issue} kept slowing the ${event} down during the afternoon.`,
                targetEnglishVocab: [bundle.placeEn, bundle.issueEn, bundle.eventEn],
                theme: bundle.theme,
                scene: bundle.scene,
                tags: ["curated", "refined", "b2", bandPosition, `theme-${themeIndex + 1}`, "template-2"],
                clauseCount: 2 as const,
                qualityScore: refinedQualityScore(cefr, bandPosition, themeIndex, 1),
            },
            {
                chinese: `${opener.zh}如果到时候${bundle.supportZh}还没准备好，我们今晚就得围着${bundle.placeZh}重排${bundle.eventZh}。`,
                referenceEnglish: `${opener.en}If the ${support} isn't ready by then, we'll rework the ${event} around the ${place} tonight.`,
                targetEnglishVocab: [bundle.supportEn, bundle.eventEn, bundle.placeEn],
                theme: bundle.theme,
                scene: bundle.scene,
                tags: ["curated", "refined", "b2", bandPosition, `theme-${themeIndex + 1}`, "template-3"],
                clauseCount: 1 as const,
                qualityScore: refinedQualityScore(cefr, bandPosition, themeIndex, 2),
            },
            {
                chinese: `${opener.zh}我把${bundle.focusZh}一直带在身上，这样${bundle.personZh}在${bundle.eventZh}里就不用再追着找。`,
                referenceEnglish: `${opener.en}I kept the ${focus} with me so the ${person} wouldn't have to chase it again during the ${event}.`,
                targetEnglishVocab: [bundle.focusEn, bundle.personEn, bundle.eventEn],
                theme: bundle.theme,
                scene: bundle.scene,
                tags: ["curated", "refined", "b2", bandPosition, `theme-${themeIndex + 1}`, "template-4"],
                clauseCount: 1 as const,
                qualityScore: refinedQualityScore(cefr, bandPosition, themeIndex, 3),
            },
            {
                chinese: `${opener.zh}${bundle.issueZh}一扩散，我们就只能把${bundle.eventZh}挪到${bundle.supportZh}那边重新来过。`,
                referenceEnglish: `${opener.en}Once the ${issue} spread, we had to move the ${event} to the ${support} and start again.`,
                targetEnglishVocab: [bundle.issueEn, bundle.eventEn, bundle.supportEn],
                theme: bundle.theme,
                scene: bundle.scene,
                tags: ["curated", "refined", "b2", bandPosition, `theme-${themeIndex + 1}`, "template-5"],
                clauseCount: 2 as const,
                qualityScore: refinedQualityScore(cefr, bandPosition, themeIndex, 4),
            },
        ];
        const extra = [
            {
                chinese: `${opener.zh}我们把${bundle.focusZh}留近一点，好让${bundle.personZh}先处理${bundle.issueZh}。`,
                referenceEnglish: `${opener.en}We kept the ${focus} close so the ${person} could handle the ${issue} fast.`,
                targetEnglishVocab: [bundle.focusEn, bundle.personEn, bundle.issueEn],
                theme: bundle.theme,
                scene: bundle.scene,
                tags: ["curated", "refined", "b2", bandPosition, `theme-${themeIndex + 1}`, "template-6"],
                clauseCount: 1 as const,
                qualityScore: refinedQualityScore(cefr, bandPosition, themeIndex, 5),
            },
            {
                chinese: `${opener.zh}${bundle.personZh}想让${bundle.supportZh}在${bundle.eventZh}前就准备好。`,
                referenceEnglish: `${opener.en}The ${person} wanted the ${support} ready before the ${event} started again.`,
                targetEnglishVocab: [bundle.personEn, bundle.supportEn, bundle.eventEn],
                theme: bundle.theme,
                scene: bundle.scene,
                tags: ["curated", "refined", "b2", bandPosition, `theme-${themeIndex + 1}`, "template-7"],
                clauseCount: 1 as const,
                qualityScore: refinedQualityScore(cefr, bandPosition, themeIndex, 6),
            },
            {
                chinese: `${opener.zh}如果${bundle.issueZh}再回来，我们就把${bundle.eventZh}和${bundle.placeZh}一起重排。`,
                referenceEnglish: `${opener.en}If the ${issue} returns, we'll move the ${event} and reset the ${place}.`,
                targetEnglishVocab: [bundle.issueEn, bundle.eventEn, bundle.placeEn],
                theme: bundle.theme,
                scene: bundle.scene,
                tags: ["curated", "refined", "b2", bandPosition, `theme-${themeIndex + 1}`, "template-8"],
                clauseCount: 1 as const,
                qualityScore: refinedQualityScore(cefr, bandPosition, themeIndex, 7),
            },
            {
                chinese: `${opener.zh}我让${bundle.personZh}先拿着${bundle.focusZh}，直到${bundle.supportZh}到了。`,
                referenceEnglish: `${opener.en}I told the ${person} to hold the ${focus} until the ${support} arrived.`,
                targetEnglishVocab: [bundle.personEn, bundle.focusEn, bundle.supportEn],
                theme: bundle.theme,
                scene: bundle.scene,
                tags: ["curated", "refined", "b2", bandPosition, `theme-${themeIndex + 1}`, "template-9"],
                clauseCount: 1 as const,
                qualityScore: refinedQualityScore(cefr, bandPosition, themeIndex, 8),
            },
            {
                chinese: `${opener.zh}等${bundle.eventZh}一变，我们就得重写${bundle.supportZh}的说明。`,
                referenceEnglish: `${opener.en}Once the ${event} shifted, we had to rewrite the ${support} notes.`,
                targetEnglishVocab: [bundle.eventEn, bundle.supportEn, bundle.issueEn],
                theme: bundle.theme,
                scene: bundle.scene,
                tags: ["curated", "refined", "b2", bandPosition, `theme-${themeIndex + 1}`, "template-10"],
                clauseCount: 1 as const,
                qualityScore: refinedQualityScore(cefr, bandPosition, themeIndex, 9),
            },
        ];
        return [...core, ...extra];
    }

    const core = [
        {
            chinese: `${opener.zh}等${bundle.personZh}承认${bundle.issueZh}时，${bundle.eventZh}已经把整个计划改掉了。`,
            referenceEnglish: `${opener.en}By the time the ${person} admitted the ${issue}, the ${event} had already changed the whole plan.`,
            targetEnglishVocab: [bundle.personEn, bundle.issueEn, bundle.eventEn],
            theme: bundle.theme,
            scene: bundle.scene,
            tags: ["curated", "refined", "c1", bandPosition, `theme-${themeIndex + 1}`, "template-1"],
            clauseCount: 2 as const,
            qualityScore: refinedQualityScore(cefr, bandPosition, themeIndex, 0),
        },
        {
            chinese: `${opener.zh}真正让${bundle.personZh}介意的，是${bundle.issueZh}总把注意力从${bundle.focusZh}那边拉走。`,
            referenceEnglish: `${opener.en}What really bothered the ${person} was how the ${issue} kept pulling attention away from the ${focus}.`,
            targetEnglishVocab: [bundle.personEn, bundle.issueEn, bundle.focusEn],
            theme: bundle.theme,
            scene: bundle.scene,
            tags: ["curated", "refined", "c1", bandPosition, `theme-${themeIndex + 1}`, "template-2"],
            clauseCount: 2 as const,
            qualityScore: refinedQualityScore(cefr, bandPosition, themeIndex, 1),
        },
        {
            chinese: `${opener.zh}如果当时把${bundle.focusZh}留在原处，${bundle.personZh}就不必整场${bundle.eventZh}都在解释${bundle.issueZh}。`,
            referenceEnglish: `${opener.en}If we'd left the ${focus} where it was, the ${person} wouldn't have spent the whole ${event} explaining the ${issue}.`,
            targetEnglishVocab: [bundle.focusEn, bundle.personEn, bundle.eventEn],
            theme: bundle.theme,
            scene: bundle.scene,
            tags: ["curated", "refined", "c1", bandPosition, `theme-${themeIndex + 1}`, "template-3"],
            clauseCount: 2 as const,
            qualityScore: refinedQualityScore(cefr, bandPosition, themeIndex, 2),
        },
        {
            chinese: `${opener.zh}即使${bundle.issueZh}缓下来了，我们还是把${bundle.supportZh}留着，以防${bundle.eventZh}又变。`,
            referenceEnglish: `${opener.en}Even after the ${issue} eased, we kept the ${support} ready in case the ${event} shifted again.`,
            targetEnglishVocab: [bundle.issueEn, bundle.supportEn, bundle.eventEn],
            theme: bundle.theme,
            scene: bundle.scene,
            tags: ["curated", "refined", "c1", bandPosition, `theme-${themeIndex + 1}`, "template-4"],
            clauseCount: 2 as const,
            qualityScore: refinedQualityScore(cefr, bandPosition, themeIndex, 3),
        },
        {
            chinese: `${opener.zh}直到${bundle.personZh}把${bundle.focusZh}和更早的草稿并排看，我们才发现${bundle.issueZh}已经扩散开了。`,
            referenceEnglish: `${opener.en}Not until the ${person} compared the ${focus} with the earlier draft did we see how the ${issue} had spread.`,
            targetEnglishVocab: [bundle.personEn, bundle.focusEn, bundle.issueEn],
            theme: bundle.theme,
            scene: bundle.scene,
            tags: ["curated", "refined", "c1", bandPosition, `theme-${themeIndex + 1}`, "template-5"],
            clauseCount: 2 as const,
            qualityScore: refinedQualityScore(cefr, bandPosition, themeIndex, 4),
        },
    ];
    const extra = [
        {
            chinese: `${opener.zh}我们后来才知道，${bundle.personZh}一直把${bundle.focusZh}留作备用。`,
            referenceEnglish: `${opener.en}We only learned later that the ${person} had kept the ${focus} in reserve.`,
            targetEnglishVocab: [bundle.personEn, bundle.focusEn, bundle.eventEn],
            theme: bundle.theme,
            scene: bundle.scene,
            tags: ["curated", "refined", "c1", bandPosition, `theme-${themeIndex + 1}`, "template-6"],
            clauseCount: 2 as const,
            qualityScore: refinedQualityScore(cefr, bandPosition, themeIndex, 5),
        },
        {
            chinese: `${opener.zh}${bundle.personZh}一看出${bundle.issueZh}，就立刻改了说法。`,
            referenceEnglish: `${opener.en}The ${person} adjusted the message as soon as the ${issue} became clear.`,
            targetEnglishVocab: [bundle.personEn, bundle.issueEn, bundle.eventEn],
            theme: bundle.theme,
            scene: bundle.scene,
            tags: ["curated", "refined", "c1", bandPosition, `theme-${themeIndex + 1}`, "template-7"],
            clauseCount: 2 as const,
            qualityScore: refinedQualityScore(cefr, bandPosition, themeIndex, 6),
        },
        {
            chinese: `${opener.zh}如果${bundle.issueZh}没那么早冒头，${bundle.eventZh}本来会看得更顺。`,
            referenceEnglish: `${opener.en}If the ${issue} had stayed hidden, the ${event} would have looked much smoother.`,
            targetEnglishVocab: [bundle.issueEn, bundle.eventEn, bundle.personEn],
            theme: bundle.theme,
            scene: bundle.scene,
            tags: ["curated", "refined", "c1", bandPosition, `theme-${themeIndex + 1}`, "template-8"],
            clauseCount: 2 as const,
            qualityScore: refinedQualityScore(cefr, bandPosition, themeIndex, 7),
        },
        {
            chinese: `${opener.zh}到那一步时，${bundle.personZh}已经在解释为什么${bundle.focusZh}更重要。`,
            referenceEnglish: `${opener.en}By then, the ${person} was already explaining why the ${focus} mattered more.`,
            targetEnglishVocab: [bundle.personEn, bundle.focusEn, bundle.eventEn],
            theme: bundle.theme,
            scene: bundle.scene,
            tags: ["curated", "refined", "c1", bandPosition, `theme-${themeIndex + 1}`, "template-9"],
            clauseCount: 2 as const,
            qualityScore: refinedQualityScore(cefr, bandPosition, themeIndex, 8),
        },
        {
            chinese: `${opener.zh}不过${bundle.supportZh}还是留着，因为${bundle.eventZh}随时都可能再变。`,
            referenceEnglish: `${opener.en}Even so, the ${support} stayed ready in case the ${event} shifted again.`,
            targetEnglishVocab: [bundle.supportEn, bundle.eventEn, bundle.issueEn],
            theme: bundle.theme,
            scene: bundle.scene,
            tags: ["curated", "refined", "c1", bandPosition, `theme-${themeIndex + 1}`, "template-10"],
            clauseCount: 2 as const,
            qualityScore: refinedQualityScore(cefr, bandPosition, themeIndex, 9),
        },
    ];
    return [...core, ...extra];
}

function buildMidHighRefinedSeeds(baseSeeds: MidHighSeed[]) {
    const existingEnglish = new Set(baseSeeds.map((seed) => seed.referenceEnglish));
    const refined: MidHighSeed[] = [];
    const order: Array<[MidHighCefr, ListeningBandPosition]> = [
        ["B1", "entry"],
        ["B1", "mid"],
        ["B1", "exit"],
        ["B2", "entry"],
        ["B2", "mid"],
        ["B2", "exit"],
        ["C1", "entry"],
        ["C1", "mid"],
        ["C1", "exit"],
    ];

    for (const [cefr, bandPosition] of order) {
        const baseCount = baseSeeds.filter((seed) => seed.cefr === cefr && seed.bandPosition === bandPosition).length;
        const needed = Math.max(0, MID_HIGH_REFINED_TARGET_PER_BUCKET - baseCount);
        if (needed === 0) continue;

        const bucketSeeds: MidHighSeed[] = [];
        for (let themeIndex = 0; themeIndex < MID_HIGH_THEMES.length && bucketSeeds.length < needed; themeIndex++) {
            const bundle = MID_HIGH_THEMES[themeIndex];
            const candidates = buildRefinedMidHighCandidates(bundle, cefr, bandPosition, themeIndex);

            for (let templateIndex = 0; templateIndex < candidates.length && bucketSeeds.length < needed; templateIndex++) {
                const candidate = candidates[templateIndex];
                const normalized = {
                    ...candidate,
                    cefr,
                    bandPosition,
                } as MidHighSeed;
                if (existingEnglish.has(normalized.referenceEnglish)) continue;
                if (!inWordRange(normalized)) continue;

                const id = `listen-${cefr.toLowerCase()}-refined-${bandPosition}-${String(bucketSeeds.length + 1).padStart(3, "0")}`;
                bucketSeeds.push({
                    ...normalized,
                    id,
                    reviewStatus: "curated",
                });
                existingEnglish.add(normalized.referenceEnglish);
            }
        }

        if (bucketSeeds.length < needed) {
            throw new Error(`Insufficient refined ${cefr}-${bandPosition} seeds: ${bucketSeeds.length}/${needed}`);
        }

        refined.push(...bucketSeeds);
    }

    return refined;
}

const MID_HIGH_REFINED_SEEDS = buildMidHighRefinedSeeds(BASE_MID_HIGH_SEEDS);
const MANUAL_MID_HIGH_SEEDS: MidHighSeed[] = [...BASE_MID_HIGH_SEEDS, ...MID_HIGH_REFINED_SEEDS];

function buildMidHighItem(seed: MidHighSeed): ListeningBankItem {
    const window = MID_HIGH_WINDOWS[seed.cefr][seed.bandPosition];
    const defaults = MID_HIGH_DEFAULTS[seed.cefr];

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

function keyFor(cefr: MidHighCefr, bandPosition: ListeningBandPosition): BucketKey {
    return `${cefr}-${bandPosition}`;
}

function inWordRange(seed: MidHighSeed) {
    const range = MID_HIGH_WORD_RANGES[seed.cefr];
    const words = countWords(seed.referenceEnglish);
    return words >= range.min && words <= range.max;
}

function autoId(cefr: MidHighCefr, bandPosition: ListeningBandPosition, index: number) {
    const prefix = cefr === "B1" ? "b1" : cefr === "B2" ? "b2" : "c1";
    return `listen-auto-${prefix}-${bandPosition}-${String(index).padStart(3, "0")}`;
}

function shortSlot(value: string) {
    const parts = value.split(" ");
    if (parts.length <= 2) return value;
    return parts.slice(-2).join(" ");
}

function generatedQualityScore(cefr: MidHighCefr, bandPosition: ListeningBandPosition, index: number) {
    const base = cefr === "B1"
        ? bandPosition === "entry"
            ? 0.92
            : bandPosition === "mid"
                ? 0.91
                : 0.9
        : cefr === "B2"
            ? bandPosition === "entry"
                ? 0.91
                : bandPosition === "mid"
                    ? 0.9
                    : 0.89
            : bandPosition === "entry"
                ? 0.9
                : bandPosition === "mid"
                    ? 0.89
                    : 0.88;

    return Math.max(0.82, base - index * 0.003);
}

function bandOpening(cefr: MidHighCefr, bandPosition: ListeningBandPosition, index: number) {
    const openers: Record<MidHighCefr, Record<ListeningBandPosition, Array<{ en: string; zh: string }>>> = {
        B1: {
            entry: [
                { en: "Today, ", zh: "今天，" },
                { en: "Now, ", zh: "现在，" },
                { en: "Earlier, ", zh: "刚才，" },
                { en: "Soon, ", zh: "很快，" },
                { en: "Later, ", zh: "稍后，" },
            ],
            mid: [
                { en: "For now, ", zh: "先这样，" },
                { en: "Meanwhile, ", zh: "同时，" },
                { en: "Still, ", zh: "还是，" },
                { en: "Today, ", zh: "今天，" },
                { en: "Later, ", zh: "稍后，" },
            ],
            exit: [
                { en: "Tomorrow, ", zh: "明天，" },
                { en: "Soon, ", zh: "很快，" },
                { en: "Later, ", zh: "稍后，" },
                { en: "Tonight, ", zh: "今晚，" },
                { en: "Next, ", zh: "接下来，" },
            ],
        },
        B2: {
            entry: [
                { en: "Now, ", zh: "现在，" },
                { en: "Today, ", zh: "今天，" },
                { en: "Earlier, ", zh: "更早，" },
                { en: "Before then, ", zh: "在那之前，" },
                { en: "By then, ", zh: "到那时，" },
            ],
            mid: [
                { en: "For now, ", zh: "先这样，" },
                { en: "Meanwhile, ", zh: "与此同时，" },
                { en: "Today, ", zh: "今天，" },
                { en: "In practice, ", zh: "实际看，" },
                { en: "Later, ", zh: "稍后，" },
            ],
            exit: [
                { en: "By then, ", zh: "到那时，" },
                { en: "Soon, ", zh: "很快，" },
                { en: "Later, ", zh: "稍后，" },
                { en: "Tonight, ", zh: "今晚，" },
                { en: "Next, ", zh: "接下来，" },
            ],
        },
        C1: {
            entry: [
                { en: "Now, ", zh: "现在，" },
                { en: "For now, ", zh: "眼下，" },
                { en: "So far, ", zh: "到目前为止，" },
                { en: "In practice, ", zh: "实际看，" },
                { en: "At first, ", zh: "起初，" },
            ],
            mid: [
                { en: "In hindsight, ", zh: "回头看，" },
                { en: "At this point, ", zh: "到这一步，" },
                { en: "More importantly, ", zh: "更重要的是，" },
                { en: "By then, ", zh: "到那时，" },
                { en: "Still, ", zh: "不过，" },
            ],
            exit: [
                { en: "By then, ", zh: "到那时，" },
                { en: "Finally, ", zh: "最后，" },
                { en: "Looking back, ", zh: "回头看，" },
                { en: "In the end, ", zh: "最终，" },
                { en: "At that point, ", zh: "到那个节点，" },
            ],
        },
    };

    const set = openers[cefr][bandPosition];
    return set[index % set.length];
}

function buildB1Candidates(bundle: ThemeBundle, bandPosition: ListeningBandPosition) {
    const focus = shortSlot(bundle.focusEn);
    const place = shortSlot(bundle.placeEn);
    const issue = shortSlot(bundle.issueEn);
    const support = shortSlot(bundle.supportEn);
    const event = shortSlot(bundle.eventEn);
    const person = shortSlot(bundle.personEn);

    return [
        {
            chinese: `因为${bundle.issueZh}，我在${bundle.eventZh}前把${bundle.focusZh}又检查了一遍。`,
            referenceEnglish: `I checked the ${focus} again because the ${issue} was delaying the ${event}.`,
            clauseCount: 1 as const,
        },
        {
            chinese: `${bundle.personZh}回电话后，我把${bundle.focusZh}留在${bundle.placeZh}外面。`,
            referenceEnglish: `When the ${person} called back, I left the ${focus} outside the ${place}.`,
            clauseCount: 1 as const,
        },
        {
            chinese: `如果${bundle.issueZh}又冒出来，我们就把${bundle.supportZh}带去${bundle.placeZh}。`,
            referenceEnglish: `If the ${issue} shows up again, we'll take the ${support} to the ${place}.`,
            clauseCount: 1 as const,
        },
        {
            chinese: `${bundle.eventZh}开始得晚了，所以${bundle.personZh}让我把${bundle.focusZh}先带上楼。`,
            referenceEnglish: `Because the ${event} started late, the ${person} asked me to carry the ${focus} upstairs first.`,
            clauseCount: 1 as const,
        },
        {
            chinese: `等${bundle.eventZh}结束时，我们还得把${bundle.supportZh}放回${bundle.placeZh}。`,
            referenceEnglish: `By the time the ${event} ended, we still had to return the ${support} to the ${place}.`,
            clauseCount: 1 as const,
        },
        {
            chinese: `虽然${bundle.placeZh}看起来很安静，${bundle.issueZh}还是让整个${bundle.eventZh}慢了下来。`,
            referenceEnglish: `Although the ${place} looked calm, the ${issue} still slowed the whole ${event} down.`,
            clauseCount: 1 as const,
        },
        {
            chinese: `我把${bundle.focusZh}随身带着，因为${bundle.personZh}说${bundle.issueZh}还没处理完。`,
            referenceEnglish: `I kept the ${focus} with me because the ${person} said the ${issue} wasn't settled yet.`,
            clauseCount: 1 as const,
        },
        {
            chinese: `如果${bundle.supportZh}还没准备好，我们就先在${bundle.placeZh}边上等${bundle.personZh}。`,
            referenceEnglish: `If the ${support} still isn't ready, we'll wait beside the ${place} for the ${person}.`,
            clauseCount: 1 as const,
        },
        {
            chinese: `等${bundle.personZh}确认完${bundle.issueZh}，我们才把${bundle.focusZh}重新送进去。`,
            referenceEnglish: `We only moved the ${focus} back once the ${person} had checked the ${issue}.`,
            clauseCount: 1 as const,
        },
        {
            chinese: `${bandPosition === "exit" ? "即使" : "虽然"}${bundle.eventZh}已经开始，${bundle.personZh}还是回头把${bundle.supportZh}拿走了。`,
            referenceEnglish: `${bandPosition === "exit" ? "Even though" : "Although"} the ${event} had started, the ${person} still went back for the ${support}.`,
            clauseCount: 1 as const,
        },
        {
            chinese: `${bundle.personZh}一直把${bundle.focusZh}留在手边，因为${bundle.issueZh}还没完全消掉。`,
            referenceEnglish: `The ${person} kept the ${focus} nearby because the ${issue} was still active.`,
            clauseCount: 1 as const,
        },
        {
            chinese: `${bundle.eventZh}改到楼上后，我们把${bundle.supportZh}放在${bundle.placeZh}边上。`,
            referenceEnglish: `We parked the ${support} near the ${place} when the ${event} moved upstairs.`,
            clauseCount: 1 as const,
        },
        {
            chinese: `${bundle.personZh}提醒完${bundle.issueZh}后，我就把${bundle.focusZh}搬到楼下去了。`,
            referenceEnglish: `I carried the ${focus} downstairs after the ${person} warned us about the ${issue}.`,
            clauseCount: 1 as const,
        },
        {
            chinese: `等${bundle.eventZh}稳下来后，${bundle.personZh}又来找${bundle.supportZh}。`,
            referenceEnglish: `Once the ${event} settled down, the ${person} asked for the ${support} again.`,
            clauseCount: 1 as const,
        },
    ];
}

function buildB2Candidates(bundle: ThemeBundle, bandPosition: ListeningBandPosition) {
    const focus = shortSlot(bundle.focusEn);
    const place = shortSlot(bundle.placeEn);
    const issue = shortSlot(bundle.issueEn);
    const support = shortSlot(bundle.supportEn);
    const event = shortSlot(bundle.eventEn);
    const person = shortSlot(bundle.personEn);

    return [
        {
            chinese: `等${bundle.personZh}终于回消息时，我已经因为${bundle.issueZh}把${bundle.focusZh}挪开了。`,
            referenceEnglish: `When the ${person} finally replied, I'd already moved the ${focus} because the ${issue} looked serious.`,
            clauseCount: 1 as const,
        },
        {
            chinese: `如果${bundle.issueZh}再恶化，我们今晚就得把${bundle.eventZh}改到${bundle.supportZh}那边。`,
            referenceEnglish: `If the ${issue} gets worse again, we're shifting the ${event} over to the ${support} tonight.`,
            clauseCount: 1 as const,
        },
        {
            chinese: `我一直把${bundle.focusZh}带在身上，这样${bundle.personZh}在${bundle.eventZh}期间就不会再弄丢。`,
            referenceEnglish: `I kept the ${focus} with me so the ${person} wouldn't lose it again during the ${event}.`,
            clauseCount: 1 as const,
        },
        {
            chinese: `虽然${bundle.placeZh}一开始还算安静，但${bundle.issueZh}一冒出来，整个${bundle.eventZh}就乱了。`,
            referenceEnglish: `Although the ${place} looked quiet at first, the ${issue} spread quickly once the ${event} began.`,
            clauseCount: 2 as const,
        },
        {
            chinese: `我们先把${bundle.focusZh}留在楼上，等${bundle.personZh}确认${bundle.supportZh}真的能用。`,
            referenceEnglish: `We're holding the ${focus} upstairs until the ${person} confirms the ${support} is actually ready.`,
            clauseCount: 1 as const,
        },
        {
            chinese: `因为${bundle.issueZh}总是反复出现，我只好让${bundle.personZh}把每份${bundle.focusZh}都重看一遍。`,
            referenceEnglish: `Because the ${issue} kept resurfacing, I asked the ${person} to recheck every ${focus} before leaving.`,
            clauseCount: 1 as const,
        },
        {
            chinese: `即使${bundle.eventZh}已经快结束了，${bundle.personZh}还是坚持先把${bundle.focusZh}移开。`,
            referenceEnglish: `Even though the ${event} was nearly over, the ${person} insisted we'd better move the ${focus} first.`,
            clauseCount: 1 as const,
        },
        {
            chinese: `如果${bundle.supportZh}到时候还没到位，我们多半得围着${bundle.placeZh}把${bundle.eventZh}重排一遍。`,
            referenceEnglish: `If the ${support} isn't ready by then, we're probably reworking the ${event} around the ${place}.`,
            clauseCount: 1 as const,
        },
        {
            chinese: `我本该早点检查${bundle.focusZh}，只是直到${bundle.personZh}打来电话，${bundle.issueZh}才显得明显。`,
            referenceEnglish: `I should've checked the ${focus} earlier, but the ${issue} wasn't obvious until the ${person} called.`,
            clauseCount: 1 as const,
        },
        {
            chinese: `等我们意识到${bundle.issueZh}已经影响到${bundle.placeZh}时，${bundle.eventZh}其实已经晚了半拍。`,
            referenceEnglish: `By the time we realized the ${issue} was affecting the ${place}, the ${event} was already half a step behind.`,
            clauseCount: 1 as const,
        },
        {
            chinese: `${bundle.personZh}一确认${bundle.supportZh}还没就位，我们就立刻把${bundle.focusZh}转去另一边了。`,
            referenceEnglish: `Once the ${person} confirmed the ${support} wasn't ready, we shifted the ${focus} somewhere else immediately.`,
            clauseCount: 1 as const,
        },
        {
            chinese: `如果${bundle.placeZh}再次堵住，我们就先靠${bundle.supportZh}把整个${bundle.eventZh}撑过去。`,
            referenceEnglish: `If the ${place} clogs up again, we'll lean on the ${support} to carry the ${event}.`,
            clauseCount: 1 as const,
        },
        {
            chinese: `虽然${bundle.issueZh}看上去不大，但${bundle.personZh}说它已经开始拖慢后面的${bundle.eventZh}了。`,
            referenceEnglish: `Although the ${issue} looked minor, the ${person} said it was already slowing the later ${event}.`,
            clauseCount: 1 as const,
        },
        {
            chinese: `我把${bundle.focusZh}先扣在手里，免得${bundle.personZh}在${bundle.eventZh}里再临时改一次。`,
            referenceEnglish: `I held onto the ${focus} so the ${person} couldn't revise it again during the ${event}.`,
            clauseCount: 1 as const,
        },
    ];
}

function buildC1Candidates(bundle: ThemeBundle, bandPosition: ListeningBandPosition) {
    const focus = shortSlot(bundle.focusEn);
    const place = shortSlot(bundle.placeEn);
    const issue = shortSlot(bundle.issueEn);
    const support = shortSlot(bundle.supportEn);
    const event = shortSlot(bundle.eventEn);
    const person = shortSlot(bundle.personEn);

    return [
        {
            chinese: `一旦${bundle.personZh}点出了${bundle.issueZh}，我们就不再把${bundle.eventZh}当成普通延误来处理了。`,
            referenceEnglish: `Once the ${person} flagged the ${issue}, we stopped treating the ${event} like an ordinary delay.`,
            clauseCount: 1 as const,
        },
        {
            chinese: `等${bundle.placeZh}重新开放时，我其实已经提醒过大家，围绕${bundle.eventZh}的${bundle.supportZh}并不可靠。`,
            referenceEnglish: `By the time the ${place} opened again, I'd already warned everyone the ${support} around the ${event} was unreliable.`,
            clauseCount: 2 as const,
        },
        {
            chinese: `虽然纸面上的${bundle.focusZh}看着没问题，但底下那层${bundle.issueZh}一直在拖偏${bundle.personZh}的判断。`,
            referenceEnglish: `Although the ${focus} looked fine on paper, the ${issue} underneath it kept throwing the ${person} off.`,
            clauseCount: 1 as const,
        },
        {
            chinese: `如果当时没把${bundle.focusZh}留在原地，${bundle.personZh}也不至于整场${bundle.eventZh}都在解释那处${bundle.issueZh}。`,
            referenceEnglish: `Had we left the ${focus} where it was, the ${person} would've spent the whole ${event} explaining the ${issue}.`,
            clauseCount: 2 as const,
        },
        {
            chinese: `即使${bundle.issueZh}后来缓下来了，${bundle.placeZh}的局面也没真正稳住，所以我们始终把${bundle.supportZh}留作后手。`,
            referenceEnglish: `Even after the ${issue} eased, the ${place} never really settled, so we kept the ${support} in reserve.`,
            clauseCount: 2 as const,
        },
        {
            chinese: `真正让${bundle.personZh}介意的，并不是拖延本身，而是整场${bundle.eventZh}竟然就这么围着它重写了。`,
            referenceEnglish: `What bothered the ${person} most wasn't the delay itself, but how casually the ${event} was being rewritten around it.`,
            clauseCount: 2 as const,
        },
        {
            chinese: `直到${bundle.personZh}把${bundle.focusZh}和更早那版并排比较，我们才承认${bundle.issueZh}已经扭曲了整件事。`,
            referenceEnglish: `Not until the ${person} compared the ${focus} with the earlier draft did we admit the ${issue} had distorted the whole ${event}.`,
            clauseCount: 2 as const,
        },
        {
            chinese: `如果当时硬把${bundle.eventZh}按原样推进，最后背锅的只会是${bundle.placeZh}，而不是制造问题的那份${bundle.supportZh}。`,
            referenceEnglish: `If we'd pushed the ${event} through unchanged, the ${place} would've carried the blame for a problem the ${support} created.`,
            clauseCount: 2 as const,
        },
        {
            chinese: `${bandPosition === "exit" ? "等" : "直到"}${bundle.personZh}承认${bundle.issueZh}不是偶发现象时，最容易的补救窗口其实早就过去了。`,
            referenceEnglish: `${bandPosition === "exit" ? "By the time" : "Once"} the ${person} admitted the ${issue} wasn't a one-off, the easiest recovery window had already closed.`,
            clauseCount: 2 as const,
        },
        {
            chinese: `表面上看，大家只是围着${bundle.eventZh}打补丁，但真正被一点点掏空的，其实是对${bundle.focusZh}的基本判断。`,
            referenceEnglish: `On the surface, everyone was just patching around the ${event}, but what was quietly eroding was confidence in the ${focus}.`,
            clauseCount: 2 as const,
        },
    ];
}

function refinedMidHighId(cefr: MidHighCefr, bandPosition: ListeningBandPosition, bundleIndex: number, variantIndex: number) {
    return `listen-refine-${cefr.toLowerCase()}-${bandPosition}-${String(bundleIndex + 1).padStart(2, "0")}-${String(variantIndex + 1).padStart(2, "0")}`;
}

function buildB1RefinedCandidates(bundle: ThemeBundle) {
    const focus = shortSlot(bundle.focusEn);
    const place = shortSlot(bundle.placeEn);
    const issue = shortSlot(bundle.issueEn);
    const support = shortSlot(bundle.supportEn);
    const event = shortSlot(bundle.eventEn);
    const person = shortSlot(bundle.personEn);

    return [
        {
            chinese: `${bundle.eventZh}终于开始时，${bundle.personZh}让我把${bundle.focusZh}带进${bundle.placeZh}。`,
            referenceEnglish: `When the ${event} finally started, the ${person} asked me to bring the ${focus} into the ${place}.`,
            clauseCount: 1 as const,
        },
        {
            chinese: `因为${bundle.issueZh}一直拖慢进度，我们把${bundle.supportZh}留在${bundle.placeZh}边给${bundle.personZh}。`,
            referenceEnglish: `Because the ${issue} kept slowing us down, we left the ${support} beside the ${place} for the ${person}.`,
            clauseCount: 1 as const,
        },
        {
            chinese: `${bundle.personZh}说${bundle.eventZh}重新开始后，我把${bundle.focusZh}又搬回了${bundle.placeZh}。`,
            referenceEnglish: `I moved the ${focus} back to the ${place} after the ${person} said the ${event} was on again.`,
            clauseCount: 1 as const,
        },
        {
            chinese: `我们在${bundle.placeZh}附近等着，直到${bundle.personZh}确认${bundle.supportZh}已经能给${bundle.eventZh}用了。`,
            referenceEnglish: `We waited near the ${place} until the ${person} confirmed the ${support} was ready for the ${event}.`,
            clauseCount: 1 as const,
        },
        {
            chinese: `如果${bundle.issueZh}再冒出来，就先把${bundle.focusZh}送到${bundle.placeZh}，等${bundle.personZh}来处理。`,
            referenceEnglish: `If the ${issue} shows up again, take the ${focus} to the ${place} before the ${person} calls.`,
            clauseCount: 1 as const,
        },
    ];
}

function buildB2RefinedCandidates(bundle: ThemeBundle) {
    const focus = shortSlot(bundle.focusEn);
    const place = shortSlot(bundle.placeEn);
    const issue = shortSlot(bundle.issueEn);
    const support = shortSlot(bundle.supportEn);
    const event = shortSlot(bundle.eventEn);
    const person = shortSlot(bundle.personEn);

    return [
        {
            chinese: `虽然${bundle.placeZh}看起来已经准备好了，${bundle.issueZh}还是逼得${bundle.personZh}把${bundle.focusZh}临时挪走。`,
            referenceEnglish: `Although the ${place} looked ready, the ${issue} had already forced the ${person} to move the ${focus} aside.`,
            clauseCount: 1 as const,
        },
        {
            chinese: `等${bundle.personZh}回电话时，我们已经用${bundle.supportZh}把${bundle.eventZh}先撑住了。`,
            referenceEnglish: `By the time the ${person} called back, we'd already used the ${support} to keep the ${event} from slipping.`,
            clauseCount: 1 as const,
        },
        {
            chinese: `如果${bundle.issueZh}再恶化一点，我们就得在明天开始前把${bundle.focusZh}整份重写。`,
            referenceEnglish: `If the ${issue} gets worse again, we'll have to rewrite the ${focus} before the ${event} starts tomorrow.`,
            clauseCount: 1 as const,
        },
        {
            chinese: `因为${bundle.supportZh}来晚了，${bundle.personZh}一直把${bundle.focusZh}留在手里，等${bundle.eventZh}稳下来。`,
            referenceEnglish: `Because the ${support} arrived late, the ${person} kept the ${focus} with us until the ${event} settled.`,
            clauseCount: 1 as const,
        },
        {
            chinese: `即使${bundle.eventZh}已经推迟了，${bundle.personZh}还是让我们把${bundle.focusZh}带进${bundle.placeZh}再看一遍。`,
            referenceEnglish: `Even after the ${event} was delayed, the ${person} still asked us to carry the ${focus} through the ${place}.`,
            clauseCount: 1 as const,
        },
    ];
}

function buildC1RefinedCandidates(bundle: ThemeBundle) {
    const focus = shortSlot(bundle.focusEn);
    const place = shortSlot(bundle.placeEn);
    const issue = shortSlot(bundle.issueEn);
    const support = shortSlot(bundle.supportEn);
    const event = shortSlot(bundle.eventEn);
    const person = shortSlot(bundle.personEn);

    return [
        {
            chinese: `等${bundle.personZh}承认${bundle.issueZh}正在扩散时，${bundle.focusZh}其实已经决定了整场${bundle.eventZh}的走向。`,
            referenceEnglish: `By the time the ${person} admitted the ${issue} was spreading, the ${focus} had already shaped the whole ${event}.`,
            clauseCount: 2 as const,
        },
        {
            chinese: `真正让${bundle.placeZh}不安的，不是拖延本身，而是${bundle.personZh}把${bundle.issueZh}说得过于轻描淡写。`,
            referenceEnglish: `What really unsettled the ${place} was not the delay itself, but how lightly the ${person} had framed the ${issue}.`,
            clauseCount: 2 as const,
        },
        {
            chinese: `直到${bundle.personZh}把${bundle.focusZh}和更早那版并排比较，我们才承认${bundle.issueZh}已经带偏了整场${bundle.eventZh}。`,
            referenceEnglish: `Not until the ${person} compared the ${focus} with the earlier draft did we admit the ${issue} had distorted the ${event}.`,
            clauseCount: 2 as const,
        },
        {
            chinese: `即使${bundle.supportZh}后来补上了，${bundle.placeZh}也没真正稳住，因为${bundle.issueZh}一直把注意力从${bundle.focusZh}上拉开。`,
            referenceEnglish: `Even after the ${support} arrived, the ${place} never really settled because the ${issue} kept pulling attention off the ${focus}.`,
            clauseCount: 2 as const,
        },
        {
            chinese: `如果当时硬把${bundle.eventZh}照原样推进，最后背锅的只会是${bundle.placeZh}，而不是那份遮住问题的${bundle.supportZh}。`,
            referenceEnglish: `If we'd pushed the ${event} through unchanged, the ${place} would've been blamed for a problem the ${support} had hidden.`,
            clauseCount: 2 as const,
        },
    ];
}

function buildRefinedBucketSeeds(cefr: MidHighCefr, bandPosition: ListeningBandPosition) {
    const builder = cefr === "B1"
        ? buildB1RefinedCandidates
        : cefr === "B2"
            ? buildB2RefinedCandidates
            : buildC1RefinedCandidates;

    return MID_HIGH_THEMES.flatMap((bundle, bundleIndex) => builder(bundle).map((variant, variantIndex) => ({
        id: refinedMidHighId(cefr, bandPosition, bundleIndex, variantIndex),
        chinese: variant.chinese,
        referenceEnglish: variant.referenceEnglish,
        targetEnglishVocab: [bundle.focusEn, bundle.issueEn, bundle.eventEn],
        theme: bundle.theme,
        scene: bundle.scene,
        tags: ["curated", "refined", cefr.toLowerCase(), bandPosition],
        cefr,
        bandPosition,
        clauseCount: variant.clauseCount,
        qualityScore: 0.97,
    } satisfies MidHighSeed)));
}

const REFINED_MID_HIGH_SEEDS: MidHighSeed[] = [
    ...buildRefinedBucketSeeds("B1", "entry"),
    ...buildRefinedBucketSeeds("B1", "mid"),
    ...buildRefinedBucketSeeds("B1", "exit"),
    ...buildRefinedBucketSeeds("B2", "entry"),
    ...buildRefinedBucketSeeds("B2", "mid"),
    ...buildRefinedBucketSeeds("B2", "exit"),
    ...buildRefinedBucketSeeds("C1", "entry"),
    ...buildRefinedBucketSeeds("C1", "mid"),
    ...buildRefinedBucketSeeds("C1", "exit"),
];

const CURATED_MID_HIGH_SEEDS: MidHighSeed[] = MANUAL_MID_HIGH_SEEDS;

function buildGeneratedCandidates(bundle: ThemeBundle, cefr: MidHighCefr, bandPosition: ListeningBandPosition): MidHighSeed[] {
    const baseSeeds = cefr === "B1"
        ? buildB1Candidates(bundle, bandPosition)
        : cefr === "B2"
            ? buildB2Candidates(bundle, bandPosition)
            : buildC1Candidates(bundle, bandPosition);

    return baseSeeds.map((seed, index) => ({
        id: "",
        chinese: `${bandOpening(cefr, bandPosition, index).zh}${seed.chinese}`,
        referenceEnglish: `${bandOpening(cefr, bandPosition, index).en}${seed.referenceEnglish}`,
        targetEnglishVocab: [bundle.focusEn, bundle.issueEn, bundle.eventEn],
        theme: bundle.theme,
        scene: bundle.scene,
        tags: ["generated", cefr.toLowerCase(), bandPosition, `template-${index + 1}`],
        cefr,
        bandPosition,
        clauseCount: seed.clauseCount,
        reviewStatus: "draft",
        qualityScore: generatedQualityScore(cefr, bandPosition, index),
    }));
}

function buildGeneratedBucket(cefr: MidHighCefr, bandPosition: ListeningBandPosition, existingEnglish: Set<string>) {
    const key = keyFor(cefr, bandPosition);
    const targetCount = MID_HIGH_BUCKET_TARGETS[key];
    const manualSeeds = CURATED_MID_HIGH_SEEDS.filter((seed) => seed.cefr === cefr && seed.bandPosition === bandPosition);
    const selected = [...manualSeeds];
    const seen = new Set([...existingEnglish, ...manualSeeds.map((seed) => seed.referenceEnglish)]);
    let autoIndex = 1;

    const candidatePools = MID_HIGH_THEMES.map((bundle) => buildGeneratedCandidates(bundle, cefr, bandPosition));
    const poolIndexes = candidatePools.map(() => 0);

    while (selected.length < targetCount) {
        let progressed = false;

        for (let poolIndex = 0; poolIndex < candidatePools.length && selected.length < targetCount; poolIndex++) {
            const pool = candidatePools[poolIndex];
            while (poolIndexes[poolIndex] < pool.length) {
                const candidate = pool[poolIndexes[poolIndex]++];
                if (seen.has(candidate.referenceEnglish)) continue;
                if (!inWordRange(candidate)) continue;

                selected.push({
                    ...candidate,
                    id: autoId(cefr, bandPosition, autoIndex++),
                });
                seen.add(candidate.referenceEnglish);
                progressed = true;
                break;
            }
        }

        if (!progressed) break;
    }

    if (selected.length < targetCount) {
        throw new Error(`Insufficient ${key} candidates: ${selected.length}/${targetCount}`);
    }

    return selected.slice(0, targetCount);
}

const MID_HIGH_GENERATED_SEEDS = (() => {
    const existingEnglish = new Set(CURATED_MID_HIGH_SEEDS.map((seed) => seed.referenceEnglish));
    const buckets: MidHighSeed[] = [];
    const order: Array<[MidHighCefr, ListeningBandPosition]> = [
        ["B1", "entry"],
        ["B1", "mid"],
        ["B1", "exit"],
        ["B2", "entry"],
        ["B2", "mid"],
        ["B2", "exit"],
        ["C1", "entry"],
        ["C1", "mid"],
        ["C1", "exit"],
    ];

    for (const [cefr, bandPosition] of order) {
        const seeds = buildGeneratedBucket(cefr, bandPosition, existingEnglish);
        for (const seed of seeds) {
            buckets.push(seed);
            existingEnglish.add(seed.referenceEnglish);
        }
    }

    return buckets;
})();

export const MID_HIGH_LISTENING_DRILLS = MID_HIGH_GENERATED_SEEDS.map(buildMidHighItem);
