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

interface HomeSidebarProps {
    email?: string | null;
}

const NAV_ITEMS = [
    { href: "/", label: "Home", icon: House },
    { href: "/read", label: "Read", icon: BookOpenText },
    { href: "/battle", label: "Battle", icon: Swords },
    { href: "/vocab", label: "Vocab", icon: BrainCircuit },
    { href: "/dashboard", label: "Stats", icon: LayoutDashboard },
    { href: "/profile", label: "Profile", icon: Settings2 },
] as const;

function matchesPath(pathname: string, href: string) {
    if (href === "/") {
        return pathname === "/";
    }

    return pathname === href || pathname.startsWith(`${href}/`);
}

function BrandMark() {
    return (
        <div className="relative flex h-16 w-16 items-center justify-center rounded-[1.8rem] border border-white/82 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(249,246,239,0.82))] shadow-[inset_0_1px_0_rgba(255,255,255,0.98),0_20px_35px_-24px_rgba(48,42,37,0.2)]">
            <span className="absolute left-[22%] top-[26%] h-3.5 w-3.5 rounded-full bg-[#25222a]" />
            <span className="absolute right-[26%] top-[22%] h-3 w-3 rounded-full bg-[#d9a84d]" />
            <span className="absolute left-[30%] bottom-[24%] h-4 w-4 rounded-full bg-[#25222a]" />
            <span className="absolute right-[26%] bottom-[24%] h-3.5 w-3.5 rounded-full bg-[#25222a]" />
        </div>
    );
}

export function HomeSidebar({ email: _email }: HomeSidebarProps) {
    const pathname = usePathname();

    return (
        <aside className="flex min-w-0 flex-col justify-between gap-5 rounded-[2.5rem] border border-white/68 bg-[linear-gradient(180deg,rgba(255,255,255,0.58),rgba(247,243,236,0.42))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.96),0_30px_60px_-42px_rgba(40,34,28,0.18)]">
            <div className="space-y-5">
                <div className="flex justify-center rounded-[2rem] border border-white/78 bg-white/58 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.88)]">
                    <BrandMark />
                </div>

                <nav className="space-y-3">
                    {NAV_ITEMS.map((item) => {
                        const Icon = item.icon;
                        const isActive = matchesPath(pathname, item.href);

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                aria-label={item.label}
                                className={`group flex h-14 items-center justify-center rounded-[1.5rem] border transition ${
                                    isActive
                                        ? "border-[#202128]/10 bg-[linear-gradient(180deg,#202128_0%,#2f313c_100%)] text-[#f4d14f] shadow-[0_22px_34px_-24px_rgba(32,33,40,0.88)]"
                                        : "border-white/76 bg-white/58 text-[#6d665c] shadow-[inset_0_1px_0_rgba(255,255,255,0.86),0_18px_30px_-28px_rgba(44,37,31,0.18)] hover:border-[#dbd3c7] hover:bg-white/72 hover:text-[#2d2721]"
                                }`}
                                title={item.label}
                            >
                                <div className={`flex h-10 w-10 items-center justify-center rounded-full ${isActive ? "bg-white/10" : "bg-[#f4efe6]"} transition`}>
                                    <Icon className={`h-4.5 w-4.5 ${isActive ? "scale-105" : "group-hover:scale-105"} transition`} />
                                </div>
                            </Link>
                        );
                    })}
                </nav>
            </div>
        </aside>
    );
}
