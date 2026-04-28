"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2, X } from "lucide-react";
import type { MindElixirData, MindElixirInstance } from "mind-elixir";

function cloneMindmapData<T>(data: T): T {
    return JSON.parse(JSON.stringify(data)) as T;
}

function MindElixirCanvas({
    data,
    className,
    testId,
    fitToCanvas = false,
}: {
    data: MindElixirData;
    className?: string;
    testId?: string;
    fitToCanvas?: boolean;
}) {
    const hostRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        let cancelled = false;
        let mind: MindElixirInstance | null = null;

        void import("mind-elixir").then((module) => {
            if (cancelled || !hostRef.current) {
                return;
            }

            hostRef.current.innerHTML = "";
            const MindElixir = module.default;
            mind = new MindElixir({
                el: hostRef.current,
                direction: data.direction ?? module.SIDE,
                editable: false,
                draggable: false,
                contextMenu: false,
                toolBar: false,
                keypress: false,
                allowUndo: false,
                overflowHidden: false,
            });
            mind.init(cloneMindmapData(data));
            mind.clearHistory?.();
            if (fitToCanvas) {
                mind.scaleFit?.();
            } else {
                mind.toCenter?.();
            }
        });

        return () => {
            cancelled = true;
            mind?.destroy?.();
        };
    }, [data, fitToCanvas]);

    return <div ref={hostRef} data-testid={testId} className={className} />;
}

export function MindElixirDiagram({ outline }: { outline: string }) {
    const trimmedOutline = outline.trim();
    const [isLightboxOpen, setIsLightboxOpen] = useState(false);
    const [renderState, setRenderState] = useState<{
        outline: string;
        data: MindElixirData | null;
        error: string;
    }>({
        outline: "",
        data: null,
        error: "",
    });

    useEffect(() => {
        if (!trimmedOutline) {
            setRenderState({
                outline: "",
                data: null,
                error: "",
            });
            return;
        }

        let cancelled = false;

        void import("mind-elixir/plaintextConverter")
            .then(({ plaintextToMindElixir }) => {
                const data = plaintextToMindElixir(trimmedOutline, "逻辑图") as MindElixirData;
                if (cancelled) {
                    return;
                }
                setRenderState({
                    outline: trimmedOutline,
                    data,
                    error: "",
                });
            })
            .catch((error) => {
                console.error("Mind Elixir render failed", error);
                if (cancelled) {
                    return;
                }
                setRenderState({
                    outline: trimmedOutline,
                    data: null,
                    error: "脑图暂时无法渲染，先显示大纲源码。",
                });
            });

        return () => {
            cancelled = true;
        };
    }, [trimmedOutline]);

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

    const isCurrentOutline = renderState.outline === trimmedOutline;
    const data = isCurrentOutline ? renderState.data : null;
    const error = isCurrentOutline ? renderState.error : "";

    const lightbox = useMemo(() => {
        if (!isLightboxOpen || typeof document === "undefined" || !data) {
            return null;
        }

        return createPortal(
            <div
                data-testid="mindmap-lightbox"
                className="fixed inset-0 z-[11000] bg-stone-950/70 px-3 py-4 backdrop-blur-sm sm:px-6 sm:py-8"
                onClick={() => setIsLightboxOpen(false)}
            >
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="放大查看脑图"
                    className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-[1.5rem] border border-stone-200/80 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.28)]"
                    onClick={(event) => event.stopPropagation()}
                >
                    <div className="flex items-center justify-between border-b border-stone-200/80 px-4 py-3 sm:px-5">
                        <div className="min-w-0">
                            <p className="text-[12px] font-black uppercase tracking-[0.16em] text-stone-500">Mind Map</p>
                            <p className="mt-1 text-[15px] font-bold text-stone-800">放大查看脑图</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsLightboxOpen(false)}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-stone-50 text-stone-600 transition hover:bg-stone-100 hover:text-stone-900"
                            aria-label="关闭放大脑图"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                    <div className="flex-1 overflow-auto bg-stone-50 px-3 py-4 sm:px-5 sm:py-5">
                        <div className="min-w-[920px] rounded-[1.25rem] border border-stone-200/80 bg-white shadow-sm">
                            <MindElixirCanvas
                                data={data}
                                className="mind-elixir-readonly h-[720px] w-full"
                                fitToCanvas
                            />
                        </div>
                    </div>
                </div>
            </div>,
            document.body,
        );
    }, [data, isLightboxOpen]);

    if (!trimmedOutline) {
        return null;
    }

    if (error) {
        return (
            <div className="my-4 overflow-hidden rounded-xl border border-amber-200/70 bg-amber-50/80 shadow-sm">
                <div className="border-b border-amber-200/70 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-700">
                    Mind Map
                </div>
                <p className="px-3 pt-3 text-[12px] font-semibold text-amber-700">{error}</p>
                <pre className="overflow-x-auto px-3 pb-3 pt-2 text-[12px] leading-6 text-amber-900">
                    <code>{outline}</code>
                </pre>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="my-4 overflow-hidden rounded-xl border border-stone-200/70 bg-white shadow-sm">
                <div className="border-b border-stone-200/70 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-stone-500">
                    Mind Map
                </div>
                <div className="flex min-h-32 items-center justify-center px-4 py-6 text-[13px] font-semibold text-stone-500">
                    正在生成脑图...
                </div>
            </div>
        );
    }

    return (
        <>
            <div
                role="button"
                tabIndex={0}
                onClick={() => setIsLightboxOpen(true)}
                onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setIsLightboxOpen(true);
                    }
                }}
                className="group my-4 block w-full overflow-hidden rounded-xl border border-stone-200/70 bg-white text-left shadow-sm transition hover:shadow-md"
            >
                <div className="flex items-center justify-between border-b border-stone-200/70 px-3 py-2">
                    <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-500">
                        Mind Map
                    </span>
                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation();
                            setIsLightboxOpen(true);
                        }}
                        aria-label="放大思维导图"
                        className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold text-stone-400 transition hover:bg-stone-100 hover:text-stone-700 group-hover:text-stone-600"
                    >
                        <Maximize2 className="h-3.5 w-3.5" />
                        点击放大
                    </button>
                </div>
                <div className="cursor-zoom-in bg-stone-50 px-2 py-2">
                    <MindElixirCanvas
                        data={data}
                        testId="mind-elixir-canvas"
                        className="mind-elixir-readonly h-[360px] w-full overflow-hidden rounded-[1rem] bg-white"
                        fitToCanvas
                    />
                </div>
            </div>
            {lightbox}
        </>
    );
}
