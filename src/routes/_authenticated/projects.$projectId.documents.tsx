import { useState, useRef } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileText, Loader2, Trash2, Upload } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  deleteDocument,
  getDocumentSignedUrl,
  listProjectDocuments,
  registerDocument,
} from "@/lib/documents.functions";

export const Route = createFileRoute("/_authenticated/projects/$projectId/documents")({
  head: () => ({
    meta: [{ title: "Dokumenty · PullOps" }, { name: "robots", content: "noindex" }],
  }),
  component: DocumentsPage,
});

function DocumentsPage() {
  const { projectId } = useParams({
    from: "/_authenticated/projects/$projectId/documents",
  });
  const listFn = useServerFn(listProjectDocuments);
  const registerFn = useServerFn(registerDocument);
  const deleteFn = useServerFn(deleteDocument);
  const signFn = useServerFn(getDocumentSignedUrl);
  const qc = useQueryClient();

  const docs = useQuery({
    queryKey: ["docs", projectId],
    queryFn: () => listFn({ data: { projectId } }),
  });

  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"FLOOR_PLAN" | "SCHEMATIC" | "OTHER">("FLOOR_PLAN");
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileInput.current?.files?.[0];
    if (!file) return toast.error("Vyberte soubor");
    if (!title.trim()) return toast.error("Zadejte název");
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "bin";
      const path = `${projectId}/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage
        .from("project-documents")
        .upload(path, file, { contentType: file.type || undefined });
      if (up.error) throw new Error(up.error.message);
      await registerFn({
        data: {
          projectId,
          kind,
          title: title.trim(),
          storagePath: path,
          mimeType: file.type || undefined,
        },
      });
      toast.success("Nahráno");
      setTitle("");
      if (fileInput.current) fileInput.current.value = "";
      qc.invalidateQueries({ queryKey: ["docs", projectId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba nahrání");
    } finally {
      setUploading(false);
    }
  }

  async function openDoc(id: string) {
    // Open blank tab synchronously so popup blockers (incl. preview iframe) allow it.
    const tab = window.open("", "_blank", "noopener,noreferrer");
    try {
      const { url } = await signFn({ data: { id } });
      if (tab) {
        tab.location.href = url;
      } else {
        // Fallback: trigger a hidden anchor click
        const a = document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch (err) {
      if (tab) tab.close();
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }

  async function removeDoc(id: string) {
    if (!confirm("Smazat dokument?")) return;
    await deleteFn({ data: { id } });
    qc.invalidateQueries({ queryKey: ["docs", projectId] });
  }

  return (
    <AppShell projectId={projectId}>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Dokumenty projektu</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Podklady projektu — půdorysy, schémata, PDF.
        </p>
      </header>

      <form
        onSubmit={handleUpload}
        className="mb-8 grid gap-3 rounded-sm border border-border bg-card p-4 md:grid-cols-[1fr_1fr_1fr_auto]"
      >
        <div>
          <Label htmlFor="title">Název</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Např. Půdorys 1. NP"
          />
        </div>
        <div>
          <Label>Druh</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="FLOOR_PLAN">Půdorys</SelectItem>
              <SelectItem value="SCHEMATIC">Schéma</SelectItem>
              <SelectItem value="OTHER">Jiné</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="file">Soubor</Label>
          <Input id="file" ref={fileInput} type="file" accept="application/pdf,image/*" />
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={uploading}>
            {uploading ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-1 h-4 w-4" />
            )}
            Nahrát
          </Button>
        </div>
      </form>

      {docs.isLoading ? (
        <div className="text-muted-foreground">Načítám…</div>
      ) : !docs.data || docs.data.length === 0 ? (
        <div className="rounded-sm border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Zatím žádný dokument.
        </div>
      ) : (
        <div className="divide-y divide-border rounded-sm border border-border">
          {docs.data.map((d) => (
            <div key={d.id} className="flex items-center gap-3 p-3">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{d.title}</div>
                <div className="font-mono text-xs text-muted-foreground">
                  {d.kind} · {d.mime_type ?? "?"}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => openDoc(d.id)}>
                Otevřít
              </Button>
              <Button variant="ghost" size="icon" onClick={() => removeDoc(d.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
