"use client";

import React, { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface TEDVideoPlayerProps {
    videoUrl: string | null;
    className?: string;
}

export interface TEDVideoPlayerRef {
    // Embed player doesn't support programmatic control easily without complex postMessage
    // So we keep the ref interface minimal or empty for now
}

const TEDVideoPlayer = forwardRef<TEDVideoPlayerRef, TEDVideoPlayerProps>(
    ({ videoUrl, className = "" }, ref) => {
        const [isCollapsed, setIsCollapsed] = useState(false);

        useImperativeHandle(ref, () => ({}));

        if (!videoUrl) {
            return null;
        }

        return (
            <div className={`bg-black/40 backdrop-blur-md rounded-2xl overflow-hidden border border-white/10 ${className}`}>
                {/* Collapse Header */}
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-red-600/20 to-red-500/10 border-b border-white/10 hover:bg-red-600/30 transition-colors"
                >
                    <span className="text-sm font-medium text-white/90 flex items-center gap-2">
                        <span className="w-6 h-4 bg-red-600 rounded text-[10px] font-bold flex items-center justify-center">TED</span>
                        视频播放器
                    </span>
                    {isCollapsed ? <ChevronDown className="w-4 h-4 text-white/60" /> : <ChevronUp className="w-4 h-4 text-white/60" />}
                </button>

                {/* Video Container */}
                <div className={`transition-all duration-300 ${isCollapsed ? 'h-0 overflow-hidden' : 'h-auto'}`}>
                    <div className="relative aspect-video bg-black">
                        <iframe
                            src={videoUrl}
                            className="w-full h-full"
                            frameBorder="0"
                            scrolling="no"
                            allowFullScreen
                            allow="autoplay; fullscreen; encrypted-media"
                        />
                    </div>
                    <div className="px-4 py-2 bg-black/20 border-t border-white/5">
                        <p className="text-xs text-white/40 text-center">
                            TED 官方播放器不支持字幕同步高亮
                        </p>
                    </div>
                </div>
            </div>
        );
    }
);

TEDVideoPlayer.displayName = 'TEDVideoPlayer';

export default TEDVideoPlayer;

