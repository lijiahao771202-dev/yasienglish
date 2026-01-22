import { ArrowRight, BookOpen, Mic, PenTool } from "lucide-react";
import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 relative overflow-hidden">
      {/* Background Orbs - Warm */}
      <div className="absolute top-20 left-20 w-96 h-96 bg-rose-600/20 rounded-full blur-[100px] animate-float" />
      <div className="absolute bottom-20 right-20 w-96 h-96 bg-amber-500/20 rounded-full blur-[100px] animate-pulse-slow" />

      {/* Glass Card */}
      <div className="glass-panel p-12 rounded-3xl max-w-2xl w-full z-10 flex flex-col items-center text-center space-y-8 border border-white/10">
        <div className="space-y-2">
          <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-amber-600 to-rose-600 drop-shadow-sm">
            DeepSeek IELTS
          </h1>
          <p className="text-stone-600 text-lg font-medium">
            Contextual Reading · Shadowing · AI Writing
          </p>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
          {[
            { icon: BookOpen, label: "Read", color: "text-amber-500" },
            { icon: Mic, label: "Shadow", color: "text-rose-500" },
            { icon: PenTool, label: "Write", color: "text-orange-500" },
          ].map((item, i) => (
            <div key={i} className="glass-button p-4 rounded-xl flex flex-col items-center gap-3 group cursor-pointer hover:bg-white/60 transition-all">
              <item.icon className={`w-8 h-8 ${item.color} group-hover:scale-110 transition-transform`} />
              <span className="text-sm font-semibold text-stone-700">{item.label}</span>
            </div>
          ))}
        </div>

        <Link href="/read" className="px-8 py-3 rounded-full bg-gradient-to-r from-amber-500 to-rose-500 text-white font-bold shadow-lg shadow-rose-500/30 flex items-center gap-2 hover:scale-105 active:scale-95 transition-all">
          Start Learning <ArrowRight className="w-5 h-5" />
        </Link>
      </div>
    </main>
  );
}
