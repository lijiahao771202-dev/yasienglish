"use client";

import { FormEvent, useState } from "react";
import { Mail, ShieldCheck, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

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
                    ...initialProfile.learning_preferences,
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
            <form data-form="profile" onSubmit={handleSave} className="space-y-6 rounded-[2rem] border-4 border-[#111827] bg-[#fffaf0] p-6 shadow-[0_8px_0_0_#111827]">
                <div className="space-y-2">
                    <motion.div whileHover={{ scale: 1.05 }} className="inline-flex items-center gap-2 rounded-full border-4 border-[#111827] bg-[#dcfce7] px-4 py-1.5 text-xs font-black uppercase tracking-wider text-[#166534] shadow-[0_4px_0_0_#111827] cursor-default">
                        <Sparkles className="h-4 w-4" />
                        Profile Settings
                    </motion.div>
                    <h2 className="text-3xl font-black tracking-tight text-[#111827]">
                        基本设置偏好
                    </h2>
                    <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
                        管理您的个人资料和学习偏好。头像也会同步更新。
                    </p>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                    <div className="space-y-2 md:col-span-2">
                        <label htmlFor="username" className="text-sm font-black text-slate-700 ml-1">
                            用户名
                        </label>
                        <input
                            id="username"
                            value={username}
                            onChange={(event) => setUsername(event.target.value)}
                            className="block w-full rounded-[1rem] border-4 border-[#111827] bg-white px-4 py-3 font-semibold text-slate-900 shadow-[0_4px_0_0_#111827] outline-none transition-transform focus:-translate-y-1 focus:shadow-[0_6px_0_0_#111827]"
                        />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                        <label htmlFor="bio" className="text-sm font-black text-slate-700 ml-1">
                            个人简介
                        </label>
                        <PretextTextarea
                            id="bio"
                            value={bio}
                            onChange={(event) => setBio(event.target.value)}
                            rows={4}
                            minRows={4}
                            maxRows={10}
                            className="block w-full rounded-[1rem] border-4 border-[#111827] bg-white px-4 py-3 font-semibold text-slate-900 shadow-[0_4px_0_0_#111827] outline-none transition-transform focus:-translate-y-1 focus:shadow-[0_6px_0_0_#111827]"
                        />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                        <label htmlFor="deepseek-api-key" className="text-sm font-black text-slate-700 ml-1">
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
                            className="block w-full rounded-[1rem] border-4 border-[#111827] bg-white px-4 py-3 font-semibold text-slate-900 shadow-[0_4px_0_0_#111827] outline-none transition-transform focus:-translate-y-1 focus:shadow-[0_6px_0_0_#111827]"
                        />
                        <p className="mt-2 text-xs font-bold text-slate-500 ml-1">
                            填你自己的 DeepSeek key 后，AI 讲解和评分会优先走你的额度。留空则继续使用系统默认配置。
                        </p>
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="target-mode" className="text-sm font-black text-slate-700 ml-1">
                            目标模式
                        </label>
                        <select
                            id="target-mode"
                            value={targetMode}
                            onChange={(event) => setTargetMode(event.target.value as LearningPreferences["target_mode"])}
                            className="block w-full rounded-[1rem] border-4 border-[#111827] bg-white px-4 py-3 font-semibold text-slate-900 shadow-[0_4px_0_0_#111827] outline-none transition-transform focus:-translate-y-1 focus:shadow-[0_6px_0_0_#111827]"
                        >
                            <option value="read">阅读</option>
                            <option value="battle">Battle</option>
                            <option value="vocab">词汇</option>
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="english-level" className="text-sm font-black text-slate-700 ml-1">
                            当前水平
                        </label>
                        <select
                            id="english-level"
                            value={englishLevel}
                            onChange={(event) => setEnglishLevel(event.target.value as LearningPreferences["english_level"])}
                            className="block w-full rounded-[1rem] border-4 border-[#111827] bg-white px-4 py-3 font-semibold text-slate-900 shadow-[0_4px_0_0_#111827] outline-none transition-transform focus:-translate-y-1 focus:shadow-[0_6px_0_0_#111827]"
                        >
                            {["A1", "A2", "B1", "B2", "C1", "C2"].map((level) => (
                                <option key={level} value={level}>{level}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="daily-goal" className="text-sm font-black text-slate-700 ml-1">
                            每日目标分钟
                        </label>
                        <input
                            id="daily-goal"
                            type="number"
                            min={10}
                            max={180}
                            value={dailyGoal}
                            onChange={(event) => setDailyGoal(event.target.value)}
                            className="block w-full rounded-[1rem] border-4 border-[#111827] bg-white px-4 py-3 font-semibold text-slate-900 shadow-[0_4px_0_0_#111827] outline-none transition-transform focus:-translate-y-1 focus:shadow-[0_6px_0_0_#111827]"
                        />
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="ui-theme" className="text-sm font-black text-slate-700 ml-1">
                            UI 偏好
                        </label>
                        <select
                            id="ui-theme"
                            value={uiTheme}
                            onChange={(event) => setUiTheme(event.target.value as LearningPreferences["ui_theme_preference"])}
                            className="block w-full rounded-[1rem] border-4 border-[#111827] bg-white px-4 py-3 font-semibold text-slate-900 shadow-[0_4px_0_0_#111827] outline-none transition-transform focus:-translate-y-1 focus:shadow-[0_6px_0_0_#111827]"
                        >
                            <option value="bubblegum_pop">Bubblegum Pop</option>
                            <option value="starlight_arcade">Starlight Arcade</option>
                            <option value="peach_glow">Peach Glow</option>
                        </select>
                    </div>
                </div>

                <div className="space-y-3">
                    <p className="text-sm font-black text-slate-700 ml-1">专属卡通头套</p>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6 rounded-[1.5rem] border-4 border-[#111827] p-3 bg-white">
                        {AVATAR_PRESETS.map((preset) => {
                            const selected = avatarPreset === preset.id;
                            return (
                                <motion.button
                                    whileTap={{ scale: 0.85 }}
                                    whileHover={{ scale: 1.05, y: -2 }}
                                    key={preset.id}
                                    type="button"
                                    data-avatar-id={preset.id}
                                    onClick={() => setAvatarPreset(preset.id)}
                                    className={`relative flex flex-col items-center gap-3 rounded-[1rem] p-3 text-[11px] font-black transition-colors ${
                                        selected 
                                            ? "bg-[#fef08a] border-top-4 border-[#111827]" 
                                            : "hover:bg-slate-50 border-transparent"
                                    }`}
                                >
                                    {selected && (
                                        <div className="absolute inset-0 rounded-[1rem] border-4 border-[#111827] shadow-[0_4px_0_0_#111827] pointer-events-none" />
                                    )}
                                    <PresetAvatar presetId={preset.id} size={54} />
                                    <span className={selected ? "text-[#92400e]" : "text-slate-600"}>{preset.name}</span>
                                </motion.button>
                            );
                        })}
                    </div>
                </div>

                <motion.button
                    whileTap={{ scale: 0.95 }}
                    whileHover={{ y: -2 }}
                    type="submit"
                    disabled={profileBusy}
                    className="flex h-14 w-full cursor-pointer items-center justify-center rounded-[1.4rem] border-4 border-[#111827] bg-[#fde68a] text-[15px] font-black text-[#92400e] shadow-[0_6px_0_0_#111827] transition-all hover:bg-[#fef08a] hover:shadow-[0_8px_0_0_#111827] disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {profileBusy ? "Saving..." : "保存资料"}
                </motion.button>
                {profileMessage ? (
                    <p className={`text-sm font-bold ${profileMessage.includes("失败") ? "text-[#ef4444]" : "text-[#10b981]"}`}>
                        {profileMessage}
                    </p>
                ) : null}
            </form>

            <div className="space-y-6">
                <div className="rounded-[2rem] border-4 border-[#111827] bg-[#fffaf0] p-6 shadow-[0_8px_0_0_#111827]">
                    <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 text-center sm:text-left">
                        <PresetAvatar presetId={avatarPreset} size={80} />
                        <div className="mt-2 sm:mt-0">
                            <p className="font-welcome-display text-4xl text-[#111827]">{username}</p>
                            <p className="text-sm font-bold text-slate-500 mt-1.5">{email}</p>
                        </div>
                    </div>
                    <div className="mt-6 rounded-[1.2rem] border-4 border-[#111827] bg-[#dcfce7] px-5 py-4 text-sm font-bold text-[#166534] shadow-[0_4px_0_0_#111827]">
                        <div className="flex items-center justify-center sm:justify-start gap-2 text-[#166534]">
                            <Mail className="h-5 w-5" />
                            登录邮箱
                        </div>
                        <p className="mt-2 text-base break-all text-center sm:text-left">{email}</p>
                    </div>
                </div>

                <form data-form="password" onSubmit={handlePasswordChange} className="space-y-5 rounded-[2rem] border-4 border-[#111827] bg-[#fffaf0] p-6 shadow-[0_8px_0_0_#111827]">
                    <div>
                        <motion.div whileHover={{ scale: 1.05 }} className="inline-flex items-center gap-2 rounded-full border-4 border-[#111827] bg-[#fde68a] px-4 py-1.5 text-xs font-black uppercase tracking-wider text-[#92400e] shadow-[0_4px_0_0_#111827] cursor-default">
                            <ShieldCheck className="h-4 w-4" />
                            Security Password
                        </motion.div>
                        <h3 className="mt-4 text-xl font-black text-[#111827]">修改密码</h3>
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="password" className="text-sm font-black text-slate-700 ml-1">
                            新密码
                        </label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            className="block w-full rounded-[1rem] border-4 border-[#111827] bg-white px-4 py-3 font-semibold text-slate-900 shadow-[0_4px_0_0_#111827] outline-none transition-transform focus:-translate-y-1 focus:shadow-[0_6px_0_0_#111827]"
                        />
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="confirm-password" className="text-sm font-black text-slate-700 ml-1">
                            确认新密码
                        </label>
                        <input
                            id="confirm-password"
                            type="password"
                            value={confirmPassword}
                            onChange={(event) => setConfirmPassword(event.target.value)}
                            className="block w-full rounded-[1rem] border-4 border-[#111827] bg-white px-4 py-3 font-semibold text-slate-900 shadow-[0_4px_0_0_#111827] outline-none transition-transform focus:-translate-y-1 focus:shadow-[0_6px_0_0_#111827]"
                        />
                    </div>
                    <motion.button
                        whileTap={{ scale: 0.95 }}
                        whileHover={{ y: -2 }}
                        type="submit"
                        disabled={passwordBusy}
                        className="mt-3 flex h-14 w-full cursor-pointer items-center justify-center rounded-[1.4rem] border-4 border-[#111827] bg-[#fde68a] text-[15px] font-black text-[#92400e] shadow-[0_6px_0_0_#111827] transition-all hover:bg-[#fef08a] hover:shadow-[0_8px_0_0_#111827] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {passwordBusy ? "Updating..." : "更新密码"}
                    </motion.button>
                    {passwordMessage ? (
                        <p className={`text-sm font-bold ${passwordMessage.includes("失败") || passwordMessage.includes("不一致") ? "text-[#ef4444]" : "text-[#10b981]"}`}>
                            {passwordMessage}
                        </p>
                    ) : null}
                </form>
            </div>
        </div>
    );
}
