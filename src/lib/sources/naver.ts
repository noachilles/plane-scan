import { isDomesticRoute } from "../airports";
import { SourceError, type BookingLink, type Fare, type FareQuery, type FlightSource } from "./types";

/**
 * 네이버 항공권 비공식 내부 API 어댑터 (국제선).
 *
 * flight-api.naver.com/flight/international/searchFlights 에 POST 하면
 * Server-Sent Events 스트림으로 검색 결과(itineraries + fareMappings)가 내려온다.
 * (과거 airline-api.naver.com GraphQL 방식은 폐기됨 — 2026-08 확인)
 *
 * 비공식 API 이므로 스키마가 예고 없이 바뀔 수 있고, 그 경우 이 파일(어댑터)만
 * 교체하면 된다. 정책: 감시당 요청 1회 + 요청 간 지연. 403/429 등 차단 신호가
 * 오면 즉시 중단하며, 차단 우회 로직(프록시 로테이션 등)은 두지 않는다.
 */

const ENDPOINT = "https://flight-api.naver.com/flight/international/searchFlights";
const DOMESTIC_ENDPOINT = "https://flight-api.naver.com/flight/domestic/searchFlights";
const LEG_DELAY_MS = 3000; // 국내선 가는편·오는편 요청 사이 간격
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const AIRLINE_NAMES: Record<string, string> = {
  KE: "대한항공", OZ: "아시아나항공", "7C": "제주항공", LJ: "진에어", TW: "티웨이항공",
  BX: "에어부산", ZE: "이스타항공", RS: "에어서울", YP: "에어프레미아",
  NH: "ANA", JL: "일본항공", MM: "피치항공", "7G": "스타플라이어", ZG: "집에어",
  CI: "중화항공", BR: "에바항공", CX: "캐세이퍼시픽", HX: "홍콩항공",
  SQ: "싱가포르항공", TR: "스쿳", TG: "타이항공", VN: "베트남항공", VJ: "비엣젯",
  PR: "필리핀항공", "5J": "세부퍼시픽", MU: "중국동방항공", CA: "중국국제항공", CZ: "중국남방항공",
  UA: "유나이티드", DL: "델타", AA: "아메리칸", AF: "에어프랑스", KL: "KLM", LH: "루프트한자", QF: "콴타스",
};

interface Segment {
  departure?: { airportCode?: string; date?: string; time?: string };
  arrival?: { airportCode?: string; date?: string; time?: string };
  marketingCarrier?: { airlineCode?: string; flightNumber?: string };
}

interface SseEvent {
  uniqueId?: string;
  itineraries?: Array<{ itineraryId?: string; duration?: number; segments?: Segment[] }>;
  fareMappings?: Array<{
    itineraryIds?: string;
    fares?: Array<{
      adult?: { totalFare?: number; tax?: number; qCharge?: number };
      partnerCode?: string;
      fareType?: string;
      isConfirmed?: boolean;
      reservationUrl?: string;
    }>;
  }>;
}

function buildBody(q: FareQuery, selectedItineraries: string[] = []) {
  const roundTrip = Boolean(q.returnDate);
  const itineraries = [
    {
      departureLocationCode: q.origin,
      departureLocationType: "airport",
      arrivalLocationCode: q.destination,
      arrivalLocationType: "airport",
      departureDate: q.departDate.replaceAll("-", ""),
    },
  ];
  if (roundTrip) {
    itineraries.push({
      departureLocationCode: q.destination,
      departureLocationType: "airport",
      arrivalLocationCode: q.origin,
      arrivalLocationType: "airport",
      departureDate: q.returnDate!.replaceAll("-", ""),
    });
  }

  const legCount = itineraries.length;
  return {
    adultCount: 1,
    childCount: 0,
    infantCount: 0,
    device: "pc",
    isNonstop: q.directOnly ?? false,
    seatClass: "Y",
    tripType: roundTrip ? "RT" : "OW",
    itineraries,
    openReturnDays: 0,
    flightFilter: {
      filter: {
        airlines: [],
        departureAirports: Array.from({ length: legCount }, () => []),
        arrivalAirports: Array.from({ length: legCount }, () => []),
        departureTime: [],
        fareTypes: [],
        flightDurationSeconds: [],
        hasCardBenefit: false,
        isIndividual: false,
        isLowCarbonEmission: false,
        isSameAirlines: false,
        isSameDepArrAirport: false,
        isTravelClub: false,
        minFare: {},
        viaCount: [],
        // 특정 여정 ID 를 넣으면 그 편의 판매처별 요금(reservationUrl 포함)이 내려온다
        selectedItineraries,
      },
      limit: 200,
      skip: 0,
      sort: { adultMinFare: 1 },
    },
    initialRequest: true,
  };
}

