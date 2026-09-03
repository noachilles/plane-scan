import { mockSource } from "./mock";
import { naverSource } from "./naver";
import type { Fare, FareQuery, FlightSource } from "./types";

export function getSource(): FlightSource {
  return process.env.FLIGHT_SOURCE === "naver" ? naverSource : mockSource;
}

/**
 * 짧은 검색 캐시 — "현재 최저가 조회(quote)" 직후 일정을 등록하면
 * 같은 조건을 다시 크롤링하지 않도록 최근 결과를 재사용한다.
 */
const g = globalThis as unknown as { __planeScanSearchCache?: Map<string, { at: number; fares: Fare[] }> };
function cache() {
  if (!g.__planeScanSearchCache) g.__planeScanSearchCache = new Map();
  return g.__planeScanSearchCache;
}
const keyOf = (q: FareQuery) =>
  `${q.origin}|${q.destination}|${q.departDate}|${q.returnDate ?? ""}|${q.timeFrom ?? ""}|${q.timeTo ?? ""}|${q.returnTimeFrom ?? ""}|${q.returnTimeTo ?? ""}|${q.directOnly ? 1 : 0}`;

export function rememberSearch(q: FareQuery, fares: Fare[]): void {
  cache().set(keyOf(q), { at: Date.now(), fares });
}

export async function searchWithCache(q: FareQuery, maxAgeMs: number): Promise<{ fares: Fare[]; cached: boolean }> {
  const hit = cache().get(keyOf(q));
  if (hit && Date.now() - hit.at <= maxAgeMs) return { fares: hit.fares, cached: true };
  const fares = await getSource().search(q);
  rememberSearch(q, fares);
  return { fares, cached: false };
}

export * from "./types";
