"use client";

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
    ReactFlow,
    useNodesState,
    useEdgesState,
    Position,
    Handle,
    Node,
    Edge,
    Background,
    Controls,
    useReactFlow,
    ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { Maximize2, X, Focus } from 'lucide-react';
import { cn } from '@/lib/utils';

// --- Types ---

interface TreeData {
    label: string;
    text: string;
    zh?: string;
    role_zh?: string;
    zh_order?: number;
    children?: TreeData[];
}

// --- Tier classification (面向中国学生的"骨架 / 修饰 / 从句"分层) ---

type SyntaxTier = 'root' | 'skeleton' | 'clause' | 'modifier' | 'other';

function classifyTier(label: string, isRoot?: boolean): SyntaxTier {
    const trimmed = (label || '').trim();
    if (isRoot) return 'root';
    if (/^(主句|并列主句)$/.test(trimmed)) return 'root';
    if (/^(主语|谓语|宾语|直接宾语|间接宾语|表语|系动词|宾语补足语|主语补足语|引导词)$/.test(trimmed)) return 'skeleton';
    if (/从句/.test(trimmed)) return 'clause';
    if (/(状语|定语|插入语|同位语|介词短语|分词|不定式|动名词|补语|修饰)/.test(trimmed)) return 'modifier';
    return 'other';
}

// Fallback 大白话 role map — used when the model forgot to supply role_zh.
const ROLE_ZH_FALLBACK: Record<string, string> = {
    '主句': '整句主干',
    '并列主句': '并列的一句',
    '主语': '谁 / 什么',
    '谓语': '做 / 是',
    '宾语': '做了谁 / 什么',
    '直接宾语': '做了什么',
    '间接宾语': '给谁',
    '表语': '是什么 / 怎么样',
    '系动词': '是 / 变成',
    '宾语补足语': '宾语怎么了',
    '主语补足语': '主语怎么了',
    '引导词': '带头的词',
    '宾语从句': '做了 / 说了什么',
    '主语从句': '什么事（当主语）',
    '表语从句': '是…这件事',
    '定语从句': '哪一个（修饰名词）',
    '同位语从句': '也就是说…',
    '状语从句': '在什么情况下',
    '时间状语从句': '什么时候',
    '地点状语从句': '在哪里',
    '原因状语从句': '为什么',
    '目的状语从句': '为了什么',
    '条件状语从句': '如果…',
    '让步状语从句': '虽然…',
    '结果状语从句': '结果…',
    '方式状语从句': '怎么做',
    '比较状语从句': '比起来…',
    '时间状语': '什么时候',
    '地点状语': '在哪里',
    '原因状语': '为什么',
    '目的状语': '为了什么',
    '条件状语': '如果',
    '让步状语': '虽然',
    '结果状语': '结果',
    '方式状语': '怎么样地',
    '程度状语': '到什么程度',
    '伴随状语': '同时在做',
    '定语': '哪一个的',
    '后置定语': '哪一个（后置）',
    '前置定语': '哪一个（前置）',
    '插入语': '顺便插一句',
    '同位语': '也就是说',
    '介词短语': '在 / 关于…',
    '分词短语': '正在 / 已经…',
    '分词状语': '同时 / 已经…',
    '现在分词': '正在做',
    '过去分词': '已经 / 被做',
    '不定式': '要 / 去…',
    '不定式短语': '去做…',
    '动名词': '做…这件事',
    '动名词短语': '做…这件事',
};

function resolveRoleZh(label: string, explicit?: string): string | undefined {
    if (explicit && explicit.trim()) return explicit.trim();
    return ROLE_ZH_FALLBACK[(label || '').trim()];
}

interface SyntaxTreeViewProps {
    data: TreeData;
    /**
     * Show a top-right "放大" button that opens the same tree in a fullscreen modal.
     * Defaults to false so existing call sites keep their original layout.
     */
    allowFullscreen?: boolean;
    /** Inline canvas height in pixels. Defaults to 400. */
    height?: number;
}

