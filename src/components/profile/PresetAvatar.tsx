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
            className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full ${className}`}
            style={{
                width: size,
                height: size,
                background: `linear-gradient(148deg, ${preset.gradientFrom}, ${preset.gradientTo})`,
                boxShadow:
                    "inset 0 1px 0 rgba(255,255,255,0.85), inset 0 -10px 16px rgba(30,25,40,0.14), 0 14px 24px -18px rgba(34,24,43,0.35)",
            }}
        >
            <div
                className="absolute inset-[5%] rounded-full border"
                style={{
                    borderColor: preset.ring,
                    background: `radial-gradient(82% 72% at 28% 22%, ${preset.aura}, transparent 70%)`,
                }}
            />
            <div
                className="absolute left-[20%] top-[24%] rounded-full"
                style={{
                    width: size * 0.16,
                    height: size * 0.16,
                    background: "rgba(255,255,255,0.88)",
                    boxShadow: "0 0 12px rgba(255,255,255,0.65)",
                }}
            />
            <span
                className="relative z-10 select-none leading-none"
                style={{
                    fontSize: size * 0.62,
                    lineHeight: 1,
                    transform: "translateY(2%)",
                    filter: "drop-shadow(0 4px 10px rgba(20,16,28,0.2))",
                }}
                aria-hidden="true"
            >
                {preset.emoji}
            </span>
        </div>
    );
}
