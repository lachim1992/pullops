import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type PlanCanvasSurfaceProps = {
  documentUrl: string | null;
  mimeType?: string | null;
  title: string;
  children?: React.ReactNode;
  className?: string;
  empty?: React.ReactNode;
};

const DEFAULT_ASPECT = 1;

export function PlanCanvasSurface({
  documentUrl,
  mimeType,
  title,
  children,
  className,
  empty,
}: PlanCanvasSurfaceProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState(DEFAULT_ASPECT);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : DEFAULT_ASPECT;
  const outerAspect = size.width > 0 && size.height > 0 ? size.width / size.height : safeAspect;
  const innerWidth = outerAspect > safeAspect ? size.height * safeAspect : size.width;
  const innerHeight = outerAspect > safeAspect ? size.height : size.width / safeAspect;

  return (
    <div ref={outerRef} className={cn("absolute inset-0 flex items-center justify-center", className)}>
      {documentUrl ? (
        <div
          className="relative overflow-hidden bg-muted"
          style={{ width: innerWidth || "100%", height: innerHeight || "100%" }}
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