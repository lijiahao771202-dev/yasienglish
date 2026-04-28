"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { LUXURY_MOTION } from "../OnboardingWizard";

// A high-end Knowledge Graph animation component
function KnowledgeGraph() {
    // 5 nodes: 1 central, 4 surrounding
    const nodes = [
        { id: 0, cx: 150, cy: 100, label: "Context" }, // Center
        { id: 1, cx: 50, cy: 40, label: "Syntax" },
        { id: 2, cx: 250, cy: 50, label: "Audio" },
        { id: 3, cx: 70, cy: 160, label: "Memory" },
        { id: 4, cx: 260, cy: 150, label: "Logic" },
    ];

    // Edges connecting center to others
    const edges = [
        { id: "e1", x1: 150, y1: 100, x2: 50, y2: 40 },
        { id: "e2", x1: 150, y1: 100, x2: 250, y2: 50 },
        { id: "e3", x1: 150, y1: 100, x2: 70, y2: 160 },
        { id: "e4", x1: 150, y1: 100, x2: 260, y2: 150 },
    ];

    return (
        <div className="w-full h-48 relative border border-white/5 rounded-2xl bg-white/[0.02] flex items-center justify-center mt-10 overflow-hidden shadow-[inset_0_0_20px_rgba(255,255,255,0.01)]">
            <svg width="320" height="200" viewBox="0 0 320 200" className="opacity-80">
                {/* Draw Edges first so they are under nodes */}
                {edges.map((edge, i) => (
                    <motion.line
                        key={edge.id}
                        x1={edge.x1}
                        y1={edge.y1}
                        x2={edge.x2}
                        y2={edge.y2}
                        stroke="rgba(255,255,255,0.3)"
                        strokeWidth="1.5"
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{ pathLength: 1, opacity: 1 }}
                        transition={{ 
                            delay: 1.5 + (i * 0.4), 
                            duration: 1, 
                            ease: "easeInOut" 
                        }}
                    />
                ))}

                {/* Draw glowing tracer dots over the edges */}
                {edges.map((edge, i) => (
                    <motion.circle
                        key={`tracer-${edge.id}`}
                        r="2"
                        fill="#fecdd3" // rose-200
                        initial={{ cx: edge.x1, cy: edge.y1, opacity: 0 }}
                        animate={{ 
                            cx: [edge.x1, edge.x2], 
                            cy: [edge.y1, edge.y2],
                            opacity: [0, 1, 0]
                        }}
                        transition={{ 
                            delay: 2.2 + (i * 0.4), 
                            duration: 1.2, 
                            repeat: Infinity,
                            repeatDelay: 3,
                            ease: "easeInOut" 
                        }}
                        style={{ filter: "drop-shadow(0 0 6px rgba(244,63,94,0.8))" }}
                    />
                ))}

                {/* Draw Nodes */}
                {nodes.map((node, i) => {
                    const isCenter = node.id === 0;
                    return (
                        <g key={node.id}>
                            <motion.circle
                                cx={node.cx}
                                cy={node.cy}
                                r={isCenter ? 12 : 5}
                                fill={isCenter ? "#f43f5e" : "#4c0519"} // rose-500 / rose-950
                                stroke={isCenter ? "none" : "#e11d48"} // rose-600
                                strokeWidth="2"
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ 
                                    delay: isCenter ? 0.8 : 2 + (i * 0.4), 
                                    type: "spring" as const, stiffness: 200, damping: 15 
                                }}
                                style={{
                                    filter: isCenter ? "drop-shadow(0 0 15px rgba(244,63,94,0.6))" : "none"
                                }}
                            />
                            {/* Pulse ring for center */}
                            {isCenter && (
                                <motion.circle
                                    cx={node.cx}
                                    cy={node.cy}
                                    r={12}
                                    fill="none"
                                    stroke="#f43f5e"
                                    strokeWidth="1"
                                    initial={{ scale: 1, opacity: 0.8 }}
                                    animate={{ scale: 2.5, opacity: 0 }}
                                    transition={{ delay: 1, duration: 2, repeat: Infinity, ease: "easeOut" }}
                                />
                            )}
                            {/* Wait to show text until node appears */}
                            <motion.text
                                x={node.cx}
                                y={node.cy + (isCenter ? 26 : 18)}
                                fill="rgba(255,255,255,0.6)"
                                fontSize={isCenter ? "11px" : "9px"}
                                fontWeight={isCenter ? "bold" : "normal"}
                                textAnchor="middle"
                                fontFamily="monospace"
                                letterSpacing="0.1em"
                                initial={{ opacity: 0, y: -5 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: isCenter ? 1 : 2.2 + (i * 0.4), duration: 0.5 }}
                            >
                                {node.label}
                            </motion.text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}

export function StepPitchPain1_Island() {
    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 1.2, ease: LUXURY_MOTION.ease }}
            className="flex flex-col text-left w-full max-w-2xl px-4"
        >
            <div className="mb-6 font-mono text-sm tracking-[0.3em] font-bold text-rose-500/80 uppercase">
                Phase 01 / Pain
            </div>
            
            <h2 className="font-newsreader text-4xl md:text-5xl text-white font-medium leading-tight mb-8">
                单词是孤岛，<br/>
                <span className="text-white/60">这就是前背侧忘的元凶。</span>
            </h2>

            <p className="text-lg md:text-xl text-white/80 leading-relaxed max-w-xl">
                传统背词软件让您不断刷卡片。可大脑被设计为<strong>只记忆有意义的、网状关联的情境</strong>。<br/><br/>
                脱离了语境的单词，就像强行塞入大脑的孤岛，没有任何神经连接。这就是为什么您背了 10 遍 "Abandon"，到了实际阅读中，依然是一张白纸。
            </p>

            <KnowledgeGraph />
        </motion.div>
    );
}
