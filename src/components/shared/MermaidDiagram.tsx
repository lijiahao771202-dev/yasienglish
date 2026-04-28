"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import DOMPurify from "dompurify";
import { Maximize2, X } from "lucide-react";

let mermaidLoader: Promise<typeof import("mermaid").default> | null = null;

async function loadMermaid() {
    if (!mermaidLoader) {
        mermaidLoader = import("mermaid").then((module) => {
            const mermaid = module.default;
            mermaid.initialize({
                startOnLoad: false,
                securityLevel: "loose",
                suppressErrorRendering: true,
                theme: "neutral",
                htmlLabels: false,
                flowchart: {
                    useMaxWidth: true,
                },
                mindmap: {
                    useMaxWidth: true,
                },
            });
            return mermaid;
        });
    }

    return mermaidLoader;
}

export function MermaidDiagram({ chart }: { chart: string }) {
    const diagramId = useId().replace(/[:]/g, "");
    const trimmedChart = chart.trim();
    const [isLightboxOpen, setIsLightboxOpen] = useState(false);
    const [renderState, setRenderState] = useState<{
        chart: string;
        svg: string;
        error: string;
    }>({
        chart: "",
        svg: "",
        error: "",
    });

    useEffect(() => {
        let cancelled = false;

        if (!trimmedChart) {
            return () => {
                cancelled = true;
            };
        }

        void loadMermaid()
            .then(async (mermaid) => {
                const renderId = `ask-mermaid-${diagramId}-${Math.random().toString(36).slice(2, 8)}`;
                const rendered = await mermaid.render(renderId, trimmedChart);
                if (cancelled) {
                    return;
                }

                setRenderState({
                    chart: trimmedChart,
                    svg: DOMPurify.sanitize(rendered.svg),
                    error: "",
                });
            })
            .catch((renderError) => {
                console.error("Mermaid render failed", renderError);
                if (cancelled) {
                    return;
                }
                setRenderState({
                    chart: trimmedChart,
                    svg: "",
                    error: "图表暂时无法渲染，先显示 Mermaid 源码。",
                });
            });

        return () => {
            cancelled = true;
        };
    }, [diagramId, trimmedChart]);

    const isCurrentChart = renderState.chart === trimmedChart;
    const svg = isCurrentChart ? renderState.svg : "";
    const error = isCurrentChart ? renderState.error : "";

    useEffect(() => {
        if (!isLightboxOpen) {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setIsLightboxOpen(false);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [isLightboxOpen]);

    if (!trimmedChart) {
        return null;
    }

    if (error) {
        return (
            <div className="my-4 overflow-hidden rounded-xl border border-amber-200/70 bg-amber-50/80 shadow-sm">
                <div className="border-b border-amber-200/70 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-700">
                    Mermaid
                </div>
                <p className="px-3 pt-3 text-[12px] font-semibold text-amber-700">{error}</p>
                <pre className="overflow-x-auto px-3 pb-3 pt-2 text-[12px] leading-6 text-amber-900">
                    <code>{chart}</code>
                </pre>
            </div>
        );
    }

    if (!svg) {
        return (
            <div className="my-4 overflow-hidden rounded-xl border border-stone-200/70 bg-white shadow-sm">
                <div className="border-b border-stone-200/70 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-stone-500">
                    Mermaid
                </div>
                <div className="flex min-h-32 items-center justify-center px-4 py-6 text-[13px] font-semibold text-stone-500">
                    正在生成图示...
                </div>
            </div>
        );
    }

    const lightbox = isLightboxOpen && typeof document !== "undefined"
        ? createPortal(
            <div
                data-testid="mermaid-lightbox"
                className="fixed inset-0 z-[11000] bg-stone-950/70 px-3 py-4 backdrop-blur-sm sm:px-6 sm:py-8"
                onClick={() => setIsLightboxOpen(false)}
            >
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="放大查看 Mermaid 图示"
                    className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-[1.5rem] border border-stone-200/80 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.28)]"
                    onClick={(event) => event.stopPropagation()}
                >
                    <div className="flex items-center justify-between border-b border-stone-200/80 px-4 py-3 sm:px-5">
                        <div className="min-w-0">
                            <p className="text-[12px] font-black uppercase tracking-[0.16em] text-stone-500">Mermaid</p>
                            <p className="mt-1 text-[15px] font-bold text-stone-800">放大查看</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsLightboxOpen(false)}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-stone-50 text-stone-600 transition hover:bg-stone-100 hover:text-stone-900"
                            aria-label="关闭放大 Mermaid 图示"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                    <div className="flex-1 overflow-auto bg-stone-50 px-3 py-4 sm:px-5 sm:py-5">
                        <div
                            className="min-w-[720px] rounded-[1.25rem] border border-stone-200/80 bg-white px-4 py-5 shadow-sm sm:px-6 sm:py-6 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-none"
                            dangerouslySetInnerHTML={{ __html: svg }}
                        />
                    </div>
                </div>
            </div>,
            document.body,
        )
        : null;

    return (
        <>
            <button
                type="button"
                onClick={() => setIsLightboxOpen(true)}
                aria-label="放大 Mermaid 图示"
                className="group my-4 block w-full overflow-hidden rounded-xl border border-stone-200/70 bg-white text-left shadow-sm transition hover:shadow-md"
            >
                <div className="flex items-center justify-between border-b border-stone-200/70 px-3 py-2">
                    <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-500">
                        Mermaid
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-stone-400 transition group-hover:text-stone-600">
                        <Maximize2 className="h-3.5 w-3.5" />
                        点击放大
                    </span>
                </div>
                <div
                    className="overflow-x-auto px-3 py-4 text-stone-800 cursor-zoom-in [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
                    dangerouslySetInnerHTML={{ __html: svg }}
                />
            </button>
            {lightbox}
        </>
    );
}
