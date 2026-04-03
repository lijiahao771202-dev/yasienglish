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
        <div className="relative h-14 w-14 shrink-0 rounded-[1.3rem] border-4 border-[#111827] bg-white shadow-[0_6px_0_0_#111827]">
            <span className="absolute left-2 top-2 h-4 w-6 rounded-full border-2 border-[#111827] bg-[#fbcfe8]" />
            <span className="absolute left-3 top-6 h-4 w-7 rounded-full border-2 border-[#111827] bg-[#bfdbfe]" />
            <span className="absolute left-5 top-10 h-2 w-4 rounded-full border-2 border-[#111827] bg-[#fde68a]" />
        </div>
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
        <main className="font-welcome-ui min-h-screen overflow-hidden bg-[#fff8eb] px-4 py-4 sm:px-6 sm:py-6">
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(254,243,199,0.88),transparent_24%),radial-gradient(circle_at_top_right,rgba(191,219,254,0.55),transparent_22%),radial-gradient(circle_at_bottom_right,rgba(252,231,243,0.5),transparent_24%),linear-gradient(180deg,#fff8eb_0%,#fffaf2_100%)]" />
                <div className="absolute left-[-7%] top-20 h-72 w-72 rounded-full bg-[#ffe5bf]/65 blur-3xl" />
                <div className="absolute right-[-5%] top-24 h-80 w-80 rounded-full bg-[#dfe9ff]/75 blur-3xl" />
                <div className="absolute bottom-[-9%] left-[18%] h-80 w-80 rounded-full bg-[#fce7f3]/60 blur-3xl" />
                <div className="absolute bottom-12 right-[14%] h-56 w-56 rounded-full bg-[#dcfce7]/65 blur-3xl" />
            </div>

            <div className="relative mx-auto max-w-[1500px]">
                <div className="flex min-h-[calc(100vh-2rem)] items-center justify-center">
                    <section className="relative flex w-full max-w-[520px] flex-col overflow-hidden rounded-[2.8rem] border-4 border-[#111827] bg-white p-6 shadow-[0_12px_0_0_#111827] lg:p-7">
                        <div className="absolute right-5 top-5 rounded-full border-4 border-[#111827] bg-[#fde68a] px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-[#92400e] shadow-[0_4px_0_0_#111827]">
                            {badge}
                        </div>

                        <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <BrandMark />
                                <div>
                                    <p className="font-welcome-display text-[2rem] font-black leading-none tracking-[-0.07em] text-[#111827]">
                                        yasi
                                    </p>
                                    <p className="mt-1 text-[11px] font-black uppercase tracking-[0.18em] text-[#9ca3af]">
                                        cute auth
                                    </p>
                                </div>
                            </div>

                            <div className="pt-1 text-right">
                                <p className="text-[12px] font-bold text-[#9ca3af]">{footerLabel}</p>
                                <Link
                                    href={footerHref}
                                    className="inline-flex items-center gap-1 text-sm font-black text-[#111827] transition hover:text-[#ec4899]"
                                >
                                    {footerCta}
                                    <ChevronRight className="h-4 w-4" />
                                </Link>
                            </div>
                        </div>

                        <div className="mt-8">
                            <h1 className="font-welcome-display text-[3rem] font-black leading-[0.9] tracking-[-0.06em] text-[#111827] sm:text-[3.4rem]">
                                {title}
                            </h1>
                            <p className="mt-4 max-w-[24rem] text-[15px] font-bold leading-7 text-[#6b7280]">
                                {description}
                            </p>
                        </div>

                        <div className="mt-7">
                            {alert ? (
                                <div className="mb-4 rounded-[1.5rem] border-4 border-[#111827] bg-[#fff7ed] px-4 py-3 text-sm font-bold text-[#9a3412] shadow-[0_5px_0_0_#111827]">
                                    {alert}
                                </div>
                            ) : null}

                            <div className="rounded-[2rem] border-4 border-[#111827] bg-[#fffaf0] p-4 shadow-[0_8px_0_0_#111827] sm:p-5">
                                {children}
                            </div>
                        </div>

                        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                            <div className="text-[12px] font-black uppercase tracking-[0.16em] text-[#9ca3af]">
                                account + cloud sync
                            </div>

                            {secondaryHref && secondaryLabel && secondaryText ? (
                                <Link
                                    href={secondaryHref}
                                    className="inline-flex items-center gap-1 rounded-full border-4 border-[#111827] bg-white px-3 py-2 text-[12px] font-black text-[#111827] shadow-[0_4px_0_0_#111827] transition hover:bg-[#fef3c7]"
                                >
                                    {secondaryText}
                                    <span className="text-[#ec4899]">{secondaryLabel}</span>
                                    <ChevronRight className="h-4 w-4" />
                                </Link>
                            ) : null}
                        </div>
                    </section>
                </div>
            </div>
        </main>
    );
}
