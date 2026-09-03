/** API 응답 DTO — 클라이언트 컴포넌트에서 공유 */

export interface FareDto {
  price: number;
  airline: string;
  flightNo: string | null;
  departTime: string;
  arriveTime: string | null;
  agency: string | null;
  returnDepartTime: string | null;
  durationMin: number | null;
  stops: number | null;
}

export interface WatchDto {
  id: number;
  origin: string;
  destination: string;
  depart_date: string;
  return_date: string | null;
  time_from: string;
  time_to: string;
  max_price: number;
  active: number;
  created_at: string;
  return_time_from: string | null;
  return_time_to: string | null;
  direct_only: number;
  lowestPrice: number | null;
  lowestFare: {
    price: number;
    airline: string;
    flightNo: string | null;
    departTime: string;
    returnDepartTime: string | null;
    durationMin: number | null;
    stops: number | null;
    deeplink: string;
  } | null;
  /** 시간대 밖에 더 싼 편이 있을 때만 채워지는 참고 정보 */
  outsideLowest: { price: number; departTime: string } | null;
  lastScanAt: string | null;
  unreadAlerts: number;
  deeplink: string;
}

export interface AlertDto {
  id: number;
  watch_id: number;
  price: number;
  airline: string;
  depart_time: string;
  deeplink: string;
  message: string;
  read: number;
  created_at: string;
  flight_no: string | null;
  arrive_time: string | null;
  agency: string | null;
  expired: number;
  verified_at: string | null;
  latest_price: number | null;
  source: string | null;
  booking_url: string | null;
  booking_partner: string | null;
  return_depart_time: string | null;
  duration_min: number | null;
  stops: number | null;
  dismissed: number;
  origin: string;
  destination: string;
  depart_date: string;
  return_date: string | null;
}

export interface FareHistoryDto {
  history: { fetchedAt: string; lowest: number; fareCount: number }[];
  latest: {
    airline: string;
    flightNo: string | null;
    departTime: string;
    arriveTime: string | null;
    price: number;
    inWindow: number;
  }[];
  timeFrom: string;
  timeTo: string;
}

export interface FavoriteRouteDto {
  id: number;
  origin: string;
  destination: string;
  label: string | null;
  use_count: number;
  created_at: string;
}

export interface RecentRouteDto {
  origin: string;
  destination: string;
  last_used: string;
}

export interface QuoteDto {
  source: string;
  cached: boolean;
  fareCount: number;
  lowest: FareDto | null;
  lowestInWindow: FareDto | null;
}

export interface ScannerStatusDto {
  loopStarted: boolean;
  intervalMin: number;
  lastScanAt: string | null;
  nextScanAt: string | null;
  scanning: boolean;
  scanningWatchIds: number[];
  lastError: string | null;
  source: string;
}

/** 등록/편집 폼 입력 — maxPrice 가 null 이면 "현재 최저가 조회 후 선택" 플로우로 넘어간다 */
export interface WatchFormInput {
  origin: string;
  destination: string;
  departDate: string;
  returnDate: string | null;
  timeFrom: string;
  timeTo: string;
  returnTimeFrom: string | null;
  returnTimeTo: string | null;
  directOnly: boolean;
  maxPrice: number | null;
}

/** "1시간 15분" — 분 단위 소요시간 표기 */
export function fmtDuration(min: number | null | undefined): string | null {
  if (!min || min <= 0) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}시간${m ? ` ${m}분` : ""}` : `${m}분`;
}

export const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** sqlite localtime("YYYY-MM-DD HH:MM:SS") 과 ISO 문자열 모두 처리 */
export function fmtDateTime(s: string): string {
  const d = new Date(s.includes("T") ? s : s.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** 경과 시간 표기 — "방금", "N분 전", "N시간 전" */
export function timeAgo(s: string): string {
  const d = new Date(s.includes("T") ? s : s.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return s;
  const min = Math.round((Date.now() - d.getTime()) / 60_000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h}시간 전` : `${Math.floor(h / 24)}일 전`;
}

export function fmtTime(s: string): string {
  const d = new Date(s.includes("T") ? s : s.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}
