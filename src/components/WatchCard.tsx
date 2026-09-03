"use client";

import { useState } from "react";
import { fmtDateTime, fmtDuration, won, type FareHistoryDto, type WatchDto } from "@/lib/apiTypes";

interface Props {
  watch: WatchDto;
  scanning: boolean;
  onEdit: (w: WatchDto) => void;
  onDelete: (w: WatchDto) => void;
  onToggle: (w: WatchDto) => void;
  onRetarget: (w: WatchDto) => void;
  onSaveRoute: (origin: string, destination: string) => void;
}

export default function WatchCard({ watch: w, scanning, onEdit, onDelete, onToggle, onRetarget, onSaveRoute }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<FareHistoryDto | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const reached = w.lowestPrice !== null && w.lowestPrice <= w.max_price;
  const active = w.active === 1;

  const toggleExpand = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next) {
      setLoadingDetail(true);
      try {
        const res = await fetch(`/api/watches/${w.id}/fares`);
        setDetail((await res.json()) as FareHistoryDto);
      } finally {
        setLoadingDetail(false);
      }
    }
  };

  const iconBtn =
    "flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-800";

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md sm:p-5">
      {/* 상단: 노선 + 상태 */}
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900">
          {w.origin}
          <i className="bi bi-airplane rotate-90 text-sm text-blue-500" aria-hidden />
          {w.destination}
        </h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
          {w.return_date ? "왕복" : "편도"}
        </span>
        {w.direct_only === 1 && (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-600">직항만</span>
        )}
        {scanning ? (
          <span className="flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-600">
            <i className="bi bi-arrow-repeat animate-spin" aria-hidden />
            검색 중
          </span>
        ) : active ? (
          <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-600">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden />
            감시 중
          </span>
        ) : (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-400">일시정지</span>
        )}
        {w.unreadAlerts > 0 && (
          <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">알림 {w.unreadAlerts}</span>
        )}
      </div>

      {/* 조건 요약 */}
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-slate-600 sm:grid-cols-4">
        <div>
          <dt className="text-xs text-slate-400">가는 날</dt>
          <dd className="font-medium">{w.depart_date}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">오는 날</dt>
          <dd className="font-medium">{w.return_date ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">출발 시간대</dt>
          <dd className="font-medium">
            가는 {w.time_from}~{w.time_to}
            {w.return_date && (
              <span className="block text-slate-500">
                오는 {w.return_time_from ?? "00:00"}~{w.return_time_to ?? "23:59"}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">목표가</dt>
          <dd className="font-medium">
            <span className="block">{won(w.max_price)}</span>
            <button
              type="button"
              onClick={() => onRetarget(w)}
              className="mt-1 inline-flex h-7 items-center gap-1 rounded-lg bg-blue-50 px-2 text-xs font-semibold text-blue-600 transition hover:bg-blue-100"
              title="현재 최저가를 보고 목표가 다시 정하기"
            >
              <i className="bi bi-tag" aria-hidden />
              다시 정하기
            </button>
          </dd>
        </div>
      </dl>

      {/* 현재 최저가 */}
      <div
        className={`mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-3 py-2.5 ${
          reached ? "bg-emerald-50" : "bg-slate-50"
        }`}
      >
        <span className="text-xs font-semibold text-slate-500">
          선택 시간대({w.time_from}~{w.time_to}) 최저가
        </span>
        {w.lowestPrice === null ? (
          <span className="text-sm font-medium text-slate-400">
            {scanning ? "찾는 중…" : w.lastScanAt ? "시간대 내 편 없음" : "수집 전"}
          </span>
        ) : (
          <>
            <span className={`text-xl font-extrabold ${reached ? "text-emerald-600" : "text-slate-900"}`}>
              {won(w.lowestPrice)}
            </span>
            {w.lowestFare && (
              <span className="text-xs text-slate-500">
                {w.lowestFare.airline} {w.lowestFare.departTime}
                {w.lowestFare.returnDepartTime && ` · 귀가 ${w.lowestFare.returnDepartTime}`}
                {w.lowestFare.stops !== null && ` · ${w.lowestFare.stops === 0 ? "직항" : `경유 ${w.lowestFare.stops}회`}`}
                {fmtDuration(w.lowestFare.durationMin) && ` · ${fmtDuration(w.lowestFare.durationMin)}`}
              </span>
            )}
            {reached ? (
              <span className="flex items-center gap-1 text-sm font-bold text-emerald-600">
                <i className="bi bi-check-circle-fill" aria-hidden /> 목표가 도달!
              </span>
            ) : (
              <span className="text-sm text-slate-500">목표가까지 {won(w.lowestPrice - w.max_price)}</span>
            )}
          </>
        )}
        {w.lastScanAt && <span className="ml-auto text-xs text-slate-400">스캔 {fmtDateTime(w.lastScanAt)}</span>}
        {w.outsideLowest && (
          <p className="w-full text-xs text-slate-400">
            <i className="bi bi-info-circle mr-1" aria-hidden />
            시간대 밖 최저가 {won(w.outsideLowest.price)} ({w.outsideLowest.departTime} 출발) — 참고용
          </p>
        )}
      </div>

      {/* 액션 */}
      <div className="mt-3 flex items-center gap-1">
        <button
          type="button"
          role="switch"
          aria-checked={active}
          aria-label="감시 켜기/끄기"
          onClick={() => onToggle(w)}
          className={`relative h-7 w-12 rounded-full transition ${active ? "bg-blue-600" : "bg-slate-300"}`}
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${active ? "left-6" : "left-1"}`}
          />
        </button>

        <div className="ml-auto flex items-center">
          <button
            type="button"
            onClick={() => onSaveRoute(w.origin, w.destination)}
            className={`${iconBtn} hover:text-amber-600`}
            aria-label="이 노선을 즐겨찾기에 저장"
            title="노선 저장"
          >
            <i className="bi bi-star" aria-hidden />
          </button>
          <a
            href={w.lowestFare?.deeplink ?? w.deeplink}
            target="_blank"
            rel="noopener noreferrer"
            className={iconBtn}
            aria-label={w.lowestFare ? "네이버에서 현재 최저가 편 열기" : "네이버 항공권에서 보기"}
            title={w.lowestFare ? "네이버에서 현재 최저가 편 열기" : "네이버 항공권에서 보기"}
          >
            <i className="bi bi-box-arrow-up-right" aria-hidden />
          </a>
          <button type="button" onClick={() => onEdit(w)} className={iconBtn} aria-label="일정 편집" title="편집">
            <i className="bi bi-pencil-square" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onDelete(w)}
            className={`${iconBtn} hover:bg-red-50 hover:text-red-600`}
            aria-label="일정 삭제"
            title="삭제"
          >
            <i className="bi bi-trash3" aria-hidden />
          </button>
          <button
            type="button"
            onClick={toggleExpand}
            className={iconBtn}
            aria-expanded={expanded}
            aria-label="가격 히스토리 보기"
            title="가격 히스토리"
          >
            <i className={`bi ${expanded ? "bi-chevron-up" : "bi-chevron-down"}`} aria-hidden />
          </button>
        </div>
      </div>

      {/* 히스토리 */}
      {expanded && (
        <div className="mt-3 border-t border-slate-100 pt-3 text-sm">
          {loadingDetail && <p className="text-slate-400">불러오는 중…</p>}
          {detail && detail.latest.length === 0 && <p className="text-slate-400">아직 수집된 요금이 없습니다.</p>}
          {detail && detail.latest.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <h4 className="mb-1.5 text-xs font-bold text-slate-500">최신 스캔 요금 TOP 5</h4>
                <ul className="space-y-1">
                  {detail.latest.slice(0, 5).map((f, i) => (
                    <li
                      key={i}
                      className={`flex items-center gap-2 ${f.inWindow ? "text-slate-700" : "text-slate-400 opacity-60"}`}
                      title={f.inWindow ? undefined : "선택 시간대 밖"}
                    >
                      <span className="w-12 font-mono text-xs text-slate-400">{f.departTime}</span>
                      <span className="flex-1 truncate">
                        {f.airline}
                        {f.flightNo ? ` ${f.flightNo}` : ""}
                        {!f.inWindow && <span className="ml-1 text-[10px]">(시간대 밖)</span>}
                      </span>
                      <span className="font-semibold">{won(f.price)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="mb-1.5 text-xs font-bold text-slate-500">스캔별 최저가 추이 (시간대 내)</h4>
                <ul className="space-y-1">
                  {detail.history.slice(0, 5).map((h) => (
                    <li key={h.fetchedAt} className="flex items-center gap-2 text-slate-700">
                      <span className="flex-1 text-xs text-slate-400">{fmtDateTime(h.fetchedAt)}</span>
                      <span className="font-semibold">{won(h.lowest)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
