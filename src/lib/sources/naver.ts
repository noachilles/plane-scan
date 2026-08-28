import { SourceError, type Fare, type FareQuery, type FlightSource } from "./types";

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

const AIRLINE_NAMES: Record<string, string> = {
  KE: "대한항공", OZ: "아시아나항공", "7C": "제주항공", LJ: "진에어", TW: "티웨이항공",
  BX: "에어부산", ZE: "이스타항공", RS: "에어서울", YP: "에어프레미아",
  NH: "ANA", JL: "일본항공", MM: "피치항공", "7G": "스타플라이어",
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
  itineraries?: Array<{ itineraryId?: string; segments?: Segment[] }>;
  fareMappings?: Array<{
    itineraryIds?: string;
    fares?: Array<{
      adult?: { totalFare?: number; tax?: number; qCharge?: number };
      partnerCode?: string;
    }>;
  }>;
}

function buildBody(q: FareQuery) {
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
    isNonstop: false,
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
        selectedItineraries: [],
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
  // 이벤트가 진행형으로 쌓이므로 1-pass 로 여정을 모두 수집한 뒤 2-pass 로 요금을 매핑한다
  const journeys = new Map<string, { airline: string; flightNo?: string; departTime: string; arriveTime?: string }>();
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
      });
    }
  }

  for (const ev of events) {
    for (const mapping of ev.fareMappings ?? []) {
      const outboundId = mapping.itineraryIds?.split("-")[0];
      if (!outboundId) continue;
      const journey = journeys.get(outboundId);
      if (!journey) continue;

      for (const f of mapping.fares ?? []) {
        const price = Number(f.adult?.totalFare ?? 0);
        if (!Number.isFinite(price) || price <= 0) continue;
        const fare: Fare = { ...journey, price: Math.round(price), agency: f.partnerCode ?? "naver" };
        const key = `${fare.departTime}|${fare.airline}|${fare.flightNo ?? ""}`;
        const prev = best.get(key);
        if (!prev || fare.price < prev.price) best.set(key, fare);
      }
    }
  }

  return [...best.values()].sort((a, b) => a.price - b.price);
}

export const naverSource: FlightSource = {
  name: "naver",

  async search(q: FareQuery): Promise<Fare[]> {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        Referer: "https://flight.naver.com/",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      },
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
};