// --- Semantic Theme Engine (按 tier 分层：根 / 骨架 / 从句 / 修饰) ---

function getSemanticTheme(tier: SyntaxTier) {
    switch (tier) {
        case 'root':
            // 整句/并列主句：暖橙，视觉锚点
            return {
                bg: 'bg-orange-50/95', border: 'border-orange-300/80',
                badgeBg: 'bg-orange-500', badgeText: 'text-white',
                labelTag: 'text-orange-700/80',
                text: 'text-orange-950', zh: 'text-orange-800/90',
                divider: 'border-orange-200/50',
            };
        case 'skeleton':
            // 主语/谓语/宾语/表语：深靛青，"骨架"
            return {
                bg: 'bg-indigo-50/95', border: 'border-indigo-300/80',
                badgeBg: 'bg-indigo-600', badgeText: 'text-white',
                labelTag: 'text-indigo-700/80',
                text: 'text-indigo-950', zh: 'text-indigo-800/90',
                divider: 'border-indigo-200/50',
            };
        case 'clause':
            // 从句：绿色 + 粗实边框，强调"句中句"
            return {
                bg: 'bg-emerald-50/95', border: 'border-emerald-400/80',
                badgeBg: 'bg-emerald-600', badgeText: 'text-white',
                labelTag: 'text-emerald-700/80',
                text: 'text-emerald-950', zh: 'text-emerald-800/90',
                divider: 'border-emerald-200/50',
            };
        case 'modifier':
            // 修饰成分：淡石色，视觉上"退后一步"
            return {
                bg: 'bg-stone-50/95', border: 'border-stone-200/80',
                badgeBg: 'bg-stone-400', badgeText: 'text-white',
                labelTag: 'text-stone-500',
                text: 'text-stone-800', zh: 'text-stone-600/90',
                divider: 'border-stone-200/50',
            };
        default:
            return {
                bg: 'bg-stone-50/95', border: 'border-stone-200/70',
                badgeBg: 'bg-stone-300', badgeText: 'text-stone-800',
                labelTag: 'text-stone-500',
                text: 'text-stone-900', zh: 'text-stone-600/90',
                divider: 'border-stone-200/50',
            };
    }
}

// --- Custom Node Component ---

type TrunkSegment = {
    label: string;
    roleZh?: string;
    text: string;
    zh?: string;
};

type SyntaxNodeData = {
    label: string;
    text: string;
    zh?: string;
    roleZh?: string;
    tier: SyntaxTier;
    isRoot?: boolean;
    isLeaf?: boolean;
    isDimmed?: boolean;
    skeletonOnly?: boolean;
    /**
     * 1-based position of this chunk in the English sentence, only set on level-2 chunks
     * (direct children of the root). Used for the EN/ZH order badge.
     */
    enOrder?: number;
    /** 1-based position of this chunk in the natural Chinese translation. */
    zhOrder?: number;
    /**
     * When present, this node is a "主干" compound card: a horizontal strip of
     * 主语 / 谓语 / 宾语 (or other skeleton roles) rendered as one card instead of
     * separate leaves. Avoids dangling single-word cards like bare "realized".
     */
    segments?: TrunkSegment[];
    /**
     * When present on a clause-tier node, the clause's internal 引导词/主语/谓语/宾语
     * are rendered as a horizontal strip INSIDE this card ("句中句"), rather than as
     * separate dangling level-3 children. Visually shows that the clause is itself
     * a complete mini-sentence.
     */
    clauseInternal?: TrunkSegment[];
};

// 1-9 → ①-⑨, 10+ → 数字本身
function circledNumeral(n: number): string {
    if (n >= 1 && n <= 20) return '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳'[n - 1];
    return String(n);
}