/** "0930" | "09:30" → "09:30" */
function normalizeTime(t: unknown): string | null {
  if (typeof t !== "string") return null;
  if (/^\d{2}:\d{2}$/.test(t)) return t;
  if (/^\d{4}$/.test(t)) return `${t.slice(0, 2)}:${t.slice(2)}`;
  return null;
}

function parseEvents(raw: string): SseEvent[] {
  const events: SseEvent[] = [];
  for (const line of raw.split("\n")) {
    if (!line.startsWith("data:")) continue;
    try {
      events.push(JSON.parse(line.slice(5).trim()) as SseEvent);
    } catch {
      // 하트비트 등 JSON 아닌 data 라인은 무시
    }
  }
  return events;
}

function extractFares(events: SseEvent[]): Fare[] {
  // 검색 세션 ID — 네이버 화면 내 클릭이 selectedFlight 6번째 토큰으로 붙이는 값
  const sessionId = [...events].reverse().find((e) => e.uniqueId)?.uniqueId;
  // 이벤트가 진행형으로 쌓이므로 1-pass 로 여정을 모두 수집한 뒤 2-pass 로 요금을 매핑한다
  const journeys = new Map<
    string,
    { airline: string; flightNo?: string; departTime: string; arriveTime?: string; durationMin?: number; stops?: number }
  >();
  const best = new Map<string, Fare>();

  for (const ev of events) {
    for (const it of ev.itineraries ?? []) {
      const id = it.itineraryId;
      const seg = it.segments?.[0];
      const lastSeg = it.segments?.[it.segments.length - 1];
      const departTime = normalizeTime(seg?.departure?.time);
      if (!id || !seg || !departTime) continue;
      const code = seg.marketingCarrier?.airlineCode ?? "??";
      journeys.set(id, {
        airline: AIRLINE_NAMES[code] ?? code,
        flightNo: seg.marketingCarrier?.flightNumber ? `${code}${seg.marketingCarrier.flightNumber}` : undefined,
        departTime,
        arriveTime: normalizeTime(lastSeg?.arrival?.time) ?? undefined,
        durationMin: Number.isFinite(Number(it.duration)) ? Math.round(Number(it.duration) / 60) : undefined,
        stops: Math.max(0, (it.segments?.length ?? 1) - 1),
      });
    }
  }

  for (const ev of events) {
    for (const mapping of ev.fareMappings ?? []) {
      const [outboundId, inboundId] = (mapping.itineraryIds ?? "").split("-");
      if (!outboundId) continue;
      const journey = journeys.get(outboundId);
      if (!journey) continue;
      const returnDepartTime = inboundId ? journeys.get(inboundId)?.departTime : undefined;

      for (const f of mapping.fares ?? []) {
        // 미확정 요금은 실제 예매 화면에 없을 수 있으므로 제외
        if (f.isConfirmed === false) continue;
        const price = Number(f.adult?.totalFare ?? 0);
        if (!Number.isFinite(price) || price <= 0) continue;
        const fare: Fare = {
          ...journey,
          price: Math.round(price),
          agency: f.partnerCode ?? "naver",
          itineraryIds: mapping.itineraryIds,
          fareType: f.fareType ?? "A01",
          sessionId,
          returnDepartTime,
        };
        const key = `${fare.departTime}|${fare.airline}|${fare.flightNo ?? ""}`;
        const prev = best.get(key);
        if (!prev || fare.price < prev.price) best.set(key, fare);
      }
    }
  }

  return [...best.values()].sort((a, b) => a.price - b.price);
}

