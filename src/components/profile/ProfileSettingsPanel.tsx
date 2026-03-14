"use client";

import { FormEvent, useState } from "react";
import { Mail, ShieldCheck, Sparkles } from "lucide-react";

import { PresetAvatar } from "@/components/profile/PresetAvatar";
import { AVATAR_PRESETS } from "@/lib/avatar-presets";
import type { LearningPreferences } from "@/lib/profile-settings";

interface ProfileSettingsPanelProps {
    email: string;
    initialProfile: {
        username: string;
        avatar_preset: string;
        bio: string;
        deepseek_api_key: string;
        learning_preferences: LearningPreferences;
    };
    onSave: (payload: {
        username: string;
        avatar_preset: string;
        bio: string;
        deepseek_api_key: string;
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
    const [deepSeekApiKey, setDeepSeekApiKey] = useState(initialProfile.deepseek_api_key);
    const [targetMode, setTargetMode] = useState(initialProfile.learning_preferences.target_mode);
    const [englishLevel, setEnglishLevel] = useState(initialProfile.learning_preferences.english_level);
    const [dailyGoal, setDailyGoal] = useState(String(initialProfile.learning_preferences.daily_goal_minutes));
    const [uiTheme, setUiTheme] = useState(initialProfile.learning_preferences.ui_theme_preference);
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [profileMessage, setProfileMessage] = useState<string | null>(null);
    const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
    const [profileBusy, setProfileBusy] = useState(false);
    const [passwordBusy, setPasswordBusy] = useState(false);

    const handleSave = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setProfileBusy(true);
        setProfileMessage(null);

        try {
            await onSave({
                username,
                avatar_preset: avatarPreset,
                bio,
                deepseek_api_key: deepSeekApiKey,
                learning_preferences: {
                    target_mode: targetMode,
                    english_level: englishLevel,
                    daily_goal_minutes: Number(dailyGoal),
                    ui_theme_preference: uiTheme,
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
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_360px]">
            <form data-form="profile" onSubmit={handleSave} className="space-y-6 rounded-[2rem] border border-white/60 bg-white/80 p-6 shadow-[0_34px_80px_-44px_rgba(79,70,229,0.8)] backdrop-blur-xl">
                <div className="space-y-2">
                    <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-indigo-700">
                        <Sparkles className="h-3.5 w-3.5" />
                        Profile
                    </div>
                    <h2 className="font-comic text-4xl font-bold tracking-[-0.04em] text-slate-900">
                        把你的学习角色捏完整。
                    </h2>
                    <p className="text-sm leading-6 text-slate-600">
                        用户名可以重复。这里的资料会写入本地镜像，再同步到 Supabase，右上角头像菜单也会立即跟着更新。
                    </p>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                    <div className="space-y-2 md:col-span-2">
                        <label htmlFor="username" className="text-sm font-medium text-slate-700">
                            用户名
                        </label>
                        <input
                            id="username"
                            value={username}
                            onChange={(event) => setUsername(event.target.value)}
                            className="h-12 w-full rounded-[1.2rem] border border-indigo-100 bg-white px-4 text-sm text-slate-900 shadow-[0_20px_25px_-22px_rgba(99,102,241,0.95)] outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                        />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                        <label htmlFor="bio" className="text-sm font-medium text-slate-700">
                            个人简介
                        </label>
                        <textarea
                            id="bio"
                            value={bio}
                            onChange={(event) => setBio(event.target.value)}
                            rows={4}
                            className="w-full rounded-[1.2rem] border border-indigo-100 bg-white px-4 py-3 text-sm text-slate-900 shadow-[0_20px_25px_-22px_rgba(99,102,241,0.95)] outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                        />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                        <label htmlFor="deepseek-api-key" className="text-sm font-medium text-slate-700">
                            DeepSeek API Key
                        </label>
                        <input
                            id="deepseek-api-key"
                            type="password"
                            autoComplete="off"
                            spellCheck={false}
                            value={deepSeekApiKey}
                            onChange={(event) => setDeepSeekApiKey(event.target.value)}
                            placeholder="sk-..."
                            className="h-12 w-full rounded-[1.2rem] border border-indigo-100 bg-white px-4 text-sm text-slate-900 shadow-[0_20px_25px_-22px_rgba(99,102,241,0.95)] outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                        />
                        <p className="text-xs leading-5 text-slate-500">
                            填你自己的 DeepSeek key 后，AI 讲解和评分会优先走你的额度。留空则继续使用系统默认配置。
                        </p>
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="target-mode" className="text-sm font-medium text-slate-700">
                            目标模式
                        </label>
                        <select
                            id="target-mode"
                            value={targetMode}
                            onChange={(event) => setTargetMode(event.target.value as LearningPreferences["target_mode"])}
                            className="h-12 w-full rounded-[1.2rem] border border-indigo-100 bg-white px-4 text-sm text-slate-900 shadow-[0_20px_25px_-22px_rgba(99,102,241,0.95)] outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                        >
                            <option value="read">阅读</option>
                            <option value="battle">Battle</option>
                            <option value="vocab">词汇</option>
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="english-level" className="text-sm font-medium text-slate-700">
                            当前水平
                        </label>
                        <select
                            id="english-level"
                            value={englishLevel}
                            onChange={(event) => setEnglishLevel(event.target.value as LearningPreferences["english_level"])}
                            className="h-12 w-full rounded-[1.2rem] border border-indigo-100 bg-white px-4 text-sm text-slate-900 shadow-[0_20px_25px_-22px_rgba(99,102,241,0.95)] outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                        >
                            {["A1", "A2", "B1", "B2", "C1", "C2"].map((level) => (
                                <option key={level} value={level}>{level}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="daily-goal" className="text-sm font-medium text-slate-700">
                            每日目标分钟
                        </label>
                        <input
                            id="daily-goal"
                            type="number"
                            min={10}
                            max={180}
                            value={dailyGoal}
                            onChange={(event) => setDailyGoal(event.target.value)}
                            className="h-12 w-full rounded-[1.2rem] border border-indigo-100 bg-white px-4 text-sm text-slate-900 shadow-[0_20px_25px_-22px_rgba(99,102,241,0.95)] outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                        />
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="ui-theme" className="text-sm font-medium text-slate-700">
                            UI 偏好
                        </label>
                        <select
                            id="ui-theme"
                            value={uiTheme}
                            onChange={(event) => setUiTheme(event.target.value as LearningPreferences["ui_theme_preference"])}
                            className="h-12 w-full rounded-[1.2rem] border border-indigo-100 bg-white px-4 text-sm text-slate-900 shadow-[0_20px_25px_-22px_rgba(99,102,241,0.95)] outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                        >
                            <option value="bubblegum_pop">Bubblegum Pop</option>
                            <option value="starlight_arcade">Starlight Arcade</option>
                            <option value="peach_glow">Peach Glow</option>
                        </select>
                    </div>
                </div>

                <div className="space-y-3">
                    <p className="text-sm font-medium text-slate-700">预设头像</p>
                    <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                        {AVATAR_PRESETS.map((preset) => {
                            const selected = avatarPreset === preset.id;
                            return (
                                <button
                                    key={preset.id}
                                    type="button"
                                    data-avatar-id={preset.id}
                                    onClick={() => setAvatarPreset(preset.id)}
                                    className={`flex min-h-[44px] cursor-pointer flex-col items-center gap-2 rounded-[1.4rem] border p-3 text-xs font-medium transition ${selected ? "border-indigo-300 bg-indigo-50 text-indigo-800" : "border-slate-200 bg-white text-slate-600 hover:border-indigo-200"}`}
                                >
                                    <PresetAvatar presetId={preset.id} size={58} />
                                    <span>{preset.name}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={profileBusy}
                    className="inline-flex h-12 w-full cursor-pointer items-center justify-center rounded-[1.3rem] bg-[linear-gradient(135deg,#4f46e5,#db2777)] text-sm font-semibold text-white shadow-[0_24px_38px_-22px_rgba(99,102,241,1)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {profileBusy ? "Saving..." : "保存资料"}
                </button>
                {profileMessage ? (
                    <p className={`text-sm ${profileMessage.includes("失败") ? "text-rose-600" : "text-emerald-600"}`}>
                        {profileMessage}
                    </p>
                ) : null}
            </form>

            <div className="space-y-6">
                <div className="rounded-[2rem] border border-white/60 bg-white/80 p-6 shadow-[0_34px_80px_-44px_rgba(79,70,229,0.8)] backdrop-blur-xl">
                    <div className="flex items-center gap-3">
                        <PresetAvatar presetId={avatarPreset} size={72} />
                        <div>
                            <p className="text-lg font-semibold text-slate-900">{username}</p>
                            <p className="text-sm text-slate-500">{email}</p>
                        </div>
                    </div>
                    <div className="mt-4 rounded-[1.2rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        <div className="flex items-center gap-2 font-medium text-slate-800">
                            <Mail className="h-4 w-4" />
                            登录邮箱
                        </div>
                        <p className="mt-1 break-all">{email}</p>
                    </div>
                </div>

                <form data-form="password" onSubmit={handlePasswordChange} className="space-y-4 rounded-[2rem] border border-white/60 bg-white/80 p-6 shadow-[0_34px_80px_-44px_rgba(79,70,229,0.8)] backdrop-blur-xl">
                    <div>
                        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Security
                        </div>
                        <h3 className="mt-3 text-xl font-semibold text-slate-900">修改密码</h3>
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="password" className="text-sm font-medium text-slate-700">
                            新密码
                        </label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            className="h-12 w-full rounded-[1.2rem] border border-indigo-100 bg-white px-4 text-sm text-slate-900 shadow-[0_20px_25px_-22px_rgba(99,102,241,0.95)] outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                        />
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="confirm-password" className="text-sm font-medium text-slate-700">
                            确认新密码
                        </label>
                        <input
                            id="confirm-password"
                            type="password"
                            value={confirmPassword}
                            onChange={(event) => setConfirmPassword(event.target.value)}
                            className="h-12 w-full rounded-[1.2rem] border border-indigo-100 bg-white px-4 text-sm text-slate-900 shadow-[0_20px_25px_-22px_rgba(99,102,241,0.95)] outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={passwordBusy}
                        className="inline-flex h-12 w-full cursor-pointer items-center justify-center rounded-[1.3rem] bg-slate-900 text-sm font-semibold text-white shadow-[0_24px_38px_-22px_rgba(15,23,42,0.9)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {passwordBusy ? "Updating..." : "更新密码"}
                    </button>
                    {passwordMessage ? (
                        <p className={`text-sm ${passwordMessage.includes("失败") || passwordMessage.includes("不一致") ? "text-rose-600" : "text-emerald-600"}`}>
                            {passwordMessage}
                        </p>
                    ) : null}
                </form>
            </div>
        </div>
    );
}
