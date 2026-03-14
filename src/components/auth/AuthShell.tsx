import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

interface AuthShellProps {
    badge: string;
    title: string;
    description: string;
    alert?: string | null;
    footerLabel: string;
    footerCta: string;
    footerHref: string;
    secondaryHref?: string;
    secondaryLabel?: string;
    secondaryText?: string;
    children: ReactNode;
}

function BrandMark() {
    return (
        <div className="relative h-11 w-12 shrink-0">
            <span className="absolute left-1 top-1 h-4 w-7 rounded-[0.85rem] bg-[#f6d4ff] shadow-[0_10px_14px_-10px_rgba(168,85,247,0.82)]" />
            <span className="absolute left-0 top-3 h-4 w-7 rounded-[0.85rem] bg-[#bdeeff] shadow-[0_10px_14px_-10px_rgba(56,189,248,0.82)]" />
            <span className="absolute left-1.5 top-5 h-4 w-7 rounded-[0.85rem] bg-[#d9deff] shadow-[0_12px_18px_-12px_rgba(99,102,241,0.82)]" />
            <span className="absolute inset-x-2 bottom-0 h-1 rounded-full bg-black/10 blur-[2px]" />
        </div>
    );
}

function SceneWindow({
    className,
    toneClassName,
}: {
    className: string;
    toneClassName: string;
}) {
    return (
        <div className={`absolute rounded-[2.7rem] border-[5px] border-[#6d5ce8] bg-white/92 p-5 shadow-[0_38px_68px_-34px_rgba(72,56,191,0.82)] ${className}`}>
            <div className="flex gap-2">
                <span className="h-3 w-3 rounded-full bg-[#ffb6b0]" />
                <span className="h-3 w-3 rounded-full bg-[#ffd66d]" />
                <span className="h-3 w-3 rounded-full bg-[#bef7a8]" />
            </div>
            <div className={`mt-8 h-[calc(100%-3rem)] rounded-[2.1rem] ${toneClassName}`} />
        </div>
    );
}

