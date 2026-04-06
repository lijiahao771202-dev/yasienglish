"use client";

import { AVATAR_PRESETS, AVATAR_PRESET_MAP } from "@/lib/avatar-presets";
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
    const preset = AVATAR_PRESET_MAP[presetId || ""] ?? AVATAR_PRESET_MAP[DEFAULT_AVATAR_PRESET] ?? AVATAR_PRESETS[0];

    return (
        <div
            className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border-[3px] border-[#111827] shadow-[0_4px_0_0_#111827] ${className}`}
            style={{
                width: size,
                height: size,
                background: preset.bg,
            }}
        >
            <span
                className="relative z-10 select-none leading-none drop-shadow-sm"
                style={{
                    fontSize: size * 0.55,
                }}
                aria-hidden="true"
            >
                {preset.emoji}
            </span>
        </div>
    );
}
