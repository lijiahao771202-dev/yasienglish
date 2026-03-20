import { Suspense } from "react";
import { HomeConsole } from "@/components/home/HomeConsole";

export default function Home() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-[#0b1220]" />}>
            <HomeConsole />
        </Suspense>
    );
}
