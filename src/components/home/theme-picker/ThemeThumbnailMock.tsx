import { Sparkles, ArrowRight } from "lucide-react";

export function ThemeThumbnailMock() {
    return (
        <div className="w-[400px] h-[300px] overflow-hidden flex flex-col gap-3 p-4 bg-transparent font-welcome-ui pointer-events-none select-none">
            {/* Hero / Entry Row Simulation */}
            <div className="flex-shrink-0 bg-[color:var(--theme-card-bg)] backdrop-blur-md rounded-[1.25rem] p-4 flex flex-col justify-between border-[2px] border-[color:var(--theme-border)] shadow-[0_4px_0_0_var(--theme-shadow)] transition-colors duration-500">
                <div className="flex flex-row items-center justify-between gap-4">
                    <div className="space-y-2">
                        <p className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--theme-border)] bg-[color:var(--theme-base-bg)] px-2 py-0.5 text-[0.6rem] font-black uppercase tracking-[0.2em] text-[color:var(--theme-text)] shadow-[0_2px_0_0_var(--theme-shadow)] transition-colors duration-500">
                            <Sparkles className="h-2.5 w-2.5 text-[color:var(--theme-text)]" />
                            WELCOME
                        </p>
                        <h1 className="font-welcome-display text-[1.4rem] leading-[1] tracking-tight text-[color:var(--theme-text)] transition-colors duration-500">
                            欢迎回来
                        </h1>
                    </div>
                    {/* Dummy Buttons */}
                    <div className="flex gap-2">
                        <div className="flex w-[70px] items-center justify-between gap-1.5 rounded-[1rem] bg-[color:var(--module-listen-bg)] border-[2px] border-[color:var(--module-listen-bd)] px-2 py-1.5 shadow-[0_3px_0_0_var(--module-listen-bd)] text-[color:var(--theme-text)] opacity-90 transition-colors duration-500">
                            <span className="flex items-center gap-1 text-[10px] whitespace-nowrap font-black">
                                听力
                            </span>
                            <ArrowRight className="h-2.5 w-2.5 text-[color:var(--theme-text)]" />
                        </div>
                        <div className="flex w-[70px] items-center justify-between gap-1.5 rounded-[1rem] bg-[color:var(--module-read-bg)] border-[2px] border-[color:var(--module-read-bd)] px-2 py-1.5 shadow-[0_3px_0_0_var(--module-read-bd)] text-[color:var(--theme-text)] opacity-90 transition-colors duration-500">
                            <span className="flex items-center gap-1 text-[10px] whitespace-nowrap font-black">
                                阅读
                            </span>
                            <ArrowRight className="h-2.5 w-2.5 text-[color:var(--theme-text)]" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Dashboard Panels Simulation */}
            <div className="flex-1 h-full w-full rounded-[1.5rem] p-3 bg-[color:var(--theme-card-bg)] backdrop-blur-md border-[2px] border-[color:var(--theme-border)] shadow-[0_4px_0_0_var(--theme-shadow)] flex flex-col gap-3 transition-colors duration-500">
                 <div className="flex justify-between items-center px-1">
                     <span className="text-[12px] font-black text-[color:var(--theme-text)] transition-colors duration-500">Data Overview</span>
                     <span className="w-[40px] h-[16px] rounded-full bg-[color:var(--theme-primary-bg)] border border-[color:var(--theme-border)] shadow-[0_2px_0_0_var(--theme-shadow)] transition-colors duration-500" />
                 </div>
                 <div className="grid grid-cols-2 gap-2">
                     <div className="h-[60px] rounded-xl bg-[color:var(--theme-base-bg)] border border-[color:var(--theme-border)] shadow-[0_2px_0_0_var(--theme-shadow)] transition-colors duration-500" />
                     <div className="h-[60px] rounded-xl bg-[color:var(--theme-base-bg)] border border-[color:var(--theme-border)] shadow-[0_2px_0_0_var(--theme-shadow)] transition-colors duration-500" />
                     <div className="h-[60px] rounded-xl bg-[color:var(--theme-base-bg)] border border-[color:var(--theme-border)] shadow-[0_2px_0_0_var(--theme-shadow)] transition-colors duration-500" />
                     <div className="h-[60px] rounded-xl bg-[color:var(--theme-base-bg)] border border-[color:var(--theme-border)] shadow-[0_2px_0_0_var(--theme-shadow)] transition-colors duration-500" />
                 </div>
            </div>
        </div>
    );
}
