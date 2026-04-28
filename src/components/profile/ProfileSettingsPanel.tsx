"use client";

import { FormEvent, useState } from "react";
import { Mail, ShieldCheck } from "lucide-react";

import { PresetAvatar } from "@/components/profile/PresetAvatar";
import { PretextTextarea } from "@/components/ui/PretextTextarea";
import { AVATAR_PRESETS } from "@/lib/avatar-presets";
import type { LearningPreferences } from "@/lib/profile-settings";

interface ProfileSettingsPanelProps {
    email: string;
    initialProfile: {
        username: string;
        avatar_preset: string;
        bio: string;
        learning_preferences: LearningPreferences;
    };
    onSave: (payload: {
        username: string;
        avatar_preset: string;
        bio: string;
        learning_preferences: LearningPreferences;
    }) => Promise<void>;
    onChangePassword: (password: string) => Promise<void>;
}

export function ProfileSettingsPanel({
    email,
    initialProfile,
    onSave,
    onChangePassword,
}: ProfileSettingsPanelProps) {
    const [username, setUsername] = useState(initialProfile.username);
    const [avatarPreset, setAvatarPreset] = useState(initialProfile.avatar_preset);
    const [bio, setBio] = useState(initialProfile.bio);
    const [targetMode, setTargetMode] = useState(initialProfile.learning_preferences.target_mode);
    const [englishLevel, setEnglishLevel] = useState(initialProfile.learning_preferences.english_level);
    const [dailyGoal, setDailyGoal] = useState(String(initialProfile.learning_preferences.daily_goal_minutes));
    const [uiTheme, setUiTheme] = useState(initialProfile.learning_preferences.ui_theme_preference);
    const [rebuildShadowingAutoOpen, setRebuildShadowingAutoOpen] = useState(
        initialProfile.learning_preferences.rebuild_auto_open_shadowing_prompt ?? true,
    );
    const [profileBusy, setProfileBusy] = useState(false);
    const [profileMessage, setProfileMessage] = useState<string | null>(null);
    const [passwordBusy, setPasswordBusy] = useState(false);
    const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    const handleSave = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setProfileBusy(true);
        setProfileMessage(null);

        try {
            await onSave({
                username,
                avatar_preset: avatarPreset,
                bio,
                learning_preferences: {
                    ...initialProfile.learning_preferences,
                    target_mode: targetMode,
                    english_level: englishLevel,
                    daily_goal_minutes: Number(dailyGoal),
                    ui_theme_preference: uiTheme,
                    rebuild_auto_open_shadowing_prompt: rebuildShadowingAutoOpen,
                },
            });
            setProfileMessage("资料已保存到本地镜像，并正在同步云端。");
        } catch (error) {
            setProfileMessage(error instanceof Error ? error.message : "保存失败，请重试。");
        } finally {
            setProfileBusy(false);
        }
    };

    const handlePasswordChange = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setPasswordBusy(true);
        setPasswordMessage(null);

        if (password !== confirmPassword) {
            setPasswordBusy(false);
            setPasswordMessage("两次输入的密码不一致。");
            return;
        }

        try {
            await onChangePassword(password);
            setPassword("");
            setConfirmPassword("");
            setPasswordMessage("密码已经更新。");
        } catch (error) {
            setPasswordMessage(error instanceof Error ? error.message : "密码更新失败，请重试。");
        } finally {
            setPasswordBusy(false);
        }
    };

    return (
        <div className="space-y-8">
            <form data-form="profile" onSubmit={handleSave} className="space-y-8">
                <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                    <div className="rounded-[2rem] border-4 border-theme-border bg-theme-base-bg p-6 shadow-[0_6px_0_0_var(--theme-shadow)]">
                        <div className="space-y-5">
                            <div className="space-y-2">
                                <div className="inline-flex items-center gap-2 rounded-full border-4 border-theme-border bg-theme-card-bg px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.25em] text-theme-text-muted shadow-[0_2px_0_0_var(--theme-shadow)]">
                                    <Mail className="h-3.5 w-3.5" />
                                    Account
                                </div>
                                <h2 className="font-welcome-display text-3xl tracking-[-0.04em] text-theme-text">
                                    基础资料
                                </h2>
                                <p className="text-sm font-bold leading-6 text-theme-text-muted">
                                    这里只负责你的个人资料和学习偏好。AI 模型统一在头像菜单里的 AI 模型配置管理。
                                </p>
                            </div>

                            <label className="block space-y-2">
                                <span className="text-xs font-black uppercase tracking-[0.25em] text-theme-text-muted">邮箱</span>
                                <div className="rounded-[1.25rem] border-4 border-theme-border bg-theme-card-bg px-4 py-3 text-sm font-black text-theme-text shadow-[0_3px_0_0_var(--theme-shadow)]">
                                    {email}
                                </div>
                            </label>

                            <label className="block space-y-2">
                                <span className="text-xs font-black uppercase tracking-[0.25em] text-theme-text-muted">用户名</span>
                                <input
                                    id="username"
                                    value={username}
                                    onChange={(event) => setUsername(event.target.value)}
                                    placeholder="给自己起个顺口的名字"
                                    className="w-full rounded-[1.25rem] border-4 border-theme-border bg-theme-card-bg px-4 py-3 text-sm font-black text-theme-text shadow-[0_3px_0_0_var(--theme-shadow)] outline-none transition focus:bg-theme-base-bg"
                                />
                            </label>

                            <label className="block space-y-2">
                                <span className="text-xs font-black uppercase tracking-[0.25em] text-theme-text-muted">简介</span>
                                <PretextTextarea
                                    id="bio"
                                    value={bio}
                                    onChange={(event) => setBio(event.target.value)}
                                    placeholder="写一句会让未来的你看了也想继续学英语的话。"
                                    minRows={4}
                                    className="min-h-[136px] w-full rounded-[1.25rem] border-4 border-theme-border bg-theme-card-bg px-4 py-3 text-sm font-bold leading-6 text-theme-text shadow-[0_3px_0_0_var(--theme-shadow)] outline-none transition placeholder:text-theme-text-muted/60 focus:bg-theme-base-bg"
                                />
                            </label>
                        </div>
                    </div>

                    <div className="rounded-[2rem] border-4 border-theme-border bg-theme-base-bg p-6 shadow-[0_6px_0_0_var(--theme-shadow)]">
                        <div className="space-y-5">
                            <div className="space-y-2">
                                <h2 className="font-welcome-display text-3xl tracking-[-0.04em] text-theme-text">
                                    头像搭配
                                </h2>
                                <p className="text-sm font-bold leading-6 text-theme-text-muted">
                                    选一个你一眼就认得出来的小形象。
                                </p>
                            </div>

                            <div className="flex items-center gap-4 rounded-[1.5rem] border-4 border-theme-border bg-theme-card-bg p-4 shadow-[0_3px_0_0_var(--theme-shadow)]">
                                <PresetAvatar presetId={avatarPreset} size={72} />
                                <div className="min-w-0">
                                    <div className="text-xs font-black uppercase tracking-[0.25em] text-theme-text-muted">
                                        Current
                                    </div>
                                    <div className="mt-1 text-lg font-black text-theme-text">
                                        {AVATAR_PRESETS.find((preset) => preset.id === avatarPreset)?.name ?? "Custom"}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-4 gap-3 sm:grid-cols-4">
                                {AVATAR_PRESETS.map((preset) => {
                                    const active = avatarPreset === preset.id;
                                    return (
                                        <button
                                            key={preset.id}
                                            type="button"
                                            data-avatar-id={preset.id}
                                            onClick={() => setAvatarPreset(preset.id)}
                                            className={`flex flex-col items-center gap-2 rounded-[1.25rem] border-4 px-2 py-3 text-center shadow-[0_3px_0_0_var(--theme-shadow)] transition ${
                                                active
                                                    ? "border-theme-border bg-theme-primary-bg text-theme-primary-text"
                                                    : "border-theme-border bg-theme-card-bg text-theme-text hover:bg-theme-base-bg"
                                            }`}
                                        >
                                            <PresetAvatar presetId={preset.id} size={48} className="shadow-none" />
                                            <span className="text-[11px] font-black leading-4">{preset.name}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </section>

                <section className="rounded-[2rem] border-4 border-theme-border bg-theme-base-bg p-6 shadow-[0_6px_0_0_var(--theme-shadow)]">
                    <div className="space-y-5">
                        <div className="space-y-2">
                            <h2 className="font-welcome-display text-3xl tracking-[-0.04em] text-theme-text">
                                学习偏好
                            </h2>
                            <p className="text-sm font-bold leading-6 text-theme-text-muted">
                                这些设置会决定默认训练氛围和提示方式。
                            </p>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <label className="block space-y-2">
                                <span className="text-xs font-black uppercase tracking-[0.25em] text-theme-text-muted">主模式</span>
                                <select
                                    id="target-mode"
                                    value={targetMode}
                                    onChange={(event) => setTargetMode(event.target.value as LearningPreferences["target_mode"])}
                                    className="w-full rounded-[1.25rem] border-4 border-theme-border bg-theme-card-bg px-4 py-3 text-sm font-black text-theme-text shadow-[0_3px_0_0_var(--theme-shadow)] outline-none"
                                >
                                    <option value="read">Read</option>
                                    <option value="battle">Battle</option>
                                    <option value="vocab">Vocab</option>
                                </select>
                            </label>

                            <label className="block space-y-2">
                                <span className="text-xs font-black uppercase tracking-[0.25em] text-theme-text-muted">英语等级</span>
                                <select
                                    id="english-level"
                                    value={englishLevel}
                                    onChange={(event) => setEnglishLevel(event.target.value as LearningPreferences["english_level"])}
                                    className="w-full rounded-[1.25rem] border-4 border-theme-border bg-theme-card-bg px-4 py-3 text-sm font-black text-theme-text shadow-[0_3px_0_0_var(--theme-shadow)] outline-none"
                                >
                                    <option value="A1">A1</option>
                                    <option value="A2">A2</option>
                                    <option value="B1">B1</option>
                                    <option value="B2">B2</option>
                                    <option value="C1">C1</option>
                                    <option value="C2">C2</option>
                                </select>
                            </label>

                            <label className="block space-y-2">
                                <span className="text-xs font-black uppercase tracking-[0.25em] text-theme-text-muted">每日目标</span>
                                <input
                                    id="daily-goal"
                                    type="number"
                                    min={5}
                                    step={5}
                                    value={dailyGoal}
                                    onChange={(event) => setDailyGoal(event.target.value)}
                                    className="w-full rounded-[1.25rem] border-4 border-theme-border bg-theme-card-bg px-4 py-3 text-sm font-black text-theme-text shadow-[0_3px_0_0_var(--theme-shadow)] outline-none"
                                />
                            </label>

                            <label className="block space-y-2">
                                <span className="text-xs font-black uppercase tracking-[0.25em] text-theme-text-muted">界面主题</span>
                                <select
                                    id="ui-theme"
                                    value={uiTheme}
                                    onChange={(event) => setUiTheme(event.target.value as LearningPreferences["ui_theme_preference"])}
                                    className="w-full rounded-[1.25rem] border-4 border-theme-border bg-theme-card-bg px-4 py-3 text-sm font-black text-theme-text shadow-[0_3px_0_0_var(--theme-shadow)] outline-none"
                                >
                                    <option value="bubblegum_pop">Bubblegum Pop</option>
                                    <option value="starlight_arcade">Starlight Arcade</option>
                                    <option value="peach_glow">Peach Glow</option>
                                </select>
                            </label>
                        </div>

                        <label className="flex items-center justify-between gap-4 rounded-[1.5rem] border-4 border-theme-border bg-theme-card-bg px-4 py-4 shadow-[0_3px_0_0_var(--theme-shadow)]">
                            <div>
                                <div className="text-sm font-black text-theme-text">完成后自动弹出 shadowing 提示</div>
                                <div className="mt-1 text-xs font-bold leading-5 text-theme-text-muted">
                                    保持训练节奏，不用每次再手动点开。
                                </div>
                            </div>
                            <input
                                id="rebuild-shadowing-auto-open"
                                type="checkbox"
                                checked={rebuildShadowingAutoOpen}
                                onChange={(event) => setRebuildShadowingAutoOpen(event.target.checked)}
                                className="h-5 w-5 shrink-0 accent-theme-primary-bg"
                            />
                        </label>
                    </div>
                </section>

                <div className="flex flex-wrap items-center gap-3">
                    <button
                        type="submit"
                        disabled={profileBusy}
                        className="rounded-[1.25rem] border-4 border-theme-border bg-theme-primary-bg px-5 py-3 text-sm font-black text-theme-primary-text shadow-[0_4px_0_0_var(--theme-shadow)] transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-70"
                    >
                        {profileBusy ? "保存中..." : "保存资料"}
                    </button>
                    {profileMessage ? (
                        <p className="text-sm font-black text-theme-text-muted">{profileMessage}</p>
                    ) : null}
                </div>
            </form>

            <form
                data-form="password"
                onSubmit={handlePasswordChange}
                className="rounded-[2rem] border-4 border-theme-border bg-theme-base-bg p-6 shadow-[0_6px_0_0_var(--theme-shadow)]"
            >
                <div className="space-y-5">
                    <div className="space-y-2">
                        <div className="inline-flex items-center gap-2 rounded-full border-4 border-theme-border bg-theme-card-bg px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.25em] text-theme-text-muted shadow-[0_2px_0_0_var(--theme-shadow)]">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Security
                        </div>
                        <h2 className="font-welcome-display text-3xl tracking-[-0.04em] text-theme-text">
                            修改密码
                        </h2>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <label className="block space-y-2">
                            <span className="text-xs font-black uppercase tracking-[0.25em] text-theme-text-muted">新密码</span>
                            <input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                className="w-full rounded-[1.25rem] border-4 border-theme-border bg-theme-card-bg px-4 py-3 text-sm font-black text-theme-text shadow-[0_3px_0_0_var(--theme-shadow)] outline-none"
                            />
                        </label>

                        <label className="block space-y-2">
                            <span className="text-xs font-black uppercase tracking-[0.25em] text-theme-text-muted">确认密码</span>
                            <input
                                id="confirm-password"
                                type="password"
                                value={confirmPassword}
                                onChange={(event) => setConfirmPassword(event.target.value)}
                                className="w-full rounded-[1.25rem] border-4 border-theme-border bg-theme-card-bg px-4 py-3 text-sm font-black text-theme-text shadow-[0_3px_0_0_var(--theme-shadow)] outline-none"
                            />
                        </label>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            type="submit"
                            disabled={passwordBusy}
                            className="rounded-[1.25rem] border-4 border-theme-border bg-theme-card-bg px-5 py-3 text-sm font-black text-theme-text shadow-[0_4px_0_0_var(--theme-shadow)] transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-70"
                        >
                            {passwordBusy ? "更新中..." : "更新密码"}
                        </button>
                        {passwordMessage ? (
                            <p className="text-sm font-black text-theme-text-muted">{passwordMessage}</p>
                        ) : null}
                    </div>
                </div>
            </form>
        </div>
    );
}
