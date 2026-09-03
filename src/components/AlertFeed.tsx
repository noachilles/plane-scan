"use client";

import { useEffect, useRef, useState } from "react";
import { fmtDateTime, fmtDuration, timeAgo, won, type AlertDto } from "@/lib/apiTypes";
import { partnerName } from "@/lib/partners";

interface Props {
  alerts: AlertDto[];
  onMarkRead: (ids: number[]) => void;
  onDismiss: (ids: number[]) => void;
  onRefresh: () => void;
}

const STALE_MS = 30 * 60_000;

/** selectedFlight 등 편 지정 파라미터(및 /detail/ 경로)를 뗀 기본 검색 URL */
function baseSearchUrl(deeplink: string): string {
  return `${deeplink.split("?")[0].replace("/international/detail/", "/international/")}?adult=1&fareType=Y`;
}

function isStale(a: AlertDto): boolean {
  const ref = a.verified_at ?? a.created_at;
  const d = new Date(ref.includes("T") ? ref : ref.replace(" ", "T"));
  return !Number.isNaN(d.getTime()) && Date.now() - d.getTime() > STALE_MS;
}

type PushState = "unsupported" | "off" | "on" | "busy";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function flightSummary(a: AlertDto): string {
  const extras = [
    a.stops !== null ? (a.stops === 0 ? "직항" : `경유 ${a.stops}회`) : null,
    fmtDuration(a.duration_min),
  ].filter(Boolean);
  return (
    `${a.airline}${a.flight_no ? ` ${a.flight_no}` : ""} · ${a.depart_time} 출발` +
    (a.return_depart_time ? ` · 귀가 ${a.return_depart_time}` : a.arrive_time ? ` → ${a.arrive_time} 도착` : "") +
    (extras.length ? ` · ${extras.join("·")}` : "") +
    (a.agency ? ` · 판매처 ${partnerName(a.agency)}` : "")
  );
}

