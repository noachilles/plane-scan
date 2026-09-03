"use client";

import { useEffect, useState } from "react";
import AirportSelect from "@/components/AirportSelect";
import type { WatchDto, WatchFormInput } from "@/lib/apiTypes";

const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`);
const TIME_FROM_OPTIONS = HOURS;
const TIME_TO_OPTIONS = [...HOURS.slice(1), "23:59"];

/** 출장 패턴 시간대 프리셋 */
const PRESETS: ReadonlyArray<readonly [string, string, string]> = [
  ["아침", "06:00", "09:00"],
  ["오전", "09:00", "12:00"],
  ["오후", "12:00", "18:00"],
  ["퇴근 후", "18:00", "22:00"],
  ["전체", "00:00", "23:59"],
];

export interface RoutePrefill {
  origin: string;
  destination: string;
  key: number; // 같은 노선을 다시 눌러도 반영되도록 바뀌는 값
}

interface Props {
  mode: "create" | "edit";
  initial?: WatchDto;
  prefill?: RoutePrefill | null;
  onSubmit: (input: WatchFormInput) => Promise<string | null>;
  onCancel?: () => void;
  onSaveRoute?: (origin: string, destination: string) => void;
}

export default function WatchForm({ mode, initial, prefill, onSubmit, onCancel, onSaveRoute }: Props) {
  const [origin, setOrigin] = useState(initial?.origin ?? "ICN");
  const [destination, setDestination] = useState(initial?.destination ?? "");
  const [roundTrip, setRoundTrip] = useState(initial ? initial.return_date !== null : true);
  const [departDate, setDepartDate] = useState(initial?.depart_date ?? "");
  const [returnDate, setReturnDate] = useState(initial?.return_date ?? "");
  const [timeFrom, setTimeFrom] = useState(initial?.time_from ?? "00:00");
  const [timeTo, setTimeTo] = useState(initial?.time_to ?? "23:59");
  const [returnTimeFrom, setReturnTimeFrom] = useState(initial?.return_time_from ?? "00:00");
  const [returnTimeTo, setReturnTimeTo] = useState(initial?.return_time_to ?? "23:59");
  const [directOnly, setDirectOnly] = useState(initial ? initial.direct_only === 1 : false);
  const [maxPrice, setMaxPrice] = useState(initial ? String(initial.max_price) : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 즐겨찾기/최근 노선 칩 클릭 → 노선만 채우고 날짜 입력으로 포커스 이동
  useEffect(() => {
    if (!prefill) return;
    setOrigin(prefill.origin);
    setDestination(prefill.destination);
    document.getElementById("departDate")?.focus();
  }, [prefill]);

  const swap = () => {
    setOrigin(destination);
    setDestination(origin);
  };

  const routeReady = /^[A-Z]{3}$/.test(origin) && /^[A-Z]{3}$/.test(destination) && origin !== destination;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination)) {
      setError("출발지와 도착지를 목록에서 선택해주세요");
      return;
    }

    const raw = maxPrice.replaceAll(",", "").trim();
    let price: number | null = null;
    if (raw !== "") {
      price = Number(raw);
      if (!Number.isInteger(price) || price <= 0) {
        setError("목표가를 숫자로 입력해주세요");
        return;
      }
    } else if (mode === "edit") {
      setError("목표가를 입력해주세요");
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
      returnTimeFrom: roundTrip ? returnTimeFrom : null,
      returnTimeTo: roundTrip ? returnTimeTo : null,
      directOnly,
      maxPrice: price,
    });
    setBusy(false);

    if (err) {
      setError(err);
      return;
    }
    if (mode === "create" && price !== null) {
      setDestination("");
      setMaxPrice("");
    }
  };

  const labelCls = "mb-1 block text-xs font-semibold text-slate-500";
  const inputCls =
    "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
  const presetCls = (active: boolean) =>
    `h-8 rounded-full px-3 text-xs font-semibold transition ${
      active ? "bg-blue-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-blue-300"
    }`;

  const presetRow = (
    label: string,
    from: string,
    to: string,
    setFrom: (v: string) => void,
    setTo: (v: string) => void,
  ) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-12 text-xs font-semibold text-slate-500">{label}</span>
      {PRESETS.map(([name, f, t]) => (
        <button
          key={name}
          type="button"
          onClick={() => {
            setFrom(f);
            setTo(t);
          }}
          className={presetCls(from === f && to === t)}
        >
          {name}
        </button>
      ))}
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* 편도/왕복 + 직항 + 노선 저장 */}
      <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="여정 종류">
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
        <button
          type="button"
          role="switch"
          aria-checked={directOnly}
          onClick={() => setDirectOnly((v) => !v)}
          className={`flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition ${
            directOnly ? "bg-emerald-600 text-white shadow" : "bg-white/70 text-slate-600 hover:bg-white"
          }`}
          title="경유 편 제외 (출장 추천)"
        >
          <i className={`bi ${directOnly ? "bi-check-circle-fill" : "bi-circle"}`} aria-hidden />
          직항만
        </button>
        {onSaveRoute && (
          <button
            type="button"
            disabled={!routeReady}
            onClick={() => onSaveRoute(origin, destination)}
            className="ml-auto flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-amber-600 transition hover:bg-amber-50 disabled:opacity-40"
            title="이 노선을 즐겨찾기에 저장"
          >
            <i className="bi bi-star" aria-hidden />
            노선 저장
          </button>
        )}
      </div>

      {/* 노선 + 날짜 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_auto_1fr_1fr_1fr]">
        <div>
          <label className={labelCls} htmlFor="origin">
            출발지
          </label>
          <AirportSelect id="origin" ariaLabel="출발지" value={origin} onChange={setOrigin} placeholder="ICN" />
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
          <AirportSelect id="destination" ariaLabel="도착지" value={destination} onChange={setDestination} placeholder="KIX" />
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

      {/* 출발 시간대 — 가는편/오는편 개별 설정 + 프리셋 */}
      <div className="space-y-2 rounded-2xl bg-slate-50/70 p-3">
        {presetRow("가는편", timeFrom, timeTo, setTimeFrom, setTimeTo)}
        <div className="grid grid-cols-2 gap-3 lg:max-w-md">
          <select
            aria-label="가는편 출발 시간대 시작"
            className={inputCls}
            value={timeFrom}
            onChange={(e) => setTimeFrom(e.target.value)}
          >
            {TIME_FROM_OPTIONS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <select
            aria-label="가는편 출발 시간대 끝"
            className={inputCls}
            value={timeTo}
            onChange={(e) => setTimeTo(e.target.value)}
          >
            {TIME_TO_OPTIONS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>

        {roundTrip && (
          <>
            {presetRow("오는편", returnTimeFrom, returnTimeTo, setReturnTimeFrom, setReturnTimeTo)}
            <div className="grid grid-cols-2 gap-3 lg:max-w-md">
              <select
                aria-label="오는편 출발 시간대 시작"
                className={inputCls}
                value={returnTimeFrom}
                onChange={(e) => setReturnTimeFrom(e.target.value)}
              >
                {TIME_FROM_OPTIONS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <select
                aria-label="오는편 출발 시간대 끝"
                className={inputCls}
                value={returnTimeTo}
                onChange={(e) => setReturnTimeTo(e.target.value)}
              >
                {TIME_TO_OPTIONS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => {
                setTimeFrom("06:00");
                setTimeTo("09:00");
                setReturnTimeFrom("18:00");
                setReturnTimeTo("22:00");
              }}
              className="flex h-8 items-center gap-1 rounded-full bg-blue-50 px-3 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
              title="가는편 아침(06~09) · 오는편 퇴근 후(18~22)"
            >
              <i className="bi bi-briefcase" aria-hidden />
              출장 추천 세팅
            </button>
          </>
        )}
      </div>

      {/* 목표가 + 제출 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.4fr_auto]">
        <div>
          <label className={labelCls} htmlFor="maxPrice">
            목표가 {mode === "create" && <span className="font-normal text-slate-400">(비우면 현재 최저가를 먼저 찾아드려요)</span>}
          </label>
          <div className="relative">
            <input
              id="maxPrice"
              inputMode="numeric"
              className={`${inputCls} pr-8`}
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value.replace(/[^\d,]/g, ""))}
              placeholder={mode === "create" ? "비워두면 최저가 조회" : "250,000"}
              required={mode === "edit"}
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
            {mode === "create" ? (maxPrice.trim() ? "감시 시작" : "최저가 찾기") : "저장"}
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