function AuthArtwork() {
    return (
        <section className="relative min-h-[350px] overflow-hidden rounded-[2rem] lg:min-h-[780px]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(255,255,255,0.44),transparent_18%),radial-gradient(circle_at_92%_10%,rgba(130,100,255,0.24),transparent_18%),radial-gradient(circle_at_78%_75%,rgba(255,255,255,0.28),transparent_28%)]" />

            <div className="absolute inset-x-[10%] bottom-[5%] h-[38%] rounded-[3.3rem] bg-[linear-gradient(180deg,#8571ff_0%,#735bf0_52%,#886ff5_100%)] shadow-[0_55px_80px_-28px_rgba(96,72,214,0.9)] lg:inset-x-[12%] lg:h-[40%]">
                <div className="absolute inset-0 rounded-[3.3rem] bg-[radial-gradient(circle_at_22%_12%,rgba(255,255,255,0.22),transparent_20%),radial-gradient(circle_at_64%_84%,rgba(254,240,138,0.12),transparent_20%)]" />
            </div>

            <SceneWindow
                className="left-[42%] top-[12%] h-[200px] w-[150px] rotate-[-6deg] lg:left-[40%] lg:top-[14%] lg:h-[320px] lg:w-[230px]"
                toneClassName="bg-[radial-gradient(circle_at_center,rgba(255,244,240,0.92),rgba(245,241,255,0.88))]"
            />
            <SceneWindow
                className="right-[4%] top-[18%] h-[210px] w-[158px] rotate-[8deg] lg:right-[7%] lg:top-[16%] lg:h-[330px] lg:w-[250px]"
                toneClassName="bg-[radial-gradient(circle_at_center,rgba(255,246,237,0.96),rgba(247,241,255,0.92))]"
            />

            <div className="absolute left-[30%] top-[46%] h-7 w-7 rotate-12 rounded-[0.7rem] bg-[#ee8a3d] shadow-[0_20px_24px_-18px_rgba(234,88,12,0.92)] motion-safe:animate-[float_6s_ease-in-out_infinite] lg:left-[31%] lg:top-[60%] lg:h-11 lg:w-11" />
            <div className="absolute left-[37%] top-[64%] h-5 w-5 rotate-[-18deg] rounded-[0.55rem] bg-white/90 shadow-[0_18px_24px_-18px_rgba(255,255,255,0.95)] motion-safe:animate-[float_7s_ease-in-out_infinite] [animation-delay:1s] lg:left-[40%] lg:top-[78%] lg:h-8 lg:w-8" />
            <div className="absolute right-[18%] top-[26%] h-12 w-12 rounded-full bg-[linear-gradient(180deg,#f7b04d,#f07a24)] shadow-[0_25px_28px_-20px_rgba(249,115,22,0.92)] motion-safe:animate-[float_7s_ease-in-out_infinite] [animation-delay:1.2s] lg:h-20 lg:w-20" />
            <div className="absolute right-[10%] bottom-[8%] h-5 w-5 rounded-full bg-[#fff8ef] shadow-[0_20px_24px_-18px_rgba(255,255,255,0.96)] motion-safe:animate-[float_5.8s_ease-in-out_infinite] [animation-delay:2.2s] lg:h-8 lg:w-8" />

            <div className="absolute bottom-[17%] right-[13%] h-[64px] w-[64px] lg:h-[108px] lg:w-[108px]">
                <div className="absolute inset-x-0 bottom-0 h-[46px] rounded-full bg-[#fef1de]" />
                <div className="absolute inset-x-[10px] bottom-[14px] h-[34px] rounded-full bg-[#d996c3] shadow-[0_18px_26px_-18px_rgba(217,150,195,0.92)] lg:inset-x-[16px] lg:bottom-[24px] lg:h-[54px]" />
                <div className="absolute left-1/2 top-0 h-4 w-4 -translate-x-1/2 rounded-full bg-[#ff9d2f] shadow-[0_12px_18px_-10px_rgba(255,159,64,0.95)] lg:h-6 lg:w-6" />
            </div>

            <div className="absolute bottom-[17%] right-[3%] h-[48px] w-[78px] rounded-[1.1rem] bg-[#ffd79b] shadow-[0_28px_34px_-22px_rgba(251,146,60,0.82)] lg:h-[78px] lg:w-[138px] lg:rounded-[1.7rem]">
                <div className="absolute left-[18px] top-[-8px] h-4 w-4 rounded-full bg-[#f7b13d] lg:left-[28px] lg:h-6 lg:w-6" />
                <div className="absolute right-[12px] top-[14px] h-5 w-5 rounded-[0.45rem] bg-[#fff9f5] lg:right-[18px] lg:top-[22px] lg:h-8 lg:w-8" />
            </div>

            <div className="absolute left-[42%] top-[30%] h-[130px] w-[86px] rounded-[44%_56%_40%_60%/58%_42%_58%_42%] bg-[linear-gradient(180deg,#ffe065,#f6b92e_66%,#ed9d1f)] shadow-[0_42px_50px_-28px_rgba(234,179,8,0.92)] motion-safe:animate-[float_7.6s_ease-in-out_infinite] lg:left-[36%] lg:top-[28%] lg:h-[270px] lg:w-[160px]">
                <div className="absolute left-[18px] top-[-8px] h-3 w-3 rotate-[-18deg] rounded-[0.35rem] bg-[#e8b41d] lg:left-[36px] lg:top-[-12px] lg:h-5 lg:w-5" />
                <div className="absolute right-[14px] top-[-6px] h-3 w-3 rotate-[16deg] rounded-[0.35rem] bg-[#e8b41d] lg:right-[26px] lg:top-[-10px] lg:h-5 lg:w-5" />
                <div className="absolute left-[-10px] top-[36px] h-9 w-9 rounded-full bg-white shadow-[0_14px_18px_-12px_rgba(255,255,255,0.96)] lg:left-[-12px] lg:top-[78px] lg:h-16 lg:w-16">
                    <div className="absolute left-[14px] top-[16px] h-3 w-3 rounded-full bg-[#2e243c] lg:left-[25px] lg:top-[28px] lg:h-5 lg:w-5" />
                </div>
                <div className="absolute right-[-8px] top-[30px] h-9 w-9 rounded-full bg-white shadow-[0_14px_18px_-12px_rgba(255,255,255,0.96)] lg:right-[-10px] lg:top-[64px] lg:h-16 lg:w-16">
                    <div className="absolute left-[12px] top-[18px] h-3 w-3 rounded-full bg-[#2e243c] lg:left-[22px] lg:top-[30px] lg:h-5 lg:w-5" />
                </div>
            </div>

            <div className="absolute left-[56%] top-[42%] flex h-[112px] w-[78px] items-center justify-center rounded-[46%_54%_42%_58%/26%_26%_44%_44%] bg-[linear-gradient(180deg,#ffffff,#fff7fb)] shadow-[0_36px_46px_-24px_rgba(255,255,255,0.98)] motion-safe:animate-[float_6.4s_ease-in-out_infinite] [animation-delay:1.1s] lg:left-[50%] lg:top-[41%] lg:h-[220px] lg:w-[138px]">
                <div className="absolute left-[20px] top-[36px] h-2.5 w-2.5 rounded-full bg-[#2f2837] lg:left-[38px] lg:top-[70px] lg:h-4 lg:w-4" />
                <div className="absolute right-[20px] top-[36px] h-2.5 w-2.5 rounded-full bg-[#2f2837] lg:right-[38px] lg:top-[70px] lg:h-4 lg:w-4" />
                <div className="absolute top-[64px] h-10 w-[42px] rounded-[1.2rem] bg-white lg:top-[122px] lg:h-[70px] lg:w-[84px]" />
                <div className="absolute top-[84px] h-1.5 w-6 rounded-full bg-[#f1b0bc] lg:top-[164px] lg:h-2.5 lg:w-10" />
            </div>
        </section>
    );
}