export default function AlertFeed({ alerts, onMarkRead, onDismiss, onRefresh }: Props) {
  const [push, setPush] = useState<PushState>("off");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [verifyingId, setVerifyingId] = useState<number | null>(null);
  const seenIds = useRef<Set<number> | null>(null);

  const verifyPrice = async (a: AlertDto) => {
    setVerifyingId(a.id);
    try {
      const res = await fetch(`/api/alerts/${a.id}/verify`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        alert(body.error ?? "가격 확인에 실패했습니다");
      }
      onRefresh();
    } finally {
      setVerifyingId(null);
    }
  };

  // 기존 푸시 구독 여부 확인
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPush("unsupported");
      return;
    }
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => setPush(sub ? "on" : "off"))
      .catch(() => setPush("off"));
  }, []);

  // 푸시가 꺼져 있고 권한만 있는 경우: 탭이 열려 있을 때 인페이지 알림 (첫 로드 분은 제외)
  useEffect(() => {
    if (seenIds.current === null) {
      seenIds.current = new Set(alerts.map((a) => a.id));
      return;
    }
    for (const a of alerts) {
      if (seenIds.current.has(a.id)) continue;
      seenIds.current.add(a.id);
      if (push !== "on" && typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(`✈️ ${a.origin}→${a.destination} ${won(a.price)}`, { body: a.message });
      }
    }
  }, [alerts, push]);

  const enablePush = async () => {
    setPush("busy");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setPush("off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const { publicKey } = (await (await fetch("/api/push/key")).json()) as { publicKey: string };
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      setPush("on");
    } catch (e) {
      console.warn("push subscribe failed", e);
      setPush("off");
    }
  };

  const disablePush = async () => {
    setPush("busy");
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
    } finally {
      setPush("off");
    }
  };

  const copyFlight = async (a: AlertDto) => {
    const text = `${a.origin}→${a.destination} ${a.depart_date}${a.return_date ? `~${a.return_date}` : ""} | ${flightSummary(a)} | ${won(a.price)}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(a.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      /* clipboard 미지원 */
    }
  };

  const unread = alerts.filter((a) => a.read === 0);

  return (
    <section aria-label="알림" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center gap-2">
        <i className="bi bi-bell-fill text-amber-500" aria-hidden />
        <h2 className="text-base font-bold text-slate-900">알림</h2>
        {unread.length > 0 && (
          <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">{unread.length}</span>
        )}
        {alerts.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (confirm(`알림 ${alerts.length}건을 모두 지울까요?\n(같은 특가가 곧바로 다시 알림되지는 않습니다)`))
                onDismiss(alerts.map((a) => a.id));
            }}
            className="ml-auto flex h-11 items-center gap-1 rounded-xl px-3 text-xs font-semibold text-slate-500 transition hover:bg-slate-100"
          >
            <i className="bi bi-trash3" aria-hidden />
            모두 지우기
          </button>
        )}
      </div>

      {/* 푸시 토글 — 탭을 닫아도 OS 알림 */}
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
        <i className={`bi ${push === "on" ? "bi-phone-vibrate text-blue-600" : "bi-phone text-slate-400"}`} aria-hidden />
        <div className="min-w-0 flex-1 text-xs">
          <p className="font-semibold text-slate-700">
            {push === "on" ? "푸시 알림 켜짐" : push === "unsupported" ? "이 브라우저는 푸시 미지원" : "푸시 알림 꺼짐"}
          </p>
          <p className="truncate text-slate-400">
            {push === "on" ? "탭을 닫아도 특가가 뜨면 바로 알려드려요" : "켜두면 탭을 닫아도 알림이 도착해요"}
          </p>
        </div>
        {push !== "unsupported" && (
          <button
            type="button"
            role="switch"
            aria-checked={push === "on"}
            aria-label="푸시 알림 켜기/끄기"
            disabled={push === "busy"}
            onClick={push === "on" ? disablePush : enablePush}
            className={`relative h-7 w-12 shrink-0 rounded-full transition ${push === "on" ? "bg-blue-600" : "bg-slate-300"} disabled:opacity-50`}
          >
            <span
              className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${push === "on" ? "left-6" : "left-1"}`}
            />
          </button>
        )}
      </div>

      {alerts.length === 0 ? (
        <p className="mt-6 pb-4 text-center text-sm text-slate-400">
          아직 알림이 없습니다.
          <br />
          목표가에 도달하면 여기에 표시됩니다.
        </p>
      ) : (
        <ul className="mt-3 max-h-[34rem] space-y-2 overflow-y-auto pr-1">
          {alerts.map((a) => (
            <li
              key={a.id}
              className={`rounded-xl border p-3 ${
                a.expired === 1
                  ? "border-slate-200 bg-slate-50 opacity-80"
                  : a.read === 0
                    ? "border-blue-200 bg-blue-50/60"
                    : "border-slate-100 bg-white"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-900">
                {a.origin} → {a.destination}
                <span className={a.expired === 1 ? "text-slate-400 line-through" : "text-blue-600"}>{won(a.price)}</span>
                {a.expired === 1 && (
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600">특가 종료</span>
                )}
                {a.source === "mock" && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">모의 데이터</span>
                )}
                {a.read === 0 && a.expired === 0 && <span className="h-2 w-2 rounded-full bg-blue-500" aria-label="안 읽음" />}
                <span className="ml-auto text-xs font-normal text-slate-400">{fmtDateTime(a.created_at)}</span>
              </div>

              {/* 가격 신선도 */}
              <p className="mt-1 text-[11px] text-slate-400">
                {a.expired === 1 ? (
                  <>
                    이 특가는 사라졌어요
                    {a.latest_price !== null && a.latest_price !== a.price && (
                      <> · 지금 이 편은 {won(a.latest_price)}</>
                    )}
                  </>
                ) : isStale(a) ? (
                  <span className="font-semibold text-amber-600">
                    <i className="bi bi-exclamation-triangle mr-0.5" aria-hidden />
                    {timeAgo(a.verified_at ?? a.created_at)} 확인된 가격 — 지금은 다를 수 있어요
                  </span>
                ) : (
                  <span className="text-emerald-600">
                    <i className="bi bi-check-circle mr-0.5" aria-hidden />
                    {timeAgo(a.verified_at ?? a.created_at)} 확인된 가격
                  </span>
                )}
                {a.source === "mock" && <span className="ml-1 text-amber-600">· 개발용 모의 가격이라 실제와 무관해요</span>}
              </p>

              {/* 편 정보 — 네이버에서 바로 찾을 수 있도록 */}
              <div className="mt-1.5 rounded-lg bg-white/80 px-2.5 py-2 text-xs text-slate-700 ring-1 ring-slate-100">
                <p className="font-semibold">
                  <i className="bi bi-airplane mr-1 text-blue-500" aria-hidden />
                  {flightSummary(a)}
                </p>
                <p className="mt-0.5 text-slate-500">
                  {a.depart_date}
                  {a.return_date ? ` ~ ${a.return_date} 왕복` : " 편도"} ·{" "}
                  {a.deeplink.includes("selectedFlight=")
                    ? "링크를 열면 이 편이 선택된 상태로 열려요"
                    : `네이버에서 항공사 “${a.airline}” → ${a.depart_time} 출발 편을 고르세요`}
                </p>
              </div>

              <div className="mt-2 flex items-center gap-2">
                <a
                  href={a.expired === 1 ? baseSearchUrl(a.deeplink) : (a.booking_url ?? a.deeplink)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl text-sm font-bold transition ${
                    a.expired === 1 || a.source === "mock"
                      ? "border border-slate-300 bg-white text-slate-500 hover:bg-slate-50"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                  title={a.booking_url && a.expired === 0 ? "판매처 예매 페이지로 직행 — 링크가 오래되면 🔄로 갱신" : undefined}
                >
                  {a.expired === 1
                    ? "네이버에서 현재 가격 보기"
                    : a.booking_url
                      ? `바로 예매하기${a.booking_partner ? ` · ${partnerName(a.booking_partner)}` : ""}`
                      : a.deeplink.includes("selectedFlight=")
                        ? "이 편 바로 열기"
                        : "예매하러 가기"}{" "}
                  <i className="bi bi-arrow-right" aria-hidden />
                </a>
                {a.expired === 0 && a.booking_url && (
                  <a
                    href={a.deeplink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-11 items-center justify-center rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                    title="네이버 항공권에서 이 편 보기 (판매처 비교)"
                  >
                    네이버
                  </a>
                )}
                {a.expired === 0 && !a.booking_url && a.deeplink.includes("selectedFlight=") && (
                  <a
                    href={baseSearchUrl(a.deeplink)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-11 items-center justify-center rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                    title="편 지정 없이 전체 검색 결과 열기 (상세가 비어 보일 때)"
                  >
                    전체 결과
                  </a>
                )}
                {a.expired === 0 && (
                  <button
                    type="button"
                    onClick={() => verifyPrice(a)}
                    disabled={verifyingId !== null}
                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-50"
                    aria-label="가격 다시 확인"
                    title="가격 다시 확인 (즉시 재조회)"
                  >
                    <i className={`bi bi-arrow-clockwise ${verifyingId === a.id ? "animate-spin" : ""}`} aria-hidden />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => copyFlight(a)}
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50"
                  aria-label="편 정보 복사"
                  title="편 정보 복사"
                >
                  <i className={`bi ${copiedId === a.id ? "bi-clipboard-check text-emerald-600" : "bi-clipboard"}`} aria-hidden />
                </button>
                {a.read === 0 && (
                  <button
                    type="button"
                    onClick={() => onMarkRead([a.id])}
                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50"
                    aria-label="읽음 처리"
                    title="읽음 처리"
                  >
                    <i className="bi bi-check2" aria-hidden />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onDismiss([a.id])}
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:bg-red-50 hover:text-red-500"
                  aria-label="알림 지우기"
                  title="알림 지우기"
                >
                  <i className="bi bi-x-lg" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
