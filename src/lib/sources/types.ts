/** 소스 어댑터 공통 계약 — 크롤러가 깨지면 이 인터페이스 구현체만 교체한다 */

export interface FareQuery {
  origin: string; // IATA 3-letter, e.g. ICN
  destination: string;
  departDate: string; // YYYY-MM-DD
  returnDate?: string | null; // 없으면 편도
}

export interface Fare {
  airline: string;
  flightNo?: string;
  departTime: string; // 가는 편 출발 시각 HH:MM
  arriveTime?: string;
  price: number; // KRW 총액 (왕복이면 왕복 총액)
  agency?: string;
}

export interface FlightSource {
  name: string;
  search(q: FareQuery): Promise<Fare[]>;
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
