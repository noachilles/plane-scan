"use client";

import { useEffect, useRef, useState } from "react";
import { fmtDateTime, won, type AlertDto } from "@/lib/apiTypes";

interface Props {
  alerts: AlertDto[];
  onMarkRead: (ids: number[]) => void;
}

export default function AlertFeed({ alerts, onMarkRead }: Props) {
  const [notifOn, setNotifOn] = useState(false);
  const seenIds = useRef<Set<number> | null>(null);

  useEffect(() => {
    if (typeof Notification !== "undefined") setNotifOn(Notification.permission === "granted");
  }, []);

  // 새 알림 브라우저 푸시 (첫 로드 분은 제외)
  useEffect(() => {
    if (seenIds.current === null) {
      seenIds.current = new Set(alerts.map((a) => a.id));
      return;
    }
    for (const a of alerts) {
      if (seenIds.current.has(a.id)) continue;
      seenIds.current.add(a.id);
      if (notifOn && typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(`✈️ ${a.origin}→${a.destination} ${won(a.price)}`, { body: a.message });
      }
    }
  }, [alerts, notifOn]);

  const requestNotif = async () => {
    if (typeof Notification === "undefined") return;
    const p = await Notification.requestPermission();
    setNotifOn(p === "granted");
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
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={requestNotif}
            className={`flex h-11 w-11 items-center justify-center rounded-xl transition ${
              notifOn ? "text-blue-600" : "text-slate-400 hover:bg-slate-100"
            }`}
            aria-label={notifOn ? "브라우저 알림 켜짐" : "브라우저 알림 허용"}
            title={notifOn ? "브라우저 알림 켜짐" : "브라우저 알림 허용"}
          >
            <i className={`bi ${notifOn ? "bi-bell" : "bi-bell-slash"}`} aria-hidden />
          </button>
          {unread.length > 0 && (
            <button
              type="button"
              onClick={() => onMarkRead(unread.map((a) => a.id))}
              className="h-11 rounded-xl px-3 text-xs font-semibold text-slate-500 transition hover:bg-slate-100"
            >
              모두 읽음
            </button>
          )}
        </div>
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
                a.read === 0 ? "border-blue-200 bg-blue-50/60" : "border-slate-100 bg-white"
              }`}
            >
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                {a.origin} → {a.destination}
                <span className="text-blue-600">{won(a.price)}</span>
                {a.read === 0 && <span className="h-2 w-2 rounded-full bg-blue-500" aria-label="안 읽음" />}
                <span className="ml-auto text-xs font-normal text-slate-400">{fmtDateTime(a.created_at)}</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">{a.message}</p>
              <div className="mt-2 flex items-center gap-2">
                <a
                  href={a.deeplink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 text-sm font-bold text-white transition hover:bg-blue-700"
                >
                  예매하러 가기 <i className="bi bi-arrow-right" aria-hidden />
                </a>
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
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
