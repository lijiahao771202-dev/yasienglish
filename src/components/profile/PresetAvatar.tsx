"use client";

import { AVATAR_PRESET_MAP } from "@/lib/avatar-presets";
import { DEFAULT_AVATAR_PRESET } from "@/lib/user-sync";

interface PresetAvatarProps {
    presetId?: string | null;
    size?: number;
    className?: string;
}

export function PresetAvatar({
    presetId,
    size = 56,
    className = "",
}: PresetAvatarProps) {
    const preset = AVATAR_PRESET_MAP[presetId || ""] ?? AVATAR_PRESET_MAP[DEFAULT_AVATAR_PRESET];

    return (
        <div
            className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-[36%] ${className}`}
            style={{
                width: size,
                height: size,
                background: `linear-gradient(145deg, ${preset.baseFrom}, ${preset.baseTo})`,
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.78), 0 18px 32px -20px rgba(60, 44, 31, 0.28)",
            }}
        >
            <div
                className="absolute inset-[10%] rounded-[32%] border border-white/35"
                style={{
                    background: `radial-gradient(circle at 30% 20%, ${preset.glow}, transparent 56%)`,
                }}
            />
            <div
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                    width: size * 0.72,
                    height: size * 0.72,
                    background: "rgba(255,255,255,0.32)",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.75)",
                }}
            />
            <span
                className="relative z-10 select-none leading-none"
                style={{
                    fontSize: size * 0.48,
                    filter: "drop-shadow(0 8px 16px rgba(60, 44, 31, 0.16))",
                }}
                aria-hidden="true"
            >
                {preset.emoji}
            </span>
        </div>
    );
}
