/**
 * 네이버 항공권 딥링크.
 *
 * 기본형: 노선·날짜·인원·등급이 채워진 검색 결과 페이지.
 * 편 지정형: 네이버 프론트가 내부적으로 쓰는 `selectedFlight` 파라미터를 그대로 재현해
 *   해당 편(들)이 선택된 상태로 연다 (2026-08 프론트 번들에서 확인).
 *
 *   selectedFlight = "{구간순번}:{여정ID}:{운임타입}:HK:{항공사코드}" 를 구간별로 ',' 로 연결
 *   selectType     = "concurrent" (가는편·오는편 동시 선택)
 *
 *   예) ?adult=1&fareType=Y
 *        &selectedFlight=1:20261015ICNKIXOZ0118:A01:HK:OZ,2:20261019KIXICNOZ0115:A01:HK:OZ
 *        &selectType=concurrent
 *
 * 여정ID 형식은 {YYYYMMDD}{출발공항}{도착공항}{항공사코드}{편명} 이라 항공사코드는 ID 에서 추출한다.
 * 이후 좌석·결제(카카오페이 등)는 사용자가 직접 진행한다.
 */

interface RouteLike {
  origin: string;
  destination: string;
  depart_date: string;
  return_date: string | null;
}

interface FlightLike {
  itineraryIds?: string | null;
  fareType?: string | null;
  /** 검색 세션 ID — 있으면 네이버 화면 내 클릭과 동일한 6토큰 형식이 된다 */
  sessionId?: string | null;
}

import { isDomesticRoute } from "./airports";

function routeSegments(w: RouteLike): string {
  const dep = w.depart_date.replaceAll("-", "");
  let path = `${w.origin}-${w.destination}-${dep}`;
  if (w.return_date) {
    const ret = w.return_date.replaceAll("-", "");
    path += `/${w.destination}-${w.origin}-${ret}`;
  }
  return path;
}

function basePath(w: RouteLike, detail: boolean): string {
  // 편 지정 시 목록 URL 은 네이버가 301 로 /detail/ 에 보내주지만, 한 단계를 줄여 상세로 직행한다
  return `https://flight.naver.com/flights/international/${detail ? "detail/" : ""}${routeSegments(w)}`;
}

/** "20261015ICNKIXOZ0118" → "OZ" */
function airlineCodeOf(itineraryId: string): string {
  return itineraryId.length >= 16 ? itineraryId.slice(14, 16) : "";
}

export function buildSelectedFlightParam(itineraryIds: string, fareType = "A01", sessionId?: string | null): string {
  return itineraryIds
    .split("-")
    .filter(Boolean)
    .map((id, i) => `${i + 1}:${id}:${fareType}:HK:${airlineCodeOf(id)}${sessionId ? `:${sessionId}` : ""}`)
    .join(",");
}

export function buildDeeplink(w: RouteLike, flight?: FlightLike | null): string {
  // 국내선은 별도 경로·좌석등급 코드(YC)를 쓰고 selectedFlight 파라미터가 없다
  if (isDomesticRoute(w.origin, w.destination)) {
    return `https://flight.naver.com/flights/domestic/${routeSegments(w)}?adult=1&fareType=YC`;
  }
  const withFlight = Boolean(flight?.itineraryIds);
  const params = new URLSearchParams({ adult: "1", fareType: "Y" });
  if (withFlight) {
    params.set(
      "selectedFlight",
      buildSelectedFlightParam(flight!.itineraryIds!, flight!.fareType ?? "A01", flight!.sessionId),
    );
    params.set("selectType", "concurrent");
  }
  // selectedFlight 의 ':' ',' 는 네이버 자체 URL 과 동일하게 그대로 둔다
  return `${basePath(w, withFlight)}?${params.toString().replaceAll("%3A", ":").replaceAll("%2C", ",")}`;
}
