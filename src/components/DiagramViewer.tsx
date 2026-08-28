"use client";

import { useEffect, useState } from "react";

interface Doc {
  file: string;
  content: string;
}

interface Rendered {
  file: string;
  title: string;
  meta: string | null;
  svgs: string[];
  error?: string;
}

function parseDoc(doc: Doc): { title: string; meta: string | null; codes: string[] } {
  const title = doc.content.match(/^#\s+(.+)$/m)?.[1] ?? doc.file;
  const meta = doc.content.match(/^>\s*(.+)$/m)?.[1] ?? null;
  const codes = [...doc.content.matchAll(/```mermaid\n([\s\S]*?)```/g)].map((m) => m[1]);
  return { title, meta, codes };
}

export default function DiagramViewer({ docs }: { docs: Doc[] }) {
  const [rendered, setRendered] = useState<Rendered[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mermaid = (await import("mermaid")).default;
      mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "loose" });

      const out: Rendered[] = [];
      for (const [di, doc] of docs.entries()) {
        const { title, meta, codes } = parseDoc(doc);
        const item: Rendered = { file: doc.file, title, meta, svgs: [] };
        for (const [ci, code] of codes.entries()) {
          try {
            const { svg } = await mermaid.render(`diagram-${di}-${ci}`, code.trim());
            item.svgs.push(svg);
          } catch (e) {
            item.error = e instanceof Error ? e.message : String(e);
          }
        }
        out.push(item);
      }
      if (!cancelled) setRendered(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [docs]);

  if (rendered.length === 0) return <p className="text-sm text-slate-400">다이어그램 렌더링 중…</p>;

  return (
    <div className="space-y-10">
      {rendered.map((d) => (
        <section key={d.file} id={d.file} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">{d.title}</h2>
          {d.meta && <p className="mt-1 text-xs text-slate-400">{d.meta}</p>}
          {d.error && <p className="mt-2 rounded bg-red-50 p-2 text-xs text-red-600">렌더 오류: {d.error}</p>}
          {d.svgs.map((svg, i) => (
            <div
              key={i}
              className="mt-4 overflow-x-auto [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ))}
        </section>
      ))}
    </div>
  );
}
