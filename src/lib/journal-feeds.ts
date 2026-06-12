export type JournalGroupId = "general" | "life_science" | "medicine" | "psychology_learning";

export interface JournalGroup {
    id: JournalGroupId;
    label: string;
    description: string;
}

export interface JournalSource {
    id: string;
    groupId: JournalGroupId;
    name: string;
    url: string;
    weight?: number;
}

export const DEFAULT_JOURNAL_GROUP_ID: JournalGroupId = "general";

export const JOURNAL_GROUPS: JournalGroup[] = [
    {
        id: "general",
        label: "综合热门",
        description: "Nature、Science 等高识别度综合期刊。",
    },
    {
        id: "life_science",
        label: "生命科学",
        description: "Cell、Nature Communications 等生命科学与综合研究源。",
    },
    {
        id: "medicine",
        label: "医学健康",
        description: "The Lancet、NEJM 等临床医学期刊。",
    },
    {
        id: "psychology_learning",
        label: "心理/学习",
        description: "行为科学、学习科学和认知研究期刊。",
    },
];

export const JOURNAL_SOURCES: JournalSource[] = [
    {
        id: "nature",
        groupId: "general",
        name: "Nature",
        url: "https://www.nature.com/nature.rss",
        weight: 1.15,
    },
    {
        id: "science",
        groupId: "general",
        name: "Science",
        url: "https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=science",
        weight: 1.15,
    },
    {
        id: "nature-communications",
        groupId: "general",
        name: "Nature Communications",
        url: "https://www.nature.com/ncomms.rss",
        weight: 1.08,
    },
    {
        id: "scientific-reports",
        groupId: "general",
        name: "Scientific Reports",
        url: "https://www.nature.com/srep.rss",
        weight: 1.02,
    },
    {
        id: "plos-one",
        groupId: "general",
        name: "PLOS ONE",
        url: "https://journals.plos.org/plosone/feed/atom",
        weight: 1.02,
    },
    {
        id: "cell",
        groupId: "life_science",
        name: "Cell",
        url: "https://www.cell.com/cell/inpress.rss",
        weight: 1.14,
    },
    {
        id: "neuron",
        groupId: "life_science",
        name: "Neuron",
        url: "https://www.cell.com/neuron/inpress.rss",
        weight: 1.1,
    },
    {
        id: "trends-neurosciences-life",
        groupId: "life_science",
        name: "Trends in Neurosciences",
        url: "https://www.cell.com/trends/neurosciences/inpress.rss",
        weight: 1.08,
    },
    {
        id: "nature-communications-life",
        groupId: "life_science",
        name: "Nature Communications",
        url: "https://www.nature.com/ncomms.rss",
        weight: 1.08,
    },
    {
        id: "scientific-reports-life",
        groupId: "life_science",
        name: "Scientific Reports",
        url: "https://www.nature.com/srep.rss",
        weight: 1.02,
    },
    {
        id: "plos-one-life",
        groupId: "life_science",
        name: "PLOS ONE",
        url: "https://journals.plos.org/plosone/feed/atom",
        weight: 1.02,
    },
    {
        id: "lancet",
        groupId: "medicine",
        name: "The Lancet",
        url: "https://www.thelancet.com/rssfeed/lancet_online.xml",
        weight: 1.15,
    },
    {
        id: "nejm",
        groupId: "medicine",
        name: "NEJM",
        url: "https://www.nejm.org/action/showFeed?jc=nejm&type=etoc&feed=rss",
        weight: 1.14,
    },
    {
        id: "nature-human-behaviour",
        groupId: "psychology_learning",
        name: "Nature Human Behaviour",
        url: "https://www.nature.com/nathumbehav.rss",
        weight: 1.14,
    },
    {
        id: "npj-science-learning",
        groupId: "psychology_learning",
        name: "npj Science of Learning",
        url: "https://www.nature.com/npjscilearn.rss",
        weight: 1.1,
    },
    {
        id: "trends-cognitive-sciences",
        groupId: "psychology_learning",
        name: "Trends in Cognitive Sciences",
        url: "https://www.cell.com/trends/cognitive-sciences/inpress.rss",
        weight: 1.12,
    },
    {
        id: "psychological-science",
        groupId: "psychology_learning",
        name: "Psychological Science",
        url: "https://journals.sagepub.com/action/showFeed?type=etoc&feed=rss&jc=pssa",
        weight: 1.08,
    },
    {
        id: "learning-instruction",
        groupId: "psychology_learning",
        name: "Learning and Instruction",
        url: "https://rss.sciencedirect.com/publication/science/09594752",
        weight: 1.08,
    },
    {
        id: "cognition",
        groupId: "psychology_learning",
        name: "Cognition",
        url: "https://rss.sciencedirect.com/publication/science/00100277",
        weight: 1.06,
    },
    {
        id: "journal-memory-language",
        groupId: "psychology_learning",
        name: "Journal of Memory and Language",
        url: "https://rss.sciencedirect.com/publication/science/0749596X",
        weight: 1.06,
    },
];

export function resolveJournalGroupId(value?: string | null): JournalGroupId {
    return JOURNAL_GROUPS.some((group) => group.id === value)
        ? value as JournalGroupId
        : DEFAULT_JOURNAL_GROUP_ID;
}

export function getJournalSourcesByGroup(groupId: JournalGroupId): JournalSource[] {
    return JOURNAL_SOURCES.filter((source) => source.groupId === groupId);
}
