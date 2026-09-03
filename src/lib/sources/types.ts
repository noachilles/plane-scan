/** 소스 어댑터 공통 계약 — 크롤러가 깨지면 이 인터페이스 구현체만 교체한다 */

export interface FareQuery {
  origin: string; // IATA 3-letter, e.g. ICN
  destination: string;
  departDate: string; // YYYY-MM-DD
  returnDate?: string | null; // 없으면 편도
  /** 선택한 가는편 출발 시간대 (HH:MM) — 소스가 지원하면 반영, 아니면 서버 측에서 필터 */
  timeFrom?: string;
  timeTo?: string;
  /** 선택한 오는편 출발 시간대 (HH:MM, 왕복 전용) */
  returnTimeFrom?: string;
  returnTimeTo?: string;
  /** 직항만 (국제선 isNonstop) */
  directOnly?: boolean;
}

export interface Fare {
  airline: string;
  flightNo?: string;
  departTime: string; // 가는 편 출발 시각 HH:MM
  arriveTime?: string;
  price: number; // KRW 총액 (왕복이면 왕복 총액)
  agency?: string;
  /** 소스 고유 여정 ID (네이버: "가는편ID-오는편ID") — 특정 편 딥링크 생성용 */
  itineraryIds?: string;
  /** 소스 운임 타입 코드 (네이버: "A01" 등) */
  fareType?: string;
  /** 소스 검색 세션 ID (네이버: uniqueId) — 편 지정 딥링크의 세션 복원용 */
  sessionId?: string;
  /** 오는편 출발 시각 HH:MM (왕복 조합일 때) */
  returnDepartTime?: string;
  /** 가는편 총 소요시간(분) */
  durationMin?: number;
  /** 가는편 경유 횟수 (0 = 직항) */
  stops?: number;
}

export interface BookingLink {
  url: string; // 판매처(OTA) 실예매 페이지 — 해당 편·날짜·가격이 담긴 딥링크
  partner: string;
  price: number;
}

export interface FlightSource {
  name: string;
  search(q: FareQuery): Promise<Fare[]>;
  /** 특정 여정의 판매처 예매 링크 조회 (지원하는 소스만) */
  getBookingLink?(q: FareQuery, itineraryIds: string): Promise<BookingLink | null>;
}

export class SourceError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = "SourceError";
  }
}
