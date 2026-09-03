"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AlertFeed from "@/components/AlertFeed";
import QuoteSheet from "@/components/QuoteSheet";
import RouteChips from "@/components/RouteChips";
import ScanStatus from "@/components/ScanStatus";
import WatchCard from "@/components/WatchCard";
import WatchForm, { type RoutePrefill } from "@/components/WatchForm";
import type {
  AlertDto,
  FavoriteRouteDto,
  RecentRouteDto,
  ScannerStatusDto,
  WatchDto,
  WatchFormInput,
} from "@/lib/apiTypes";

const FALLBACK_POLL_MS = 60_000;

type Quoting =
  | { mode: "create"; input: Omit<WatchFormInput, "maxPrice"> }
  | { mode: "retarget"; watch: WatchDto; input: Omit<WatchFormInput, "maxPrice"> };

const jsonHeaders = { "Content-Type": "application/json" };

export default function Home() {
  const [watches, setWatches] = useState<WatchDto[]>([]);
  const [alerts, setAlerts] = useState<AlertDto[]>([]);
  const [favorites, setFavorites] = useState<FavoriteRouteDto[]>([]);
  const [recent, setRecent] = useState<RecentRouteDto[]>([]);
  const [status, setStatus] = useState<ScannerStatusDto | null>(null);
  const [editing, setEditing] = useState<WatchDto | null>(null);
  const [quoting, setQuoting] = useState<Quoting | null>(null);
  const [prefill, setPrefill] = useState<RoutePrefill | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const prefillKey = useRef(0);

  const loadWatches = useCallback(async () => {
    const res = await fetch("/api/watches");
    if (res.ok) setWatches(((await res.json()) as { watches: WatchDto[] }).watches);
  }, []);
  const loadAlerts = useCallback(async () => {
    const res = await fetch("/api/alerts");
    if (res.ok) setAlerts(((await res.json()) as { alerts: AlertDto[] }).alerts);
  }, []);
  const loadRoutes = useCallback(async () => {
    const res = await fetch("/api/routes");
    if (res.ok) {
      const body = (await res.json()) as { favorites: FavoriteRouteDto[]; recent: RecentRouteDto[] };
      setFavorites(body.favorites);
      setRecent(body.recent);
    }
  }, []);
  const loadStatus = useCallback(async () => {
    const res = await fetch("/api/status");
    if (res.ok) setStatus((await res.json()) as ScannerStatusDto);
  }, []);
  const reloadAll = useCallback(async () => {
    await Promise.all([loadWatches(), loadAlerts(), loadRoutes(), loadStatus()]);
    setLoaded(true);
  }, [loadWatches, loadAlerts, loadRoutes, loadStatus]);

  // 초기 로드 + SSE 실시간 갱신 (+ 안전망 폴링)
  useEffect(() => {
    reloadAll();
    const poll = setInterval(reloadAll, FALLBACK_POLL_MS);

    const es = new EventSource("/api/events");
    es.onmessage = (ev) => {
      const e = JSON.parse(ev.data) as { type: string; status?: ScannerStatusDto; watchId?: number; scanning?: boolean };
      switch (e.type) {
        case "status":
          if (e.status) setStatus(e.status);
          break;
        case "watch:scanning":
          setStatus((s) => {
            if (!s || e.watchId === undefined) return s;
            const ids = new Set(s.scanningWatchIds);
            if (e.scanning) ids.add(e.watchId);
            else ids.delete(e.watchId);
            return { ...s, scanningWatchIds: [...ids], scanning: s.scanning || ids.size > 0 };
          });
          break;
        case "watch:updated":
          loadWatches();
          break;
        case "scan:start":
        case "scan:done":
          loadStatus();
          loadWatches();
          break;
        case "alert:new":
        case "alert:updated":
          loadAlerts();
          loadWatches();
          break;
      }
    };
    return () => {
      clearInterval(poll);
      es.close();
    };
  }, [reloadAll, loadWatches, loadAlerts, loadStatus]);

  /* ---------- 일정 등록/편집 ---------- */

  const postWatch = async (input: WatchFormInput & { maxPrice: number }): Promise<string | null> => {
    const res = await fetch("/api/watches", { method: "POST", headers: jsonHeaders, body: JSON.stringify(input) });
    if (!res.ok) return ((await res.json()) as { error?: string }).error ?? "등록에 실패했습니다";
    await Promise.all([loadWatches(), loadRoutes()]);
    return null;
  };

  const createWatch = async (input: WatchFormInput): Promise<string | null> => {
    if (input.maxPrice === null) {
      // 목표가가 비어 있음 → 현재 최저가를 먼저 찾고 제안
      const { maxPrice: _omit, ...rest } = input;
      void _omit;
      setQuoting({ mode: "create", input: rest });
      return null;
    }
    return postWatch({ ...input, maxPrice: input.maxPrice });
  };

  const updateWatch = async (id: number, patch: Partial<WatchFormInput> & { active?: boolean }): Promise<string | null> => {
    const res = await fetch(`/api/watches/${id}`, { method: "PATCH", headers: jsonHeaders, body: JSON.stringify(patch) });
    if (!res.ok) return ((await res.json()) as { error?: string }).error ?? "저장에 실패했습니다";
    await loadWatches();
    return null;
  };

  const saveEdit = async (input: WatchFormInput): Promise<string | null> => {
    if (!editing || input.maxPrice === null) return "목표가를 입력해주세요";
    const err = await updateWatch(editing.id, { ...input, maxPrice: input.maxPrice });
    if (!err) setEditing(null);
    return err;
  };

  const toggleWatch = (w: WatchDto) => updateWatch(w.id, { active: w.active !== 1 });

  const deleteWatch = async (w: WatchDto) => {
    if (!confirm(`${w.origin}→${w.destination} (${w.depart_date}) 일정을 삭제할까요?\n수집된 가격·알림도 함께 삭제됩니다.`)) return;
    await fetch(`/api/watches/${w.id}`, { method: "DELETE" });
    await Promise.all([loadWatches(), loadAlerts()]);
  };

  const retarget = (w: WatchDto) =>
    setQuoting({
      mode: "retarget",
      watch: w,
      input: {
        origin: w.origin,
        destination: w.destination,
        departDate: w.depart_date,
        returnDate: w.return_date,
        timeFrom: w.time_from,
        timeTo: w.time_to,
        returnTimeFrom: w.return_time_from,
        returnTimeTo: w.return_time_to,
        directOnly: w.direct_only === 1,
      },
    });

  const confirmQuote = async (
    maxPrice: number,
    window: { timeFrom: string; timeTo: string; returnTimeFrom: string | null; returnTimeTo: string | null },
  ): Promise<string | null> => {
    if (!quoting) return null;
    // 시트에서 시간대를 넓혔다면 일정에도 그대로 반영한다
    const err =
      quoting.mode === "create"
        ? await postWatch({ ...quoting.input, ...window, maxPrice })
        : await updateWatch(quoting.watch.id, { maxPrice, ...window });
    if (!err) setQuoting(null);
    return err;
  };

  /* ---------- 알림 ---------- */

  const markRead = async (ids: number[]) => {
    await fetch("/api/alerts", { method: "PATCH", headers: jsonHeaders, body: JSON.stringify({ ids }) });
    await Promise.all([loadAlerts(), loadWatches()]);
  };

  const dismissAlerts = async (ids: number[]) => {
    await fetch("/api/alerts", { method: "PATCH", headers: jsonHeaders, body: JSON.stringify({ ids, action: "dismiss" }) });
    await Promise.all([loadAlerts(), loadWatches()]);
  };

  /* ---------- 즐겨찾기 노선 ---------- */

  const pickRoute = (origin: string, destination: string) => {
    prefillKey.current += 1;
    setPrefill({ origin, destination, key: prefillKey.current });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveRoute = async (origin: string, destination: string) => {
    const label = prompt(`${origin} → ${destination} 노선을 저장합니다.\n별칭을 붙이시겠어요? (예: 본가, 오사카 출장 — 비워도 됩니다)`);
    if (label === null) return;
    await fetch("/api/routes", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ origin, destination, label: label || null }) });
    await loadRoutes();
  };

  const renameRoute = async (r: FavoriteRouteDto) => {
    const label = prompt("노선 별칭", r.label ?? "");
    if (label === null) return;
    await fetch(`/api/routes/${r.id}`, { method: "PATCH", headers: jsonHeaders, body: JSON.stringify({ label: label || null }) });
    await loadRoutes();
  };

  const deleteRoute = async (r: FavoriteRouteDto) => {
    if (!confirm(`${r.label ? `${r.label} (${r.origin}→${r.destination})` : `${r.origin}→${r.destination}`} 즐겨찾기를 삭제할까요?`)) return;
    await fetch(`/api/routes/${r.id}`, { method: "DELETE" });
    await loadRoutes();
  };

  /* ---------- 수동 스캔 ---------- */

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
      await reloadAll();
    } finally {
      setScanBusy(false);
    }
  };

  const scanningIds = new Set(status?.scanningWatchIds ?? []);

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
            일정을 등록해두면 최저가를 계속 감시하다가, 목표가 이하 티켓이 뜨면 바로 알려드려요. 목표가를 모르겠다면
            비워두세요 — 현재 최저가를 먼저 찾아드립니다.
          </p>
          <RouteChips
            favorites={favorites}
            recent={recent}
            onPick={pickRoute}
            onSave={saveRoute}
            onRename={renameRoute}
            onDelete={deleteRoute}
          />
          <WatchForm mode="create" prefill={prefill} onSubmit={createWatch} onSaveRoute={saveRoute} />
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
            <ScanStatus status={status} />
            <button
              type="button"
              onClick={manualScan}
              disabled={scanBusy || status?.scanning || watches.length === 0}
              className="ml-auto flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-400 hover:text-blue-600 disabled:opacity-50"
              title="자동 감시와 별개로 지금 바로 한 번 더 확인"
            >
              <i className={`bi bi-arrow-repeat ${scanBusy ? "animate-spin" : ""}`} aria-hidden />
              {scanBusy ? "스캔 중…" : "지금 확인"}
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
                <WatchCard
                  key={w.id}
                  watch={w}
                  scanning={scanningIds.has(w.id)}
                  onEdit={setEditing}
                  onDelete={deleteWatch}
                  onToggle={toggleWatch}
                  onRetarget={retarget}
                  onSaveRoute={saveRoute}
                />
              ))}
            </div>
          )}
        </section>

        <AlertFeed
          alerts={alerts}
          onMarkRead={markRead}
          onDismiss={dismissAlerts}
          onRefresh={() => {
            loadAlerts();
            loadWatches();
          }}
        />
      </div>

      {/* 목표가 제안 시트 */}
      {quoting && (
        <QuoteSheet
          input={quoting.input}
          title={quoting.mode === "create" ? "현재 최저가를 찾았어요" : "목표가 다시 정하기"}
          confirmLabel={quoting.mode === "create" ? "감시 시작" : "목표가 변경"}
          onConfirm={confirmQuote}
          onCancel={() => setQuoting(null)}
        />
      )}

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
              노선이나 날짜를 바꾸면 기존에 수집된 가격·알림 기록은 초기화되고, 저장 즉시 다시 검색합니다.
            </p>
            <WatchForm mode="edit" initial={editing} onSubmit={saveEdit} onCancel={() => setEditing(null)} />
          </div>
        </div>
      )}
    </main>
  );
}
