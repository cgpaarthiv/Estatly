import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { db, type ProjectFile } from "@/lib/db";
import { Upload, Eye, Download, Trash2, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/projects/$projectId/files")({
  component: ProjectFiles,
});

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }) + ", " + d.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function ProjectFiles() {
  const { projectId } = Route.useParams();
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(false);

  const refresh = useCallback(() => {
    db.files.list(projectId).then((f) => {
      setFiles(f);
      setLoading(false);
    });
  }, [projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleChooseFiles() {
    const saved = await db.files.pickAndSave(projectId);
    if (saved.length) {
      toast.success(`${saved.length} file(s) added`);
      refresh();
    }
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (!droppedFiles.length) return;

    for (const file of droppedFiles) {
      const buf = await file.arrayBuffer();
      await db.files.saveDropped(projectId, file.name, buf);
    }
    toast.success(`${droppedFiles.length} file(s) added`);
    refresh();
  }

  async function handleView(file: ProjectFile) {
    await db.files.open(file);
  }

  async function handleDownload(file: ProjectFile) {
    const ok = await db.files.download(file);
    if (ok) toast.success("File saved");
  }

  async function handleDelete(file: ProjectFile) {
    await db.files.delete(file);
    toast.success("File deleted");
    refresh();
  }

  return (
    <div className="mx-auto max-w-4xl p-6 md:p-10">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold">Project Files</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload and manage site documents, registration files, agreements, and more.
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-14 transition ${
          dragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 bg-muted/30"
        }`}
      >
        <Upload className="mb-3 h-10 w-10 text-muted-foreground/50" />
        <p className="font-medium">Drag & drop files here</p>
        <p className="mt-1 text-sm text-muted-foreground">
          PDF, images, Word, Excel, agreements, receipts
        </p>
        <button
          onClick={handleChooseFiles}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90"
        >
          <Upload className="h-4 w-4" />
          Choose files
        </button>
      </div>

      {loading ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : files.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">
          No files uploaded yet.
        </p>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {files.map((file) => (
            <div
              key={file.id}
              className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{file.original_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmtSize(file.size)} &middot; {fmtDateTime(file.created_at)}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
                <button
                  onClick={() => handleView(file)}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                >
                  <Eye className="h-3.5 w-3.5" />
                  View
                </button>
                <button
                  onClick={() => handleDownload(file)}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </button>
                <button
                  onClick={() => handleDelete(file)}
                  className="inline-flex items-center justify-center rounded-lg p-1.5 text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
