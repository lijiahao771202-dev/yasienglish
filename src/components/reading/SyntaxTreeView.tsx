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
import { Maximize2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// --- Types ---

interface TreeData {
    label: string;
    text: string;
    zh?: string;
    children?: TreeData[];
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

// --- Semantic Theme Engine ---

function getSemanticTheme(label: string, isRoot?: boolean) {
    if (isRoot || label.includes('主句')) {
        return {
            bg: 'bg-orange-50/95', border: 'border-orange-200/70',
            badgeBg: 'bg-orange-200/60', badgeText: 'text-orange-800',
            text: 'text-orange-950', zh: 'text-orange-800/90',
            divider: 'border-orange-200/50'
        };
    }
    if (['主语', '谓语', '宾语', '表语', '系动词'].some(k => label.includes(k))) {
        return {
            bg: 'bg-indigo-50/95', border: 'border-indigo-200/70',
            badgeBg: 'bg-indigo-200/60', badgeText: 'text-indigo-800',
            text: 'text-indigo-950', zh: 'text-indigo-800/90',
            divider: 'border-indigo-200/50'
        };
    }
    if (['从句', '状语', '定语', '插入语', '同位语', '介词短语', '分词', '不定式'].some(k => label.includes(k))) {
        return {
            bg: 'bg-teal-50/95', border: 'border-teal-200/70',
            badgeBg: 'bg-teal-200/60', badgeText: 'text-teal-800',
            text: 'text-teal-950', zh: 'text-teal-800/90',
            divider: 'border-teal-200/50'
        };
    }
    return {
        bg: 'bg-stone-50/95', border: 'border-stone-200/70',
        badgeBg: 'bg-stone-200/60', badgeText: 'text-stone-700',
        text: 'text-stone-900', zh: 'text-stone-600/90',
        divider: 'border-stone-200/50'
    };
}

// --- Custom Node Component ---

type SyntaxNodeData = {
    label: string;
    text: string;
    zh?: string;
    isRoot?: boolean;
    isLeaf?: boolean;
    isDimmed?: boolean;
};

const SyntaxNode = ({ data }: { data: SyntaxNodeData }) => {
    const theme = getSemanticTheme(data.label, data.isRoot);
    const isDimmed = data.isDimmed;
    const isLeaf = data.isLeaf && !data.isRoot;

    if (isLeaf) {
        return (
            <div className={cn(
                "relative w-[210px] rounded-xl border px-3 py-2.5 transition-all duration-300",
                theme.bg, theme.border,
                isDimmed ? "opacity-30" : "opacity-100 hover:-translate-y-0.5 hover:shadow-sm"
            )}>
                <Handle type="target" position={Position.Left} className="!opacity-0 !border-0 !w-3 !h-3 -ml-1.5" />
                <div className="flex flex-col gap-0.5">
                    <span className={cn("text-[10px] font-black tracking-[0.16em] uppercase", theme.badgeText)}>
                        {data.label}
                    </span>
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

    return (
        <div className={cn(
            "relative w-[280px] rounded-2xl border shadow-sm backdrop-blur-xl transition-all duration-300",
            theme.bg, theme.border,
            isDimmed ? "opacity-30 grayscale-[50%]" : "opacity-100 hover:shadow-md hover:-translate-y-0.5"
        )}>
            <Handle type="target" position={Position.Left} className="!opacity-0 !border-0 !w-4 !h-4 -ml-2" />

            <div className="flex flex-col">
                <div className="px-4 pt-3.5 pb-3">
                    <div className="mb-2 flex">
                        <span className={cn("px-2 py-0.5 rounded-[6px] text-[10px] font-black tracking-widest uppercase", theme.badgeBg, theme.badgeText)}>
                            {data.label}
                        </span>
                    </div>
                    {data.text ? (
                        <div className={cn("text-[13.5px] font-semibold leading-relaxed tracking-tight", theme.text)}>
                            {data.text}
                        </div>
                    ) : null}
                </div>
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
    const isLeaf = Boolean((node.data as { isLeaf?: boolean })?.isLeaf) && !(node.data as { isRoot?: boolean })?.isRoot;
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
    const { fitView } = useReactFlow();

    const { initialNodes, initialEdges, parentMap } = useMemo(() => {
        const iNodes: Node[] = [];
        const iEdges: Edge[] = [];
        const pMap = new Map<string, string>();
        let idCounter = 0;

        const traverse = (node: TreeData, parentId?: string) => {
            const currentId = `node-${idCounter++}`;
            const hasChildren = Array.isArray(node.children) && node.children.length > 0;

            iNodes.push({
                id: currentId,
                type: 'syntax',
                data: {
                    label: node.label,
                    text: node.text,
                    zh: node.zh,
                    isRoot: !parentId,
                    isLeaf: !hasChildren,
                    isDimmed: false,
                },
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

            if (hasChildren) {
                node.children!.forEach((child) => traverse(child, currentId));
            }
        };

        traverse(data);
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
