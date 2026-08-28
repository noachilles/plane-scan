import fs from "node:fs";
import path from "node:path";
import { notFound } from "next/navigation";
import DiagramViewer from "@/components/DiagramViewer";

export const dynamic = "force-dynamic";

/** 개발 전용 다이어그램 라이브 뷰어 — md 파일 수정 후 새로고침하면 반영 */
export default function DiagramsPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const dir = path.join(process.cwd(), "src", "docs", "diagrams");
  const docs = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((file) => ({ file, content: fs.readFileSync(path.join(dir, file), "utf8") }));

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-1 flex items-center gap-2 text-xl font-extrabold text-slate-900">
        <i className="bi bi-diagram-3 text-blue-600" aria-hidden />
        설계 다이어그램
      </h1>
      <p className="mb-6 text-sm text-slate-500">
        src/docs/diagrams/*.md 를 렌더링합니다 (개발 모드 전용). 파일 수정 후 새로고침하세요.
      </p>
      <DiagramViewer docs={docs} />
    </main>
  );
}
