"use client";

import { AIRPORTS } from "@/lib/airports";
import type { FavoriteRouteDto, RecentRouteDto } from "@/lib/apiTypes";

const airportName = (code: string) => AIRPORTS.find((a) => a.code === code)?.name ?? code;

interface Props {
  favorites: FavoriteRouteDto[];
  recent: RecentRouteDto[];
  onPick: (origin: string, destination: string) => void;
  onSave: (origin: string, destination: string) => void;
  onRename: (route: FavoriteRouteDto) => void;
  onDelete: (route: FavoriteRouteDto) => void;
}

/** 자주 타는 노선(즐겨찾기) + 최근 노선 칩 — 누르면 폼에 노선이 채워진다 */
export default function RouteChips({ favorites, recent, onPick, onSave, onRename, onDelete }: Props) {
  if (favorites.length === 0 && recent.length === 0) return null;

  return (
    <div className="mb-4 space-y-2">
      {favorites.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 text-xs font-semibold text-amber-600">
            <i className="bi bi-star-fill" aria-hidden />
            자주 타는 노선
          </span>
          {favorites.map((r) => (
            <div
              key={r.id}
              className="flex h-11 items-center overflow-hidden rounded-full border border-amber-200 bg-amber-50 text-sm text-amber-900"
            >
              <button
                type="button"
                onClick={() => onPick(r.origin, r.destination)}
                onDoubleClick={() => onRename(r)}
                className="flex h-full items-center gap-1.5 pr-2 pl-4 font-semibold transition hover:bg-amber-100"
                title={`${airportName(r.origin)} → ${airportName(r.destination)} · 더블클릭: 별칭 변경`}
              >
                {r.label ? (
                  <>
                    {r.label}
                    <span className="text-xs font-normal text-amber-700/70">
                      {r.origin}→{r.destination}
                    </span>
                  </>
                ) : (
                  <>
                    {r.origin}
                    <i className="bi bi-arrow-right text-xs" aria-hidden />
                    {r.destination}
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => onDelete(r)}
                className="flex h-full w-10 items-center justify-center text-amber-500 transition hover:bg-amber-100 hover:text-red-600"
                aria-label={`${r.origin}→${r.destination} 즐겨찾기 삭제`}
              >
                <i className="bi bi-x-lg text-xs" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}

      {recent.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 text-xs font-semibold text-slate-500">
            <i className="bi bi-clock-history" aria-hidden />
            최근 노선
          </span>
          {recent.map((r) => (
            <div
              key={`${r.origin}-${r.destination}`}
              className="flex h-11 items-center overflow-hidden rounded-full border border-slate-200 bg-white text-sm text-slate-700"
            >
              <button
                type="button"
                onClick={() => onPick(r.origin, r.destination)}
                className="flex h-full items-center gap-1.5 pr-2 pl-4 font-semibold transition hover:bg-slate-50"
                title={`${airportName(r.origin)} → ${airportName(r.destination)}`}
              >
                {r.origin}
                <i className="bi bi-arrow-right text-xs" aria-hidden />
                {r.destination}
              </button>
              <button
                type="button"
                onClick={() => onSave(r.origin, r.destination)}
                className="flex h-full w-10 items-center justify-center text-slate-400 transition hover:bg-amber-50 hover:text-amber-600"
                aria-label={`${r.origin}→${r.destination} 즐겨찾기에 저장`}
                title="즐겨찾기에 저장"
              >
                <i className="bi bi-star text-xs" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
