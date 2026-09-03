"use client";

import { useEffect, useState } from "react";
import { won, type FareDto, type QuoteDto, type WatchFormInput } from "@/lib/apiTypes";

/**
 * "선택 조건(노선·날짜·시간대)의 현재 최저가 → 이보다 싼 가격을 원하시나요?" 시트.
 * 목표가 없이 등록을 시도했거나, 카드에서 목표가를 다시 정할 때 연다.
 *
 * 최저가·제안 비율은 항상 "선택 시간대 안" 편 기준. 시간대 안에 편이 없으면
 * 전체 최저가로 조용히 바꾸지 않고, 시간대를 넓혀 다시 찾도록 안내한다.
 */

export interface QuoteWindow {
  timeFrom: string;
  timeTo: string;
  returnTimeFrom: string | null;
  returnTimeTo: string | null;
}

interface Props {
  input: Omit<WatchFormInput, "maxPrice">;
  title?: string;
  confirmLabel?: string;
  onConfirm: (maxPrice: number, window: QuoteWindow) => Promise<string | null> | void;
  onCancel: () => void;
}

type Choice = "5" | "10" | "20" | "any" | "custom";

const roundDown100 = (n: number) => Math.max(100, Math.floor(n / 100) * 100);
const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`);
const TO_OPTIONS = [...HOURS.slice(1), "23:59"];

export default function QuoteSheet({ input, title, confirmLabel, onConfirm, onCancel }: Props) {
  const [win, setWin] = useState<QuoteWindow>({
    timeFrom: input.timeFrom,
    timeTo: input.timeTo,
    returnTimeFrom: input.returnDate ? (input.returnTimeFrom ?? "00:00") : null,
    returnTimeTo: input.returnDate ? (input.returnTimeTo ?? "23:59") : null,
  });
  const [draftWin, setDraftWin] = useState(win);
  const [quote, setQuote] = useState<QuoteDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<Choice>("10");
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setQuote(null);
    setError(null);
    (async () => {
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, ...win }),
      });
      const body = (await res.json()) as QuoteDto & { error?: string };
      if (cancelled) return;
      if (!res.ok) setError(body.error ?? "현재 최저가를 가져오지 못했습니다");
      else setQuote(body);
    })().catch((e) => !cancelled && setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [input, win]);

  // 제안 기준은 오직 "선택 시간대 안" 최저가
  const base: FareDto | null = quote?.lowestInWindow ?? null;
  const outside = quote?.lowest && (!base || quote.lowest.price < base.price) ? quote.lowest : null;

  const target = (() => {
    if (choice === "custom") {
      const n = Number(custom.replaceAll(",", ""));
      return Number.isInteger(n) && n > 0 ? n : null;
    }
    if (!base) return null;
    switch (choice) {
      case "5":
        return roundDown100(base.price * 0.95);
      case "10":
        return roundDown100(base.price * 0.9);
      case "20":
        return roundDown100(base.price * 0.8);
      case "any":
        return base.price;
    }
  })();

  const confirm = async () => {
    if (target === null) return;
    setBusy(true);
    const err = await onConfirm(target, win);
    setBusy(false);
    if (err) setError(err);
  };

  const optionCls = (active: boolean) =>
    `flex h-11 items-center justify-between rounded-xl border px-4 text-sm font-semibold transition ${
      active ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-700 hover:border-blue-300"
    }`;
  const selectCls =
    "h-11 rounded-xl border border-slate-200 bg-white px-2 text-sm font-medium text-slate-900 outline-none focus:border-blue-500";

  const customRow = (
    <div className="mt-4 flex items-center gap-2">
      <div className="relative flex-1">
        <input
          inputMode="numeric"
          value={custom}
          onChange={(e) => {
            setCustom(e.target.value.replace(/[^\d,]/g, ""));
            setChoice("custom");
          }}
          placeholder="목표가 직접 입력"
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 pr-8 text-sm outline-none focus:border-blue-500"
        />
        <span className="absolute top-1/2 right-3 -translate-y-1/2 text-sm text-slate-400">원</span>
      </div>
      <button
        type="button"
        disabled={choice !== "custom" || target === null || busy}
        onClick={confirm}
        className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
      >
        {confirmLabel ?? "감시 시작"}
      </button>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="목표가 정하기"
      onClick={(e) => e.target === e.currentTarget && !busy && onCancel()}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6">
        <div className="mb-1 flex items-center gap-2">
          <i className="bi bi-tag text-blue-600" aria-hidden />
          <h2 className="text-lg font-bold text-slate-900">{title ?? "목표가 정하기"}</h2>
          <button
            type="button"
            onClick={onCancel}
            className="ml-auto flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100"
            aria-label="닫기"
          >
            <i className="bi bi-x-lg" aria-hidden />
          </button>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          {input.origin} → {input.destination} · {input.departDate}
          {input.returnDate ? ` ~ ${input.returnDate}` : " (편도)"} ·{" "}
          <strong className="text-slate-700">
            가는편 {win.timeFrom}~{win.timeTo}
            {win.returnTimeFrom && ` · 오는편 ${win.returnTimeFrom}~${win.returnTimeTo}`}
          </strong>
          {input.directOnly && " · 직항만"} 기준
        </p>

        {!quote && !error && (
          <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-6 text-sm text-slate-600">
            <i className="bi bi-arrow-repeat animate-spin text-xl text-blue-600" aria-hidden />
            <div>
              <p className="font-semibold">선택 조건의 현재 최저가를 찾는 중…</p>
              <p className="text-xs text-slate-400">실제 항공권 조회는 최대 1분 정도 걸릴 수 있어요.</p>
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-600" role="alert">
            <i className="bi bi-exclamation-triangle mr-1" aria-hidden />
            {error}
          </p>
        )}

        {/* 시간대 안에 편이 없는 경우 — 폴백하지 않고 시간대 조정 유도 */}
        {quote && !base && !error && (
          <div className="space-y-3">
            <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <p className="font-bold">
                <i className="bi bi-clock-history mr-1" aria-hidden />
                {win.timeFrom}~{win.timeTo} 출발 편이 없어요
              </p>
              <p className="mt-0.5 text-xs">
                조회된 요금 {quote.fareCount}건이 모두 선택 시간대 밖입니다. 시간대를 넓혀 다시 찾아보세요.
              </p>
              {outside && (
                <p className="mt-1 text-xs text-amber-700/80">
                  참고 (시간대 밖): 전체 최저가 {won(outside.price)} · {outside.airline} {outside.departTime} 출발
                </p>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-12 text-xs font-semibold text-slate-500">가는편</span>
                <select
                  aria-label="가는편 출발 시간대 시작"
                  className={selectCls}
                  value={draftWin.timeFrom}
                  onChange={(e) => setDraftWin((d) => ({ ...d, timeFrom: e.target.value }))}
                >
                  {HOURS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                <span className="text-sm text-slate-400">~</span>
                <select
                  aria-label="가는편 출발 시간대 끝"
                  className={selectCls}
                  value={draftWin.timeTo}
                  onChange={(e) => setDraftWin((d) => ({ ...d, timeTo: e.target.value }))}
                >
                  {TO_OPTIONS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
              {draftWin.returnTimeFrom && (
                <div className="flex items-center gap-2">
                  <span className="w-12 text-xs font-semibold text-slate-500">오는편</span>
                  <select
                    aria-label="오는편 출발 시간대 시작"
                    className={selectCls}
                    value={draftWin.returnTimeFrom}
                    onChange={(e) => setDraftWin((d) => ({ ...d, returnTimeFrom: e.target.value }))}
                  >
                    {HOURS.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                  <span className="text-sm text-slate-400">~</span>
                  <select
                    aria-label="오는편 출발 시간대 끝"
                    className={selectCls}
                    value={draftWin.returnTimeTo ?? "23:59"}
                    onChange={(e) => setDraftWin((d) => ({ ...d, returnTimeTo: e.target.value }))}
                  >
                    {TO_OPTIONS.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </div>
              )}
              <button
                type="button"
                disabled={
                  draftWin.timeFrom > draftWin.timeTo ||
                  Boolean(draftWin.returnTimeFrom && draftWin.returnTimeTo && draftWin.returnTimeFrom > draftWin.returnTimeTo)
                }
                onClick={() => setWin(draftWin)}
                className="flex h-11 items-center gap-1.5 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                <i className="bi bi-search" aria-hidden />
                이 시간대로 다시 찾기
              </button>
            </div>
            <p className="text-xs text-slate-400">시간대를 바꾸면 등록되는 일정에도 그대로 적용됩니다.</p>
            {customRow}
          </div>
        )}

        {base && (
          <>
            <div className="rounded-2xl bg-emerald-50 px-4 py-3">
              <p className="text-xs font-semibold text-emerald-700">
                선택 시간대(가는 {win.timeFrom}~{win.timeTo}
                {win.returnTimeFrom && ` · 오는 ${win.returnTimeFrom}~${win.returnTimeTo}`}) 내 현재 최저가
              </p>
              <p className="mt-0.5 text-2xl font-extrabold text-emerald-700">{won(base.price)}</p>
              <p className="text-sm text-emerald-800">
                {base.airline}
                {base.flightNo ? ` ${base.flightNo}` : ""} · {base.departTime} 출발
                {base.returnDepartTime ? ` · 귀가 ${base.returnDepartTime}` : base.arriveTime ? ` → ${base.arriveTime} 도착` : ""}
                {base.stops !== null && ` · ${base.stops === 0 ? "직항" : `경유 ${base.stops}회`}`} · 요금 {quote?.fareCount}건 조회
              </p>
              {outside && (
                <p className="mt-1 border-t border-emerald-100 pt-1 text-xs text-emerald-700/70">
                  참고: 시간대 밖 최저가 {won(outside.price)} ({outside.departTime} 출발) — 제안 기준에는 쓰지 않아요
                </p>
              )}
            </div>

            <p className="mt-4 mb-2 text-sm font-bold text-slate-900">이보다 싼 가격을 원하시나요?</p>
            <div className="grid gap-2">
              {(
                [
                  ["5", "5% 싸지면 알림", roundDown100(base.price * 0.95)],
                  ["10", "10% 싸지면 알림", roundDown100(base.price * 0.9)],
                  ["20", "20% 싸지면 알림", roundDown100(base.price * 0.8)],
                  ["any", "현재가 이하면 바로 알림", base.price],
                ] as const
              ).map(([key, label, price]) => (
                <button key={key} type="button" onClick={() => setChoice(key)} className={optionCls(choice === key)}>
                  <span>{label}</span>
                  <span className="text-slate-500">{won(price)} 이하</span>
                </button>
              ))}
              <div className={optionCls(choice === "custom")} onClick={() => setChoice("custom")}>
                <span>직접 입력</span>
                <div className="relative">
                  <input
                    inputMode="numeric"
                    value={custom}
                    onFocus={() => setChoice("custom")}
                    onChange={(e) => setCustom(e.target.value.replace(/[^\d,]/g, ""))}
                    placeholder={String(roundDown100(base.price * 0.9))}
                    className="h-8 w-32 rounded-lg border border-slate-200 bg-white px-2 pr-6 text-right text-sm outline-none focus:border-blue-500"
                  />
                  <span className="absolute top-1/2 right-2 -translate-y-1/2 text-xs text-slate-400">원</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={target === null || busy}
              onClick={confirm}
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? <i className="bi bi-arrow-repeat animate-spin" aria-hidden /> : <i className="bi bi-binoculars" aria-hidden />}
              {target !== null ? `${won(target)} 이하로 ${confirmLabel ?? "감시 시작"}` : "목표가를 입력해주세요"}
            </button>
          </>
        )}

        {error && customRow}
      </div>
    </div>
  );
}
