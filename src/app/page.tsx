import { BookMarked, BookOpen, Sword } from "lucide-react";
import Link from "next/link";

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden px-5 py-8 md:px-10 md:py-10 flex items-center justify-center">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_16%,rgba(251,146,60,0.2),transparent_36%),radial-gradient(circle_at_88%_18%,rgba(244,114,182,0.17),transparent_36%),radial-gradient(circle_at_84%_84%,rgba(16,185,129,0.13),transparent_38%),linear-gradient(150deg,#fffdf9_0%,#fdf9f4_40%,#f9f7ff_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-25 bg-[linear-gradient(rgba(148,163,184,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.07)_1px,transparent_1px)] bg-[size:42px_42px]" />

      <div className="relative z-10 glass-panel w-full max-w-3xl rounded-[2rem] border border-white/70 p-7 md:p-10 shadow-[0_28px_80px_-24px_rgba(15,23,42,0.22)]">
        <div className="text-center">
          <h1 className="font-newsreader text-5xl md:text-7xl font-semibold leading-[0.95] tracking-tight text-stone-900">
            DeepSeek IELTS
          </h1>
          <p className="mt-3 text-base md:text-lg text-stone-600">
            Read · Battle · Vocabulary
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-3 md:grid-cols-3">
          <Link
            href="/read"
            className="group inline-flex h-14 items-center justify-center gap-2 rounded-2xl border border-amber-200/80 bg-amber-50/80 text-amber-700 font-semibold transition-all duration-300 hover:-translate-y-0.5 hover:bg-amber-100/80"
          >
            <BookOpen className="h-4 w-4 transition-transform group-hover:scale-110" />
            Read
          </Link>
          <Link
            href="/battle"
            className="group inline-flex h-14 items-center justify-center gap-2 rounded-2xl border border-stone-700 bg-stone-900 text-white font-semibold transition-all duration-300 hover:-translate-y-0.5 hover:brightness-105"
          >
            <Sword className="h-4 w-4 transition-transform group-hover:scale-110" />
            Battle
          </Link>
          <Link
            href="/vocab"
            className="group inline-flex h-14 items-center justify-center gap-2 rounded-2xl border border-emerald-200/80 bg-emerald-50/80 text-emerald-700 font-semibold transition-all duration-300 hover:-translate-y-0.5 hover:bg-emerald-100/80"
          >
            <BookMarked className="h-4 w-4 transition-transform group-hover:scale-110" />
            生词本
          </Link>
        </div>
      </div>
    </main>
  );
}