// 翻译语序徽章：英文阅读顺序 vs 中文翻译顺序
function OrderBadge({ enOrder, zhOrder }: { enOrder?: number; zhOrder?: number }) {
    if (!enOrder) return null;
    const zh = zhOrder ?? enOrder;
    const moved = zh !== enOrder;
    return (
        <div
            className={cn(
                "absolute -top-2 -right-2 z-10 flex items-center gap-1 rounded-full border px-1.5 py-[2px] text-[10px] font-black shadow-sm",
                moved
                    ? "bg-amber-50 border-amber-400 text-amber-800"
                    : "bg-white border-stone-200 text-stone-500"
            )}
            title={moved ? `英文第 ${enOrder} 位 → 中文第 ${zh} 位（翻译时要换位置）` : `英文/中文都是第 ${enOrder} 位`}
        >
            <span className="leading-none">EN&nbsp;{circledNumeral(enOrder)}</span>
            {moved ? (
                <>
                    <span className="leading-none text-amber-500">→</span>
                    <span className="leading-none">ZH&nbsp;{circledNumeral(zh)}</span>
                </>
            ) : null}
        </div>
    );
}

const TRUNK_SEGMENT_WIDTH = 160;

const SyntaxNode = ({ data }: { data: SyntaxNodeData }) => {
    const theme = getSemanticTheme(data.tier);
    const isLeaf = data.isLeaf && !data.isRoot;
    // 只看主干模式：root + skeleton 保持高亮，其它淡化
    const fadedBySkeletonOnly = Boolean(data.skeletonOnly) && data.tier !== 'root' && data.tier !== 'skeleton';
    const isDimmed = Boolean(data.isDimmed) || fadedBySkeletonOnly;
    // 大白话标签（role_zh）优先，否则落到 fallback；根节点不展示 role_zh（用 label 自己）
    const roleZh = data.isRoot ? undefined : data.roleZh;
    const showLabelTag = !data.isRoot && Boolean(roleZh) && roleZh !== data.label;

    // 主干合并卡：连续的 主语/谓语/宾语/表语 合并为一张横向分段卡
    if (data.segments && data.segments.length > 0) {
        const segments = data.segments;
        return (
            <div className={cn(
                "relative rounded-2xl border shadow-sm backdrop-blur-xl transition-all duration-300",
                theme.bg, theme.border,
                isDimmed ? "opacity-30 grayscale-[50%]" : "opacity-100 hover:shadow-md hover:-translate-y-0.5"
            )}
                style={{ width: segments.length * TRUNK_SEGMENT_WIDTH }}
            >
                <OrderBadge enOrder={data.enOrder} zhOrder={data.zhOrder} />
                <Handle type="target" position={Position.Left} className="!opacity-0 !border-0 !w-4 !h-4 -ml-2" />
                <div className="flex items-stretch">
                    {segments.map((seg, idx) => {
                        // 内嵌主干块直接用专业 label（主语/谓语/宾语…），避免 "谁/什么" 这种口语化倒乱事
                        const segRole = seg.label;
                        return (
                            <div
                                key={`${seg.label}-${idx}`}
                                className={cn(
                                    "flex-1 px-3 py-2.5 flex flex-col gap-1",
                                    idx > 0 ? "border-l border-dashed" : "",
                                    theme.divider,
                                )}
                                style={{ width: TRUNK_SEGMENT_WIDTH }}
                            >
                                <span className={cn("inline-flex self-start items-center px-1.5 py-[1px] rounded-[4px] text-[10.5px] font-bold", theme.badgeBg, theme.badgeText)}>
                                    {segRole}
                                </span>
                                {seg.text ? (
                                    <div className={cn("text-[13px] font-semibold leading-snug tracking-tight", theme.text)}>
                                        {seg.text}
                                    </div>
                                ) : null}
                                {seg.zh ? (
                                    <div className={cn("text-[10.5px] leading-snug", theme.zh)}>
                                        {seg.zh}
                                    </div>
                                ) : null}
                            </div>
                        );
                    })}
                </div>
                <Handle type="source" position={Position.Right} className="!opacity-0 !border-0 !w-4 !h-4 -mr-2" />
            </div>
        );
    }

    if (isLeaf) {
        return (
            <div className={cn(
                "relative w-[210px] rounded-xl border px-3 py-2.5 transition-all duration-300",
                theme.bg, theme.border,
                isDimmed ? "opacity-30" : "opacity-100 hover:-translate-y-0.5 hover:shadow-sm"
            )}>
                <OrderBadge enOrder={data.enOrder} zhOrder={data.zhOrder} />
                <Handle type="target" position={Position.Left} className="!opacity-0 !border-0 !w-3 !h-3 -ml-1.5" />
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={cn("inline-flex items-center px-1.5 py-[1px] rounded-[4px] text-[10.5px] font-bold", theme.badgeBg, theme.badgeText)}>
                            {roleZh || data.label}
                        </span>
                        {showLabelTag ? (
                            <span className={cn("text-[9.5px] font-semibold tracking-wider", theme.labelTag)}>
                                {data.label}
                            </span>
                        ) : null}
                    </div>
                    {data.text ? (
                        <div className={cn("text-[12.5px] font-semibold leading-snug tracking-tight", theme.text)}>
                            {data.text}
                        </div>
                    ) : null}
                    {data.zh ? (
                        <div className={cn("text-[11px] leading-snug", theme.zh)}>
                            {data.zh}
                        </div>
                    ) : null}
                </div>
                <Handle type="source" position={Position.Right} className="!opacity-0 !border-0 !w-3 !h-3 -mr-1.5" />
            </div>
        );
    }

    const clauseInternal = data.clauseInternal;
    const hasClauseInternal = Array.isArray(clauseInternal) && clauseInternal.length > 0;
    // 含 clauseInternal 的从句卡按内部段落数动态加宽，让"句中句"横条放得开
    const cardWidth = hasClauseInternal
        ? Math.max(280, clauseInternal!.length * 130)
        : 280;

    return (
        <div
            className={cn(
                "relative rounded-2xl border shadow-sm backdrop-blur-xl transition-all duration-300",
                theme.bg, theme.border,
                // 从句卡片强调"句中句"：加粗外框
                data.tier === 'clause' ? 'border-2' : '',
                isDimmed ? "opacity-30 grayscale-[50%]" : "opacity-100 hover:shadow-md hover:-translate-y-0.5"
            )}
            style={{ width: cardWidth }}
        >
            <OrderBadge enOrder={data.enOrder} zhOrder={data.zhOrder} />
            <Handle type="target" position={Position.Left} className="!opacity-0 !border-0 !w-4 !h-4 -ml-2" />

            <div className="flex flex-col">
                <div className="px-4 pt-3.5 pb-3">
                    <div className="mb-2 flex items-center gap-2 flex-wrap">
                        <span className={cn("px-2 py-0.5 rounded-[6px] text-[11.5px] font-black", theme.badgeBg, theme.badgeText)}>
                            {roleZh || data.label}
                        </span>
                        {showLabelTag ? (
                            <span className={cn("text-[10px] font-bold tracking-[0.14em]", theme.labelTag)}>
                                {data.label}
                            </span>
                        ) : null}
                    </div>
                    {data.text ? (
                        <div className={cn("text-[13.5px] font-semibold leading-relaxed tracking-tight", theme.text)}>
                            {data.text}
                        </div>
                    ) : null}
                </div>

                {hasClauseInternal ? (
                    <div className={cn("mx-3 mb-3 rounded-lg border bg-white/70 overflow-hidden", theme.divider)}>
                        <div className="flex items-center justify-between px-2.5 py-1 border-b border-dashed border-stone-200/70">
                            <span className={cn("text-[9.5px] font-black tracking-[0.18em] uppercase", theme.labelTag)}>
                                句中句 · 这一整块本身就是一句话
                            </span>
                        </div>
                        <div className="flex items-stretch">
                            {clauseInternal!.map((seg, idx) => {
                                // 句中句内部同样用专业 label（引导词/主语/谓语/宾语…）
                                const segRole = seg.label;
                                return (
                                    <div
                                        key={`ci-${seg.label}-${idx}`}
                                        className={cn(
                                            "flex-1 px-2 py-2 flex flex-col gap-0.5 min-w-0",
                                            idx > 0 ? "border-l border-dashed border-stone-200/70" : "",
                                        )}
                                    >
                                        <span className={cn(
                                            "self-start inline-flex items-center px-1.5 py-[1px] rounded-[4px] text-[9.5px] font-bold",
                                            theme.badgeBg, theme.badgeText
                                        )}>
                                            {segRole}
                                        </span>
                                        {seg.text ? (
                                            <div className={cn("text-[11.5px] font-semibold leading-snug tracking-tight break-words", theme.text)}>
                                                {seg.text}
                                            </div>
                                        ) : null}
                                        {seg.zh ? (
                                            <div className={cn("text-[10px] leading-snug break-words", theme.zh)}>
                                                {seg.zh}
                                            </div>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : null}

                {data.zh ? (
                    <div className={cn("px-4 py-2.5 border-t border-dashed text-[11.5px] leading-snug rounded-b-2xl bg-white/40", theme.divider, theme.zh)}>
                        {data.zh}
                    </div>
                ) : null}
            </div>

            <Handle type="source" position={Position.Right} className="!opacity-0 !border-0 !w-4 !h-4 -mr-2" />
        </div>
    );
};

const nodeTypes = {
    syntax: SyntaxNode,
};

// --- Layout Helper (Dagre) ---

const TRUNK_SIZE = { width: 280, height: 132 };
const LEAF_SIZE = { width: 210, height: 84 };

function getNodeSize(node: Node) {
    const data = node.data as SyntaxNodeData | undefined;
    // 主干合并卡：宽度随 segments 数量动态扩展
    if (data?.segments && data.segments.length > 0) {
        return { width: data.segments.length * TRUNK_SEGMENT_WIDTH, height: 112 };
    }
    // 含"句中句"内嵌横条的从句卡：动态加宽并加高
    if (data?.clauseInternal && data.clauseInternal.length > 0) {
        const width = Math.max(280, data.clauseInternal.length * 130);
        return { width, height: 218 };
    }
    const isLeaf = Boolean(data?.isLeaf) && !data?.isRoot;
    return isLeaf ? LEAF_SIZE : TRUNK_SIZE;
}

const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));

    // Switch to Left-to-Right layout. Slightly tighter siblings, more separation between ranks.
    dagreGraph.setGraph({ rankdir: 'LR', nodesep: 20, ranksep: 110 });

    nodes.forEach((node) => {
        const { width, height } = getNodeSize(node);
        dagreGraph.setNode(node.id, { width, height });
    });

    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    const layoutedNodes = nodes.map((node) => {
        const { width, height } = getNodeSize(node);
        const nodeWithPosition = dagreGraph.node(node.id);
        return {
            ...node,
            targetPosition: Position.Left,
            sourcePosition: Position.Right,
            position: {
                x: nodeWithPosition.x - width / 2,
                y: nodeWithPosition.y - height / 2,
            },
        };
    });

    return { nodes: layoutedNodes, edges };
};

// --- Main Component ---

interface SyntaxTreeCanvasProps {
    data: TreeData;
    onRequestEnlarge?: () => void;
    showEnlargeButton?: boolean;
    minZoom?: number;
    maxZoom?: number;
}

function SyntaxTreeCanvas({
    data,
    onRequestEnlarge,
    showEnlargeButton,
    minZoom = 0.5,
    maxZoom = 1.5,
}: SyntaxTreeCanvasProps) {
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const [skeletonOnly, setSkeletonOnly] = useState(false);
    const { fitView } = useReactFlow();

    const { initialNodes, initialEdges, parentMap } = useMemo(() => {
        const iNodes: Node[] = [];
        const iEdges: Edge[] = [];
        const pMap = new Map<string, string>();
        let idCounter = 0;

        const traverse = (
            node: TreeData,
            parentId: string | undefined,
            depth: number,
            level2Order?: number,
        ) => {
            const currentId = `node-${idCounter++}`;
            const hasChildren = Array.isArray(node.children) && node.children.length > 0;
            const isRoot = !parentId;
            const tier = classifyTier(node.label, isRoot);
            // Level-2 chunks get EN/ZH order badges. Higher levels do not.
            const enOrder = level2Order;
            const zhOrder = level2Order !== undefined
                ? (typeof node.zh_order === 'number' && node.zh_order > 0 ? Math.floor(node.zh_order) : level2Order)
                : undefined;

            // 句中句：从句节点的所有子节点都是叶子时，把它们收拢为内嵌横条，
            // 不再外挂级 3 子节点。直观告诉学生"这一整块本身就是一句话"。
            const kidsAllLeaves = hasChildren
                && node.children!.every((k) => !k.children || k.children.length === 0);
            const inlineAsClause = tier === 'clause' && kidsAllLeaves;
            const clauseInternal = inlineAsClause
                ? node.children!.map((k) => ({
                    label: k.label,
                    roleZh: resolveRoleZh(k.label, k.role_zh),
                    text: k.text,
                    zh: k.zh,
                }))
                : undefined;

            iNodes.push({
                id: currentId,
                type: 'syntax',
                data: {
                    label: node.label,
                    text: node.text,
                    zh: node.zh,
                    roleZh: resolveRoleZh(node.label, node.role_zh),
                    tier,
                    isRoot,
                    // Inlined clauses still render via the normal-card branch (so clauseInternal shows up),
                    // not the small leaf branch — keep isLeaf strictly tied to "no real children".
                    isLeaf: !hasChildren,
                    isDimmed: false,
                    skeletonOnly: false,
                    enOrder,
                    zhOrder,
                    clauseInternal,
                } satisfies SyntaxNodeData,
                position: { x: 0, y: 0 },
            });

            if (parentId) {
                pMap.set(currentId, parentId);
                iEdges.push({
                    id: `edge-${parentId}-${currentId}`,
                    source: parentId,
                    target: currentId,
                    type: 'default',
                    style: { stroke: '#e4e4e7', strokeWidth: 1 },
                });
            }

            if (hasChildren && !inlineAsClause) {
                const kids = node.children!;
                const isLevel2Parent = depth === 0;
                let i = 0;
                let level2Counter = 1;
                while (i < kids.length) {
                    const first = kids[i];
                    const firstIsSkelLeaf = classifyTier(first.label) === 'skeleton'
                        && (!first.children || first.children.length === 0);
                    if (!firstIsSkelLeaf) {
                        traverse(first, currentId, depth + 1, isLevel2Parent ? level2Counter : undefined);
                        if (isLevel2Parent) level2Counter += 1;
                        i++;
                        continue;
                    }
                    // Collect a run of consecutive skeleton leaves.
                    const buffer: TreeData[] = [];
                    while (i < kids.length) {
                        const c = kids[i];
                        const isSkLeaf = classifyTier(c.label) === 'skeleton'
                            && (!c.children || c.children.length === 0);
                        if (!isSkLeaf) break;
                        buffer.push(c);
                        i++;
                    }
                    if (buffer.length === 1) {
                        // Single 骨架 leaf (e.g. only 主语 under this parent) — keep as regular leaf.
                        traverse(buffer[0], currentId, depth + 1, isLevel2Parent ? level2Counter : undefined);
                        if (isLevel2Parent) level2Counter += 1;
                    } else {
                        // Merge 2+ consecutive skeleton leaves into a compound 主干 card.
                        const trunkId = `node-${idCounter++}`;
                        const trunkEnOrder = isLevel2Parent ? level2Counter : undefined;
                        iNodes.push({
                            id: trunkId,
                            type: 'syntax',
                            data: {
                                label: '主干',
                                text: '',
                                tier: 'skeleton',
                                isRoot: false,
                                isLeaf: true,
                                isDimmed: false,
                                skeletonOnly: false,
                                enOrder: trunkEnOrder,
                                zhOrder: trunkEnOrder, // 主干合并卡按 EN 顺序对齐，不视为搬家
                                segments: buffer.map((b) => ({
                                    label: b.label,
                                    roleZh: resolveRoleZh(b.label, b.role_zh),
                                    text: b.text,
                                    zh: b.zh,
                                })),
                            } satisfies SyntaxNodeData,
                            position: { x: 0, y: 0 },
                        });
                        pMap.set(trunkId, currentId);
                        iEdges.push({
                            id: `edge-${currentId}-${trunkId}`,
                            source: currentId,
                            target: trunkId,
                            type: 'default',
                            style: { stroke: '#e4e4e7', strokeWidth: 1 },
                        });
                        if (isLevel2Parent) level2Counter += 1;
                    }
                }
            }
        };

        traverse(data, undefined, 0);
        return { initialNodes: iNodes, initialEdges: iEdges, parentMap: pMap };
    }, [data]);

    useEffect(() => {
        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
            initialNodes,
            initialEdges,
        );

        setNodes(layoutedNodes);
        setEdges(layoutedEdges);

        const timer = setTimeout(() => {
            fitView({ padding: 0.15 });
        }, 50);
        return () => clearTimeout(timer);
    }, [initialNodes, initialEdges, setNodes, setEdges, fitView]);

    // Propagate skeletonOnly toggle into each node's data so <SyntaxNode/> can fade non-backbone nodes.
    useEffect(() => {
        setNodes(nds => nds.map(n => ({
            ...n,
            data: { ...n.data, skeletonOnly },
        })));
        // Also dim edges that connect to non-skeleton / non-root targets.
        setEdges(eds => eds.map(e => {
            if (!skeletonOnly) {
                return { ...e, style: { ...e.style, opacity: 1, stroke: '#e4e4e7', strokeWidth: 1 } };
            }
            // Look up target tier from current nodes snapshot via a map built below.
            return e;
        }));
    }, [skeletonOnly, setNodes, setEdges]);

    // When skeletonOnly is on, dim edges whose target is not root/skeleton.
    useEffect(() => {
        if (!skeletonOnly) return;
        setEdges(eds => eds.map(e => {
            const targetNode = nodes.find(n => n.id === e.target);
            const targetTier = (targetNode?.data as SyntaxNodeData | undefined)?.tier;
            const keep = targetTier === 'root' || targetTier === 'skeleton';
            return {
                ...e,
                style: {
                    ...e.style,
                    opacity: keep ? 1 : 0.18,
                    stroke: keep ? '#818cf8' : '#e4e4e7',
                    strokeWidth: keep ? 1.5 : 1,
                },
            };
        }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [skeletonOnly, nodes.length]);

    const onNodeMouseEnter = useCallback((_: React.MouseEvent, node: Node) => {
        const activeIds = new Set<string>([node.id]);
        let curr = parentMap.get(node.id);
        while (curr) {
            activeIds.add(curr);
            curr = parentMap.get(curr);
        }

        setNodes(nds => nds.map(n => ({
            ...n,
            data: { ...n.data, isDimmed: !activeIds.has(n.id) }
        })));

        setEdges(eds => eds.map(e => {
            const isActive = activeIds.has(e.source) && activeIds.has(e.target);
            return {
                ...e,
                animated: isActive,
                style: {
                    ...e.style,
                    opacity: isActive ? 1 : 0.18,
                    strokeWidth: isActive ? 2 : 1,
                    stroke: isActive ? '#818cf8' : '#e4e4e7',
                },
                zIndex: isActive ? 10 : 0
            };
        }));
    }, [parentMap, setNodes, setEdges]);

    const onNodeMouseLeave = useCallback(() => {
        setNodes(nds => nds.map(n => ({
            ...n,
            data: { ...n.data, isDimmed: false }
        })));
        setEdges(eds => eds.map(e => ({
            ...e,
            animated: false,
            style: {
                ...e.style,
                opacity: 1,
                strokeWidth: 1,
                stroke: '#e4e4e7',
            },
            zIndex: 0
        })));
    }, [setNodes, setEdges]);

    return (
        <>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeMouseEnter={onNodeMouseEnter}
                onNodeMouseLeave={onNodeMouseLeave}
                nodeTypes={nodeTypes}
                fitView
                attributionPosition="bottom-right"
                minZoom={minZoom}
                maxZoom={maxZoom}
            >
                <Background color="#e7e5e4" gap={20} size={1} />
                <Controls className="!bg-white/80 !backdrop-blur-sm !border-stone-200 !shadow-sm" />
            </ReactFlow>
            <button
                type="button"
                onClick={() => setSkeletonOnly(v => !v)}
                aria-pressed={skeletonOnly}
                aria-label={skeletonOnly ? '显示全部节点' : '只看主干'}
                className={cn(
                    "absolute left-2 top-2 z-20 inline-flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-[11px] font-bold shadow-sm backdrop-blur-sm transition",
                    skeletonOnly
                        ? "border-indigo-400 bg-indigo-600 text-white hover:bg-indigo-700"
                        : "border-stone-200 bg-white/95 text-stone-600 hover:bg-stone-100 hover:text-stone-900",
                )}
            >
                <Focus className="h-3.5 w-3.5" />
                {skeletonOnly ? '显示全部' : '只看主干'}
            </button>
            {showEnlargeButton && onRequestEnlarge ? (
                <button
                    type="button"
                    onClick={onRequestEnlarge}
                    aria-label="放大语法树"
                    className="absolute right-2 top-2 z-20 inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white/95 px-2.5 py-1.5 text-[11px] font-bold text-stone-600 shadow-sm backdrop-blur-sm transition hover:bg-stone-100 hover:text-stone-900"
                >
                    <Maximize2 className="h-3.5 w-3.5" />
                    放大
                </button>
            ) : null}
        </>
    );
}

function SyntaxTreeViewInner({ data, allowFullscreen, height = 400 }: SyntaxTreeViewProps) {
    const [isLightboxOpen, setIsLightboxOpen] = useState(false);

    useEffect(() => {
        if (!isLightboxOpen) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsLightboxOpen(false);
            }
        };

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = previousOverflow;
        };
    }, [isLightboxOpen]);

    const lightbox = isLightboxOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
                data-testid="syntax-tree-lightbox"
                className="fixed inset-0 z-[12000] bg-stone-950/70 px-3 py-4 backdrop-blur-sm sm:px-6 sm:py-8"
                onClick={() => setIsLightboxOpen(false)}
            >
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="放大查看语法树"
                    className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-[1.5rem] border border-stone-200/80 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.28)]"
                    onClick={(event) => event.stopPropagation()}
                >
                    <div className="flex items-center justify-between border-b border-stone-200/80 px-4 py-3 sm:px-5">
                        <div className="min-w-0">
                            <p className="text-[12px] font-black uppercase tracking-[0.16em] text-stone-500">Syntax Tree</p>
                            <p className="mt-1 text-[15px] font-bold text-stone-800">放大查看语法树</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsLightboxOpen(false)}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-stone-50 text-stone-600 transition hover:bg-stone-100 hover:text-stone-900"
                            aria-label="关闭放大语法树"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                    <div className="relative flex-1 bg-stone-50">
                        <ReactFlowProvider>
                            <SyntaxTreeCanvas data={data} minZoom={0.2} maxZoom={2.5} />
                        </ReactFlowProvider>
                    </div>
                </div>
            </div>,
            document.body,
        )
        : null;

    return (
        <>
            <div
                className="relative w-full overflow-hidden rounded-xl border border-stone-100 bg-stone-50/30 group"
                style={{ height }}
            >
                <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_40px_rgba(0,0,0,0.02)] z-10 rounded-xl"></div>
                <SyntaxTreeCanvas
                    data={data}
                    showEnlargeButton={Boolean(allowFullscreen)}
                    onRequestEnlarge={() => setIsLightboxOpen(true)}
                />
            </div>
            {lightbox}
        </>
    );
}

export function SyntaxTreeView(props: SyntaxTreeViewProps) {
    return (
        <ReactFlowProvider>
            <SyntaxTreeViewInner {...props} />
        </ReactFlowProvider>
    );
}
