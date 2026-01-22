"use client";

import React, { useCallback, useEffect, useMemo } from 'react';
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
    MiniMap,
    useReactFlow,
    ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

// --- Types ---

interface TreeData {
    label: string;
    text: string;
    children?: TreeData[];
}

interface SyntaxTreeViewProps {
    data: TreeData;
}

// --- Custom Node Component ---

const SyntaxNode = ({ data }: { data: { label: string; text: string; isRoot?: boolean } }) => {
    return (
        <div className={cn(
            "px-4 py-3 rounded-xl shadow-lg border backdrop-blur-md transition-all duration-300 min-w-[180px] max-w-[300px]",
            data.isRoot
                ? "bg-amber-50/80 border-amber-200 text-amber-900"
                : "bg-white/60 border-stone-200 text-stone-800 hover:border-blue-300 hover:bg-blue-50/50"
        )}>
            <Handle type="target" position={Position.Top} className="!bg-stone-300 !w-2 !h-2" />

            <div className="flex flex-col gap-1">
                <span className={cn(
                    "text-xs font-bold uppercase tracking-wider",
                    data.isRoot ? "text-amber-600" : "text-stone-500"
                )}>
                    {data.label}
                </span>
                <span className="text-sm font-medium leading-snug">
                    {data.text}
                </span>
            </div>

            <Handle type="source" position={Position.Bottom} className="!bg-stone-300 !w-2 !h-2" />
        </div>
    );
};

const nodeTypes = {
    syntax: SyntaxNode,
};

// --- Layout Helper (Dagre) ---

const nodeWidth = 220;
const nodeHeight = 100;

const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));

    dagreGraph.setGraph({ rankdir: 'TB', nodesep: 50, ranksep: 80 });

    nodes.forEach((node) => {
        dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
    });

    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    const layoutedNodes = nodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        return {
            ...node,
            position: {
                x: nodeWithPosition.x - nodeWidth / 2,
                y: nodeWithPosition.y - nodeHeight / 2,
            },
        };
    });

    return { nodes: layoutedNodes, edges };
};

// --- Main Component ---

function SyntaxTreeViewInner({ data }: SyntaxTreeViewProps) {
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const { fitView } = useReactFlow();

    // Transform TreeData to React Flow Nodes/Edges
    useEffect(() => {
        const initialNodes: Node[] = [];
        const initialEdges: Edge[] = [];
        let idCounter = 0;

        const traverse = (node: TreeData, parentId?: string) => {
            const currentId = `node-${idCounter++}`;

            initialNodes.push({
                id: currentId,
                type: 'syntax',
                data: {
                    label: node.label,
                    text: node.text,
                    isRoot: !parentId
                },
                position: { x: 0, y: 0 }, // Will be set by dagre
            });

            if (parentId) {
                initialEdges.push({
                    id: `edge-${parentId}-${currentId}`,
                    source: parentId,
                    target: currentId,
                    type: 'smoothstep',
                    animated: true,
                    style: { stroke: '#d6d3d1', strokeWidth: 2 },
                });
            }

            if (node.children) {
                node.children.forEach(child => traverse(child, currentId));
            }
        };

        traverse(data);

        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
            initialNodes,
            initialEdges
        );

        setNodes(layoutedNodes);
        setEdges(layoutedEdges);

        // Fit view after a short delay to ensure rendering
        setTimeout(() => {
            fitView({ padding: 0.2 });
        }, 100);

    }, [data, setNodes, setEdges, fitView]);

    return (
        <div className="w-full h-[400px] bg-stone-50/30 rounded-xl border border-stone-100 overflow-hidden relative group">
            {/* Glass Overlay for "Pro" feel */}
            <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_40px_rgba(0,0,0,0.02)] z-10 rounded-xl"></div>

            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                nodeTypes={nodeTypes}
                fitView
                attributionPosition="bottom-right"
                minZoom={0.5}
                maxZoom={1.5}
            >
                <Background color="#e7e5e4" gap={20} size={1} />
                <Controls className="!bg-white/80 !backdrop-blur-sm !border-stone-200 !shadow-sm" />
            </ReactFlow>
        </div>
    );
}

export function SyntaxTreeView(props: SyntaxTreeViewProps) {
    return (
        <ReactFlowProvider>
            <SyntaxTreeViewInner {...props} />
        </ReactFlowProvider>
    );
}
