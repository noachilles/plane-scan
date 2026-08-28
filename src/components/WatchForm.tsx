"use client";

import { useState } from "react";
import { AIRPORTS } from "@/lib/airports";
import type { WatchDto, WatchFormInput } from "@/lib/apiTypes";

const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`);
const TIME_FROM_OPTIONS = HOURS;
const TIME_TO_OPTIONS = [...HOURS.slice(1), "23:59"];

interface Props {
  mode: "create" | "edit";
  initial?: WatchDto;
  onSubmit: (input: WatchFormInput) => Promise<string | null>;
  onCancel?: () => void;
}

export default function WatchForm({ mode, initial, onSubmit, onCancel }: Props) {
  const [origin, setOrigin] = useState(initial?.origin ?? "ICN");
  const [destination, setDestination] = useState(initial?.destination ?? "");
  const [roundTrip, setRoundTrip] = useState(initial ? initial.return_date !== null : true);
  const [departDate, setDepartDate] = useState(initial?.depart_date ?? "");
  const [returnDate, setReturnDate] = useState(initial?.return_date ?? "");
  const [timeFrom, setTimeFrom] = useState(initial?.time_from ?? "00:00");
  const [timeTo, setTimeTo] = useState(initial?.time_to ?? "23:59");
  const [maxPrice, setMaxPrice] = useState(initial ? String(initial.max_price) : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const swap = () => {
    setOrigin(destination);
    setDestination(origin);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const price = Number(maxPrice.replaceAll(",", ""));
    if (!Number.isInteger(price) || price <= 0) {
      setError("목표가를 숫자로 입력해주세요");
      return;
    }
    if (roundTrip && !returnDate) {
      setError("왕복이면 오는 날을 선택해주세요");
      return;
    }

    setBusy(true);
    const err = await onSubmit({
      origin: origin.trim().toUpperCase(),
      destination: destination.trim().toUpperCase(),
      departDate,
      returnDate: roundTrip ? returnDate : null,
      timeFrom,
      timeTo,
      maxPrice: price,
    });
    setBusy(false);

    if (err) {
      setError(err);
      return;
    }
    if (mode === "create") {
      setDestination("");
      setMaxPrice("");
    }
  };

  const labelCls = "mb-1 block text-xs font-semibold text-slate-500";
  const inputCls =
    "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <datalist id="airport-options">
        {AIRPORTS.map((a) => (
          <option key={a.code} value={a.code}>
            {a.name}
          </option>
        ))}
      </datalist>

      {/* 편도/왕복 */}
      <div className="flex gap-2" role="radiogroup" aria-label="여정 종류">
        {(
          [
            [true, "왕복"],
            [false, "편도"],
          ] as const
        ).map(([rt, label]) => (
          <button
            key={label}
            type="button"
            role="radio"
            aria-checked={roundTrip === rt}
            onClick={() => setRoundTrip(rt)}
            className={`h-11 rounded-full px-5 text-sm font-semibold transition ${
              roundTrip === rt ? "bg-blue-600 text-white shadow" : "bg-white/70 text-slate-600 hover:bg-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 노선 + 날짜 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_auto_1fr_1fr_1fr]">
        <div>
          <label className={labelCls} htmlFor="origin">
            출발지
          </label>
          <input
            id="origin"
            list="airport-options"
            className={inputCls}
            value={origin}
            onChange={(e) => setOrigin(e.target.value.toUpperCase())}
            placeholder="ICN"
            maxLength={3}
            required
          />
        </div>

        <div className="hidden items-end lg:flex">
          <button
            type="button"
            onClick={swap}
            aria-label="출발지와 도착지 바꾸기"
            className="mb-0 flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-blue-400 hover:text-blue-600"
          >
            <i className="bi bi-arrow-left-right" aria-hidden />
          </button>
        </div>

        <div>
          <label className={labelCls} htmlFor="destination">
            도착지
          </label>
          <input
            id="destination"
            list="airport-options"
            className={inputCls}
            value={destination}
            onChange={(e) => setDestination(e.target.value.toUpperCase())}
            placeholder="KIX"
            maxLength={3}
            required
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="departDate">
            가는 날
          </label>
          <input
            id="departDate"
            type="date"
            className={inputCls}
            value={departDate}
            onChange={(e) => setDepartDate(e.target.value)}
            required
          />
        </div>

        <div className={roundTrip ? "" : "opacity-40"}>
          <label className={labelCls} htmlFor="returnDate">
            오는 날
          </label>
          <input
            id="returnDate"
            type="date"
            className={inputCls}
            value={returnDate}
            min={departDate || undefined}
            onChange={(e) => setReturnDate(e.target.value)}
            disabled={!roundTrip}
          />
        </div>
      </div>

      {/* 시간대 + 목표가 + 제출 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.4fr_auto]">
        <div>
          <label className={labelCls} htmlFor="timeFrom">
            출발 시간대 (부터)
          </label>
          <select id="timeFrom" className={inputCls} value={timeFrom} onChange={(e) => setTimeFrom(e.target.value)}>
            {TIME_FROM_OPTIONS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls} htmlFor="timeTo">
            출발 시간대 (까지)
          </label>
          <select id="timeTo" className={inputCls} value={timeTo} onChange={(e) => setTimeTo(e.target.value)}>
            {TIME_TO_OPTIONS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls} htmlFor="maxPrice">
            목표가 (이하일 때 알림)
          </label>
          <div className="relative">
            <input
              id="maxPrice"
              inputMode="numeric"
              className={`${inputCls} pr-8`}
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value.replace(/[^\d,]/g, ""))}
              placeholder="250,000"
              required
            />
            <span className="absolute top-1/2 right-3 -translate-y-1/2 text-sm text-slate-400">원</span>
          </div>
        </div>

        <div className="flex items-end gap-2">
          <button
            type="submit"
            disabled={busy}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:opacity-50 sm:w-auto"
          >
            {busy ? (
              <i className="bi bi-arrow-repeat animate-spin" aria-hidden />
            ) : (
              <i className={`bi ${mode === "create" ? "bi-binoculars" : "bi-check-lg"}`} aria-hidden />
            )}
            {mode === "create" ? "감시 시작" : "저장"}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="h-11 rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              취소
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-600" role="alert">
          <i className="bi bi-exclamation-triangle" aria-hidden />
          {error}
        </p>
      )}
    </form>
  );
}
