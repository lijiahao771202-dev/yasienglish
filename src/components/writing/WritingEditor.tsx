"use client";

import { motion, AnimatePresence } from "framer-motion";
import { DrillCore } from "../drill/DrillCore";

interface WritingEditorProps {
    articleTitle: string;
    articleContent?: string;
    onClose?: () => void;
}

export function WritingEditor({ articleTitle, articleContent, onClose }: WritingEditorProps) {
    return (
        <AnimatePresence>
            <motion.div
                key="writing-modal"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 overflow-hidden font-sans"
            >
                {/* Liquid Background */}
                <div className="absolute inset-0 bg-stone-50/80 backdrop-blur-3xl z-[-1]" />
                <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-sky-200/30 rounded-full blur-[120px] animate-pulse" />
                <div className="absolute bottom-[-10%] right-[-5%] w-[500px] h-[500px] bg-amber-200/30 rounded-full blur-[100px] animate-pulse delay-700" />

                {/* Main Card Container */}
                <motion.div
                    initial={{ scale: 0.95, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: 20 }} // Ensure exit animation works
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className="relative w-full max-w-5xl h-[90vh] glass-panel bg-white/60 border border-white/60 shadow-2xl shadow-stone-300/40 rounded-[3rem] overflow-hidden flex flex-col"
                >
                    <DrillCore
                        context={{
                            type: 'article',
                            articleTitle,
                            articleContent
                        }}
                        onClose={onClose}
                    />
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
