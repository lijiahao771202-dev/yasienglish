import { Suspense } from "react";
import { HomeConsole_v2 } from "@/components/home/HomeConsole_v2";

export default function Home() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-[#0b1220]" />}>
            <HomeConsole_v2 />
        </Suspense>
    );
}
