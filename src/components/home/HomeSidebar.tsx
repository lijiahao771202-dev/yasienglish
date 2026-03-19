"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    BookOpenText,
    BrainCircuit,
    House,
    LayoutDashboard,
    Settings2,
    Swords,
} from "lucide-react";

const NAV_ITEMS = [
    { href: "/", label: "Home", icon: House },
    { href: "/read", label: "Read", icon: BookOpenText },
    { href: "/battle", label: "Battle", icon: Swords },
    { href: "/vocab", label: "Vocab", icon: BrainCircuit },
    { href: "/dashboard", label: "Stats", icon: LayoutDashboard },
    { href: "/profile", label: "Profile", icon: Settings2 },
] as const;

const PRIMARY_NAV_ITEMS = NAV_ITEMS.filter((item) => item.href !== "/profile");
const SETTINGS_NAV_ITEM = NAV_ITEMS.find((item) => item.href === "/profile");

function matchesPath(pathname: string, href: string) {
    if (href === "/") {
        return pathname === "/";
    }

    return pathname === href || pathname.startsWith(`${href}/`);
}

function BrandMark() {
    return (
        <div className="relative flex h-16 w-16 items-center justify-center rounded-[1.8rem] border border-white/82 bg-[linear-gradient(145deg,rgba(255,255,255,0.95),rgba(253,245,249,0.88))] shadow-[inset_0_1px_0_rgba(255,255,255,0.98),0_20px_35px_-24px_rgba(78,30,56,0.2)]">
            <span className="absolute left-[22%] top-[26%] h-3.5 w-3.5 rounded-full bg-[#25222a]" />
            <span className="absolute right-[26%] top-[22%] h-3 w-3 rounded-full bg-[#d8a13e]" />
            <span className="absolute left-[30%] bottom-[24%] h-4 w-4 rounded-full bg-[#25222a]" />
            <span className="absolute right-[26%] bottom-[24%] h-3.5 w-3.5 rounded-full bg-[#25222a]" />
        </div>
    );
}

export function HomeSidebar() {
    const pathname = usePathname();

    return (
        <aside className="min-w-0 rounded-[2.3rem] border border-white/66 bg-[linear-gradient(180deg,rgba(255,250,253,0.82),rgba(253,245,249,0.58))] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.96),0_26px_52px_-40px_rgba(74,31,54,0.24)] lg:p-3">
            <div className="flex items-center justify-between gap-3 rounded-[2rem] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.7),rgba(255,248,252,0.58))] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.88)] lg:h-full lg:min-h-[680px] lg:flex-col lg:justify-start lg:gap-5 lg:p-3">
                <div className="flex justify-center rounded-[1.8rem] border border-white/76 bg-white/60 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.86)]">
                    <BrandMark />
                </div>

                <nav className="flex flex-1 items-center gap-2 lg:w-full lg:flex-col lg:items-stretch lg:gap-3">
                    {PRIMARY_NAV_ITEMS.map((item) => {
                        const Icon = item.icon;
                        const isActive = matchesPath(pathname, item.href);

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                aria-label={item.label}
                                className={`group flex h-14 items-center justify-center rounded-[1.4rem] border transition lg:h-[104px] ${
                                    isActive
                                        ? "border-[#212332]/12 bg-[linear-gradient(180deg,#212331_0%,#2e3041_100%)] text-[#f2cf4e] shadow-[0_24px_34px_-26px_rgba(24,25,35,0.92)]"
                                        : "border-white/70 bg-white/56 text-[#7a6f73] shadow-[inset_0_1px_0_rgba(255,255,255,0.86),0_20px_30px_-28px_rgba(56,38,48,0.18)] hover:border-[#f1c8dc] hover:bg-white/76 hover:text-[#4a3a41]"
                                }`}
                                title={item.label}
                            >
                                <div
                                    className={`flex h-10 w-10 items-center justify-center rounded-full transition lg:h-11 lg:w-11 ${
                                        isActive ? "bg-white/10" : "bg-[#efe9ea]"
                                    }`}
                                >
                                    <Icon className={`h-4.5 w-4.5 ${isActive ? "scale-105" : "group-hover:scale-105"} transition`} />
                                </div>
                            </Link>
                        );
                    })}
                </nav>

                {SETTINGS_NAV_ITEM ? (
                    <Link
                        href={SETTINGS_NAV_ITEM.href}
                        aria-label={SETTINGS_NAV_ITEM.label}
                        title={SETTINGS_NAV_ITEM.label}
                        className={`group flex h-14 w-full items-center justify-center rounded-[1.7rem] border transition lg:h-24 ${
                            matchesPath(pathname, SETTINGS_NAV_ITEM.href)
                                ? "border-[#e5bad0] bg-[linear-gradient(180deg,rgba(255,226,240,0.92),rgba(255,212,230,0.86))] text-[#8f345f] shadow-[0_20px_30px_-24px_rgba(120,43,79,0.36)]"
                                : "border-[#ddd1d6] bg-[linear-gradient(180deg,rgba(255,255,255,0.68),rgba(250,245,247,0.6))] text-[#4d4246] hover:border-[#ceb8c1] hover:bg-white/86"
                        }`}
                    >
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e9e3df] transition group-hover:scale-105">
                            <SETTINGS_NAV_ITEM.icon className="h-4.5 w-4.5" />
                        </div>
                    </Link>
                ) : null}
            </div>
        </aside>
    );
}