export function AuthShell({
    badge,
    title,
    description,
    alert,
    footerLabel,
    footerCta,
    footerHref,
    secondaryHref,
    secondaryLabel,
    secondaryText,
    children,
}: AuthShellProps) {
    return (
        <main className="min-h-screen overflow-hidden bg-[linear-gradient(180deg,#715bf0_0%,#6854ea_100%)] px-3 py-3 text-slate-900 sm:px-5 sm:py-5">
            <div className="mx-auto max-w-[1700px] rounded-[2.8rem] bg-[linear-gradient(180deg,#f4ccdb_0%,#efc2d5_100%)] p-2 shadow-[0_44px_90px_-40px_rgba(32,15,92,0.88)]">
                <div className="relative overflow-hidden rounded-[2.45rem] border border-white/20 bg-[linear-gradient(180deg,#f3cad8_0%,#efbfd0_100%)]">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_14%,rgba(255,255,255,0.32),transparent_18%),radial-gradient(circle_at_100%_0%,rgba(109,92,232,0.2),transparent_24%),linear-gradient(90deg,transparent_0%,transparent_98%,rgba(102,77,233,0.82)_100%)]" />

                    <div className="relative grid min-h-[calc(100vh-2.5rem)] gap-6 px-4 py-4 sm:px-6 sm:py-6 lg:grid-cols-[420px_minmax(0,1fr)] lg:gap-2 lg:px-10 lg:py-10">
                        <section className="relative z-20 mx-auto flex w-full max-w-[430px] flex-col justify-between overflow-hidden rounded-[2.35rem] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(255,255,255,0.86))] px-6 py-6 shadow-[0_46px_90px_-42px_rgba(99,70,161,0.6)] backdrop-blur-sm sm:px-8 sm:py-8 lg:my-auto lg:min-h-[650px] lg:px-9 lg:py-9">
                            <div className="absolute -right-8 bottom-16 h-44 w-24 rotate-[28deg] rounded-full bg-white/38 blur-2xl" />

                            <div className="relative z-10">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <BrandMark />
                                        <div>
                                            <p className="font-work-sans text-[2.3rem] font-black leading-none tracking-[-0.08em] text-[#18141e]">
                                                yasi.
                                            </p>
                                            <p className="mt-1 text-[0.68rem] font-semibold uppercase tracking-[0.32em] text-[#5f91c6]">
                                                {badge}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="max-w-[88px] text-right text-[0.82rem] leading-4 text-[#4b8fd2]">
                                        <p className="text-[#6d86a6]">{footerLabel}</p>
                                        <Link href={footerHref} className="font-semibold transition hover:text-[#236fc4]">
                                            {footerCta}
                                        </Link>
                                    </div>
                                </div>

                                <h1 className="mt-8 font-work-sans text-[4.15rem] font-black leading-[0.88] tracking-[-0.08em] text-[#17131d] sm:text-[4.9rem]">
                                    {title}
                                </h1>
                                <p className="mt-4 max-w-[18rem] text-[0.95rem] leading-7 text-[#696378]">
                                    {description}
                                </p>

                                <div className="mt-8 rounded-[1.9rem] bg-white/58 p-0">
                                    {alert ? (
                                        <div className="mb-4 rounded-[1.2rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
                                            {alert}
                                        </div>
                                    ) : null}
                                    {children}
                                </div>
                            </div>

                            <div className="relative z-10 mt-8 flex flex-wrap items-center justify-between gap-3 text-sm text-[#6d6a76]">
                                <div className="inline-flex items-center gap-2 rounded-full border border-white/75 bg-white/72 px-3 py-1.5 text-[0.78rem] font-medium shadow-[0_16px_24px_-18px_rgba(99,102,241,0.35)]">
                                    <span className="h-2 w-2 rounded-full bg-[#ff78b5]" />
                                    account + cloud sync
                                </div>
                                {secondaryHref && secondaryLabel && secondaryText ? (
                                    <Link
                                        href={secondaryHref}
                                        className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-white/75 bg-white/72 px-3 py-1.5 text-[0.82rem] font-semibold text-[#4b5063] shadow-[0_14px_24px_-20px_rgba(99,102,241,0.28)] transition hover:text-[#111827]"
                                    >
                                        {secondaryText}
                                        <span className="text-[#327bcb]">{secondaryLabel}</span>
                                        <ChevronRight className="h-4 w-4" />
                                    </Link>
                                ) : null}
                            </div>
                        </section>

                        <AuthArtwork />
                    </div>
                </div>
            </div>
        </main>
    );
}
