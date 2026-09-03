"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AIRPORTS, KR_DOMESTIC_AIRPORTS } from "@/lib/airports";

/**
 * 공항 선택 콤보박스.
 * 네이티브 datalist 는 값이 이미 있으면 그 값으로 필터된 목록만 보여줘서,
 * 한 번 선택한 뒤 다시 누르면 전체 목록이 안 뜬다 → 포커스 시 항상 전체 목록을
 * 보여주고, 타이핑하면 코드·한글명 양쪽으로 필터하는 커스텀 드롭다운.
 */

const JP = new Set(["NRT", "HND", "KIX", "FUK", "CTS", "OKA"]);
const ASIA = new Set(["TPE", "HKG", "PVG", "BKK", "DAD", "SGN", "HAN", "CEB", "MNL", "SIN", "KUL", "GUM", "SPN"]);

const GROUPS: Array<{ label: string; match: (code: string) => boolean }> = [
  { label: "국내", match: (c) => KR_DOMESTIC_AIRPORTS.has(c) },
  { label: "일본", match: (c) => JP.has(c) },
  { label: "아시아·괌", match: (c) => ASIA.has(c) },
  { label: "미주·유럽·대양주", match: (c) => !KR_DOMESTIC_AIRPORTS.has(c) && !JP.has(c) && !ASIA.has(c) },
];

interface Props {
  id: string;
  value: string;
  onChange: (code: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}

export default function AirportSelect({ id, value, onChange, placeholder, ariaLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  // 바깥 클릭 시 닫기
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return [...AIRPORTS];
    const up = q.toUpperCase();
    return AIRPORTS.filter((a) => a.code.startsWith(up) || a.name.includes(q));
  }, [query]);

  const select = (code: string) => {
    onChange(code);
    setOpen(false);
    setQuery("");
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      setQuery("");
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = filtered[highlight] ?? filtered[0];
      if (pick) select(pick.code);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-label={ariaLabel}
        autoComplete="off"
        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 pr-8 text-sm font-medium text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        value={open ? query : value}
        placeholder={value || placeholder}
        onFocus={() => {
          setOpen(true);
          setQuery(""); // 값이 있어도 전체 목록부터 보여준다
          setHighlight(0);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlight(0);
          if (!open) setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      <i
        className={`bi ${open ? "bi-chevron-up" : "bi-chevron-down"} pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-slate-400`}
        aria-hidden
      />

      {open && (
        <div
          role="listbox"
          className="absolute top-full left-0 z-30 mt-1 max-h-72 w-full min-w-56 overflow-y-auto rounded-xl bg-white py-1 shadow-xl ring-1 ring-slate-200"
        >
          {filtered.length === 0 && <p className="px-3 py-2 text-sm text-slate-400">검색 결과 없음</p>}
          {GROUPS.map((g) => {
            const items = filtered.filter((a) => g.match(a.code));
            if (items.length === 0) return null;
            return (
              <div key={g.label}>
                <p className="px-3 pt-2 pb-1 text-[10px] font-bold tracking-wide text-slate-400">{g.label}</p>
                {items.map((a) => {
                  const idx = filtered.indexOf(a);
                  return (
                    <button
                      key={a.code}
                      type="button"
                      role="option"
                      aria-selected={a.code === value}
                      onMouseDown={(e) => {
                        e.preventDefault(); // blur 로 닫히기 전에 선택 처리
                        select(a.code);
                      }}
                      onMouseEnter={() => setHighlight(idx)}
                      className={`flex h-10 w-full items-center gap-2 px-3 text-left text-sm transition ${
                        idx === highlight ? "bg-blue-50" : ""
                      } ${a.code === value ? "font-bold text-blue-700" : "text-slate-700"}`}
                    >
                      <span className="w-10 font-mono text-xs text-slate-500">{a.code}</span>
                      {a.name}
                      {a.code === value && <i className="bi bi-check-lg ml-auto text-blue-600" aria-hidden />}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
