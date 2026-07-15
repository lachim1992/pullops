import { useEffect, useRef, useState } from "react";
import { Expand, Maximize2, Minimize2, Shrink } from "lucide-react";

import { Button } from "@/components/ui/button";

import { cn } from "@/lib/utils";

type PlanCanvasSurfaceProps = {
  documentUrl: string | null;
  mimeType?: string | null;
  title: string;
  children?: React.ReactNode;
  overlay?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  contentStyle?: React.CSSProperties;
  contentRef?: React.Ref<HTMLDivElement>;
  empty?: React.ReactNode;
  allowFullscreen?: boolean;
  fullscreenTargetRef?: React.RefObject<HTMLElement | null>;
  onFullscreenChange?: (isFullscreen: boolean) => void;
};

const DEFAULT_ASPECT = 1;

export function PlanCanvasSurface({
  documentUrl,
  mimeType,
  title,
  children,
  overlay,
  className,
  contentClassName,
  contentStyle,
  contentRef,
  empty,
  allowFullscreen = true,
  fullscreenTargetRef,
  onFullscreenChange,
}: PlanCanvasSurfaceProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState(DEFAULT_ASPECT);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenSupported, setFullscreenSupported] = useState(false);
  const [appFullscreen, setAppFullscreen] = useState(false);

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const update = () => {
      setSize({ width: el.clientWidth, height: el.clientHeight });
    };
    update();
    const ro = new ResizeObserver(([entry]) => {
      const rect = entry?.contentRect;
      if (!rect) return update();
      setSize({ width: rect.width, height: rect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setFullscreenSupported(Boolean(document.fullscreenEnabled));
    const update = () => {
      const target = fullscreenTargetRef?.current ?? outerRef.current;
      const active = document.fullscreenElement === target;
      setIsFullscreen(active);
      onFullscreenChange?.(active);
    };
    update();
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, [fullscreenTargetRef, onFullscreenChange]);

  async function toggleFullscreen() {
    const el = fullscreenTargetRef?.current ?? outerRef.current;
    if (!el) return;
    if (document.fullscreenElement === el) {
      await document.exitFullscreen();
    } else {
      await el.requestFullscreen();
    }
  }

  function toggleAppFullscreen() {
    const el = fullscreenTargetRef?.current ?? outerRef.current;
    if (!el) return;
    const cls = "plan-canvas-app-fullscreen";
    setAppFullscreen((prev) => {
      const next = !prev;
      if (next) el.classList.add(cls);
      else el.classList.remove(cls);
      return next;
    });
  }

  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : DEFAULT_ASPECT;
  const outerAspect = size.width > 0 && size.height > 0 ? size.width / size.height : safeAspect;
  const innerWidth = outerAspect > safeAspect ? size.height * safeAspect : size.width;
  const innerHeight = outerAspect > safeAspect ? size.height : size.width / safeAspect;

  return (
    <div
      ref={outerRef}
      className={cn("plan-canvas-surface absolute inset-0 flex items-center justify-center", className)}
    >
      {documentUrl ? (
        <div
          ref={contentRef}
          className={cn("plan-canvas-inner relative overflow-hidden bg-muted", contentClassName)}
          style={{
            width: innerWidth || "100%",
            height: innerHeight || "100%",
            transformOrigin: "0 0",
            willChange: "transform",
            ...contentStyle,
          }}
        >
          {mimeType === "application/pdf" || mimeType?.includes("pdf") ? (
            <PdfPlanBackground url={documentUrl} title={title} onAspect={setAspect} />
          ) : (
            <img
              src={documentUrl}
              alt={title}
              className="pointer-events-none absolute inset-0 h-full w-full select-none"
              draggable={false}
              onLoad={(event) => {
                const img = event.currentTarget;
                if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                  setAspect(img.naturalWidth / img.naturalHeight);
                }
              }}
            />
          )}
          {children}
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          {empty ?? "Bez podkladového výkresu"}
        </div>
      )}
      {overlay}
      {allowFullscreen && (
        <div className="absolute bottom-2 right-2 z-30 flex gap-1">
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-8 w-8 border-border/70 bg-background/90 shadow-sm backdrop-blur"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              toggleAppFullscreen();
            }}
            title={appFullscreen ? "Ukončit režim plné plochy" : "Plná plocha aplikace"}
            aria-label={appFullscreen ? "Ukončit režim plné plochy" : "Plná plocha aplikace"}
          >
            {appFullscreen ? <Shrink className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
          </Button>
          {fullscreenSupported && (
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-8 w-8 border-border/70 bg-background/90 shadow-sm backdrop-blur"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                void toggleFullscreen();
              }}
              title={isFullscreen ? "Ukončit celou obrazovku prohlížeče" : "Celá obrazovka prohlížeče"}
              aria-label={isFullscreen ? "Ukončit celou obrazovku prohlížeče" : "Celá obrazovka prohlížeče"}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function PdfPlanBackground({
  url,
  title,
  onAspect,
}: {
  url: string;
  title: string;
  onAspect: (aspect: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    let renderTask: { cancel: () => void } | null = null;

    async function renderPdf() {
      setStatus("loading");
      try {
        const mapPrototype = Map.prototype as Map<unknown, unknown> & {
          getOrInsertComputed?: (key: unknown, callback: (key: unknown) => unknown) => unknown;
        };
        if (!mapPrototype.getOrInsertComputed) {
          mapPrototype.getOrInsertComputed = function getOrInsertComputed(key, callback) {
            if (!this.has(key)) this.set(key, callback(key));
            return this.get(key);
          };
        }

        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.mjs",
          import.meta.url,
        ).toString();

        const pdf = await pdfjs.getDocument({ url }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2 });
        onAspect(viewport.width / viewport.height);

        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas není dostupný");

        const task = page.render({ canvasContext: context, viewport });
        renderTask = task;
        await task.promise;
        if (!cancelled) setStatus("ready");
      } catch (err) {
        console.error("PDF podklad se nepodařilo vykreslit", err);
        if (!cancelled) setStatus("error");
      }
    }

    renderPdf();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [url, onAspect]);

  return (
    <div className="pointer-events-none absolute inset-0 flex select-none items-center justify-center bg-muted">
      <canvas
        ref={canvasRef}
        aria-label={title}
        className={cn("h-full w-full transition-opacity", status === "ready" ? "opacity-100" : "opacity-0")}
      />
      {status === "loading" && <div className="absolute font-mono text-xs text-muted-foreground">Načítám PDF…</div>}
      {status === "error" && <div className="absolute text-xs text-destructive">PDF se nepodařilo zobrazit.</div>}
    </div>
  );
}