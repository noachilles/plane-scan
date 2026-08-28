/** API 응답 DTO — 클라이언트 컴포넌트에서 공유 */

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
  lowestPrice: number | null;
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
  origin: string;
  destination: string;
  depart_date: string;
  return_date: string | null;
}

export interface FareHistoryDto {
  history: { fetchedAt: string; lowest: number; fareCount: number }[];
  latest: { airline: string; flightNo: string | null; departTime: string; arriveTime: string | null; price: number }[];
}

export interface WatchFormInput {
  origin: string;
  destination: string;
  departDate: string;
  returnDate: string | null;
  timeFrom: string;
  timeTo: string;
  maxPrice: number;
}

export const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** sqlite localtime("YYYY-MM-DD HH:MM:SS") 과 ISO 문자열 모두 처리 */
export function fmtDateTime(s: string): string {
  const d = new Date(s.includes("T") ? s : s.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