/* ---------- 국내선 (flight/domestic/searchFlights) ----------
 * 국제선과 달리 가는편(type:"departure")·오는편(type:"arrival")을 따로 검색하며
 * 요금도 편도 단위다. 왕복 감시는 "가는편 요금 + 오는편 최저가"를 합산해 다룬다.
 * selectedFlight 딥링크·판매처 reservationUrl 은 국내선엔 없다.
 */

interface DomesticFlight {
  itineraryId?: string;
  type?: string;
  minFare?: number;
  duration?: number; // 분 단위
  segment?: {
    airlineCode?: string;
    flightNumber?: string;
    departure?: { airportCode?: string; date?: string; time?: string };
    arrival?: { airportCode?: string; date?: string; time?: string };
  };
  fares?: Array<{ adultTotalFare?: number; agtCode?: string }>;
}

function buildDomesticBody(q: FareQuery, legType: "departure" | "arrival") {
  const itineraries = [
    { departureAirport: q.origin, arrivalAirport: q.destination, departureDate: q.departDate.replaceAll("-", "") },
  ];
  if (q.returnDate) {
    itineraries.push({
      departureAirport: q.destination,
      arrivalAirport: q.origin,
      departureDate: q.returnDate.replaceAll("-", ""),
    });
  }
  return {
    type: "domestic",
    device: "pc",
    fareType: "YC",
    itineraries,
    person: { adult: 1, child: 0, infant: 0 },
    tripType: q.returnDate ? "RT" : "OW",
    initialRequest: true,
    flightFilter: { filter: { type: legType }, limit: 200, skip: 0, sort: { minFare: 1 } },
  };
}

async function fetchDomesticLeg(q: FareQuery, legType: "departure" | "arrival"): Promise<DomesticFlight[]> {
  const res = await fetch(DOMESTIC_ENDPOINT, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(buildDomesticBody(q, legType)),
    signal: AbortSignal.timeout(90_000),
  });
  if (res.status === 403 || res.status === 429) {
    throw new SourceError(`네이버 측 차단 응답(HTTP ${res.status}) — 스캔 주기를 늘리세요`, false);
  }
  if (!res.ok) {
    const bodyHead = (await res.text().catch(() => "")).slice(0, 300);
    throw new SourceError(`네이버 국내선 응답 오류: HTTP ${res.status} ${bodyHead}`, res.status >= 500);
  }
  const events = parseEvents(await res.text()) as Array<{ flights?: DomesticFlight[] }>;
  const last = [...events].reverse().find((e) => Array.isArray(e.flights));
  return last?.flights ?? [];
}

/** 편의 확정 최저 요금(총액)과 판매처 */
function cheapestDomesticFare(f: DomesticFlight): { price: number; agtCode: string } | null {
  const list = (f.fares ?? [])
    .map((x) => ({ price: Math.round(Number(x.adultTotalFare ?? 0)), agtCode: x.agtCode ?? "naver" }))
    .filter((x) => Number.isFinite(x.price) && x.price > 0)
    .sort((a, b) => a.price - b.price);
  if (list.length > 0) return list[0];
  const min = Math.round(Number(f.minFare ?? 0));
  return min > 0 ? { price: min, agtCode: "naver" } : null;
}

