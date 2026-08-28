"use client";

import { useCallback, useEffect, useState } from "react";
import AlertFeed from "@/components/AlertFeed";
import WatchCard from "@/components/WatchCard";
import WatchForm from "@/components/WatchForm";
import type { AlertDto, WatchDto, WatchFormInput } from "@/lib/apiTypes";

const POLL_MS = 30_000;

export default function Home() {
  const [watches, setWatches] = useState<WatchDto[]>([]);
  const [alerts, setAlerts] = useState<AlertDto[]>([]);
  const [editing, setEditing] = useState<WatchDto | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    const [wRes, aRes] = await Promise.all([fetch("/api/watches"), fetch("/api/alerts")]);
    if (wRes.ok) setWatches(((await wRes.json()) as { watches: WatchDto[] }).watches);
    if (aRes.ok) setAlerts(((await aRes.json()) as { alerts: AlertDto[] }).alerts);
    setLoaded(true);
  }, []);

  useEffect(() => {
    reload();
    const t = setInterval(reload, POLL_MS);
    return () => clearInterval(t);
  }, [reload]);

  const createWatch = async (input: WatchFormInput): Promise<string | null> => {
    const res = await fetch("/api/watches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) return ((await res.json()) as { error?: string }).error ?? "등록에 실패했습니다";
    await reload();
    return null;
  };

  const updateWatch = async (id: number, input: WatchFormInput): Promise<string | null> => {
    const res = await fetch(`/api/watches/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) return ((await res.json()) as { error?: string }).error ?? "저장에 실패했습니다";
    setEditing(null);
    await reload();
    return null;
  };

  const toggleWatch = async (w: WatchDto) => {
    await fetch(`/api/watches/${w.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: w.active !== 1 }),
    });
    await reload();
  };

  const deleteWatch = async (w: WatchDto) => {
    if (!confirm(`${w.origin}→${w.destination} (${w.depart_date}) 일정을 삭제할까요?\n수집된 가격·알림도 함께 삭제됩니다.`))
      return;
    await fetch(`/api/watches/${w.id}`, { method: "DELETE" });
    await reload();
  };

  const markRead = async (ids: number[]) => {
    await fetch("/api/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    await reload();
  };

  const manualScan = async () => {
    setScanBusy(true);
    setScanNote(null);
    try {
      const res = await fetch("/api/scan", { method: "POST" });
      const r = (await res.json()) as { scannedWatches: number; newAlerts: number; errors: string[] };
      setScanNote(
        `일정 ${r.scannedWatches}건 스캔, 새 알림 ${r.newAlerts}건` +
          (r.errors.length ? ` · 오류 ${r.errors.length}건: ${r.errors[0]}` : ""),
      );
      await reload();
    } finally {
      setScanBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16">
      {/* 히어로: 일정 등록 */}
      <section
        aria-label="여행 일정 등록"
        className="mt-6 rounded-3xl bg-gradient-to-br from-blue-600 via-blue-500 to-sky-400 p-1 shadow-xl shadow-blue-600/20"
      >
        <div className="rounded-[1.4rem] bg-white/95 p-4 backdrop-blur sm:p-6">
          <h1 className="flex items-center gap-2 text-xl font-extrabold text-slate-900">
            <i className="bi bi-search text-blue-600" aria-hidden />
            어디로 떠나시나요?
          </h1>
          <p className="mt-1 mb-4 text-sm text-slate-500">
            일정을 등록해두면 최저가를 계속 감시하다가, 목표가 이하 티켓이 뜨면 바로 알려드려요.
          </p>
          <WatchForm mode="create" onSubmit={createWatch} />
        </div>
      </section>

      {/* 본문: 일정 목록 + 알림 */}
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
        <section aria-label="내 여행 일정">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <i className="bi bi-card-list text-blue-600" aria-hidden />내 여행 일정
              <span className="text-sm font-semibold text-slate-400">{watches.length}</span>
            </h2>
            <button
              type="button"
              onClick={manualScan}
              disabled={scanBusy || watches.length === 0}
              className="ml-auto flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-400 hover:text-blue-600 disabled:opacity-50"
            >
              <i className={`bi bi-arrow-repeat ${scanBusy ? "animate-spin" : ""}`} aria-hidden />
              {scanBusy ? "스캔 중…" : "지금 스캔"}
            </button>
          </div>

          {scanNote && (
            <p className="mb-3 rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600">{scanNote}</p>
          )}

          {loaded && watches.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white/60 p-10 text-center text-slate-400">
              <i className="bi bi-airplane text-3xl" aria-hidden />
              <p className="mt-2 text-sm">
                등록된 여행 일정이 없습니다.
                <br />
                위에서 첫 일정을 등록해보세요!
              </p>
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {watches.map((w) => (
                <WatchCard key={w.id} watch={w} onEdit={setEditing} onDelete={deleteWatch} onToggle={toggleWatch} />
              ))}
            </div>
          )}
        </section>

        <AlertFeed alerts={alerts} onMarkRead={markRead} />
      </div>

      {/* 편집 모달 */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="여행 일정 편집"
          onClick={(e) => e.target === e.currentTarget && setEditing(null)}
        >
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6">
            <div className="mb-4 flex items-center gap-2">
              <i className="bi bi-pencil-square text-blue-600" aria-hidden />
              <h2 className="text-lg font-bold text-slate-900">일정 편집</h2>
              <span className="text-sm text-slate-400">
                {editing.origin} → {editing.destination}
              </span>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="ml-auto flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100"
                aria-label="닫기"
              >
                <i className="bi bi-x-lg" aria-hidden />
              </button>
            </div>
            <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <i className="bi bi-info-circle mr-1" aria-hidden />
              노선이나 날짜를 바꾸면 기존에 수집된 가격·알림 기록은 초기화됩니다.
            </p>
            <WatchForm
              mode="edit"
              initial={editing}
              onSubmit={(input) => updateWatch(editing.id, input)}
              onCancel={() => setEditing(null)}
            />
          </div>
        </div>
      )}
    </main>
  );
}