async function searchDomestic(q: FareQuery): Promise<Fare[]> {
  const outbound = await fetchDomesticLeg(q, "departure");

  // 왕복이면 "선택한 오는편 시간대 안"의 최저가를 구해 합산한다
  let returnMin: { price: number; itineraryId: string; departTime: string } | null = null;
  if (q.returnDate) {
    await sleep(LEG_DELAY_MS);
    const inbound = await fetchDomesticLeg(q, "arrival");
    const rtf = q.returnTimeFrom ?? "00:00";
    const rtt = q.returnTimeTo ?? "23:59";
    for (const f of inbound) {
      const t = normalizeTime(f.segment?.departure?.time);
      if (!t || t < rtf || t > rtt) continue;
      const c = cheapestDomesticFare(f);
      if (c && (!returnMin || c.price < returnMin.price)) {
        returnMin = { price: c.price, itineraryId: f.itineraryId ?? "", departTime: t };
      }
    }
    if (!returnMin) return []; // 선택한 오는편 시간대에 편이 없으면 왕복 성립 불가
  }

  const fares: Fare[] = [];
  for (const f of outbound) {
    const seg = f.segment;
    const departTime = normalizeTime(seg?.departure?.time);
    const c = cheapestDomesticFare(f);
    if (!departTime || !c) continue;
    const code = seg?.airlineCode ?? "??";
    fares.push({
      airline: AIRLINE_NAMES[code] ?? code,
      flightNo: seg?.flightNumber ? `${code}${seg.flightNumber}` : undefined,
      departTime,
      arriveTime: normalizeTime(seg?.arrival?.time) ?? undefined,
      price: c.price + (returnMin?.price ?? 0),
      agency: c.agtCode,
      itineraryIds: [f.itineraryId, returnMin?.itineraryId].filter(Boolean).join("-") || undefined,
      fareType: "YC",
      returnDepartTime: returnMin?.departTime,
      durationMin: Number.isFinite(Number(f.duration)) ? Number(f.duration) : undefined,
      stops: 0, // 국내선은 직항
    });
  }
  return fares.sort((a, b) => a.price - b.price);
}

const HEADERS = {
  "Content-Type": "application/json",
  Accept: "text/event-stream",
  Referer: "https://flight.naver.com/",
  "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
} as const;

export const naverSource: FlightSource = {
  name: "naver",

  async search(q: FareQuery): Promise<Fare[]> {
    // 국내 공항끼리의 노선은 국내선 API 로 (국제선 API 는 400 "All routes are domestic airports")
    if (isDomesticRoute(q.origin, q.destination)) return searchDomestic(q);

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify(buildBody(q)),
      // SSE 스트림이 끝날 때까지 대기하므로 여유 있게
      signal: AbortSignal.timeout(90_000),
    });

    if (res.status === 403 || res.status === 429) {
      throw new SourceError(`네이버 측 차단 응답(HTTP ${res.status}) — 스캔 주기를 늘리세요`, false);
    }
    if (!res.ok) {
      const bodyHead = (await res.text().catch(() => "")).slice(0, 300);
      throw new SourceError(`네이버 응답 오류: HTTP ${res.status} ${bodyHead}`, res.status >= 500);
    }

    const events = parseEvents(await res.text());
    if (events.length === 0) {
      throw new SourceError("SSE 이벤트가 비어 있음 — API 응답 형식이 변경된 것으로 보임", false);
    }

    return extractFares(events);
  },

  /**
   * 특정 여정의 판매처(OTA) 예매 링크 — selectedItineraries 필터를 실으면
   * 그 편의 판매처별 요금에 reservationUrl 이 채워져 내려온다 (2026-09 실검증).
   * 확정 요금 중 최저가 판매처의 링크를 돌려준다. 링크에는 세션성 토큰이 들어
   * 있어 시간이 지나면 만료될 수 있다 → "가격 다시 확인"으로 갱신.
   */
  async getBookingLink(q: FareQuery, itineraryIds: string): Promise<BookingLink | null> {
    if (isDomesticRoute(q.origin, q.destination)) return null; // 국내선엔 reservationUrl 없음
    const ids = itineraryIds.split("-").filter(Boolean);
    if (ids.length === 0) return null;

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify(buildBody(q, ids)),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) return null;

    const events = parseEvents(await res.text());
    const withMappings = [...events].reverse().find((e) => (e.fareMappings?.length ?? 0) > 0);
    const mappings = withMappings?.fareMappings ?? [];
    const mapping = mappings.find((m) => m.itineraryIds === itineraryIds) ?? mappings[0];

    const candidates = (mapping?.fares ?? [])
      .map((f) => ({
        url: f.reservationUrl ?? "",
        partner: f.partnerCode ?? "naver",
        price: Math.round(Number(f.adult?.totalFare ?? 0)),
        confirmed: f.isConfirmed !== false,
      }))
      .filter((c) => c.url && c.confirmed && c.price > 0)
      .sort((a, b) => a.price - b.price);

    const best = candidates[0];
    return best ? { url: best.url, partner: best.partner, price: best.price } : null;
  },
};
