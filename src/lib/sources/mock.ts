import type { Fare, FareQuery, FlightSource } from "./types";

/**
 * 개발용 모의 소스.
 *
 * 실제 항공 스케줄처럼 **노선·날짜별로 편(항공사·편명·시각)은 고정**하고(시드 기반),
 * 가격만 스캔마다 출렁이게 한다. 그래야 특가 소멸(expired) 검사·재확인 같은
 * 로직이 실제와 같은 조건으로 동작한다. 낮은 확률로 기준가의 60~75% "특가"가 섞인다.
 */

const AIRLINES = [
  ["대한항공", "KE"],
  ["아시아나항공", "OZ"],
  ["제주항공", "7C"],
  ["진에어", "LJ"],
  ["티웨이항공", "TW"],
  ["에어부산", "BX"],
  ["이스타항공", "ZE"],
] as const;

function routeHash(q: FareQuery): number {
  const s = `${q.origin}${q.destination}${q.departDate}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** 시드 고정 PRNG — 같은 노선·날짜면 항상 같은 스케줄 */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const mockSource: FlightSource = {
  name: "mock",

  async search(q: FareQuery): Promise<Fare[]> {
    const hash = routeHash(q);
    const seeded = mulberry32(hash);
    const base = 120_000 + (hash % 280_000); // 노선별 12만~40만 기준가
    const roundTripFactor = q.returnDate ? 1.8 : 1;
    const count = 6 + (hash % 5);
    const fares: Fare[] = [];

    for (let i = 0; i < count; i++) {
      // --- 스케줄(고정): 06~22시에 고르게 분포 + 시드 지터 ---
      const [airline, code] = AIRLINES[Math.floor(seeded() * AIRLINES.length)];
      const hour = Math.min(22, 6 + Math.floor((i * 17) / count) + Math.floor(seeded() * 2));
      const minute = seeded() < 0.5 ? 0 : 30;
      const flightNo = `${code}${100 + Math.floor(seeded() * 900)}`;
      const departTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      const arriveHour = (hour + 2) % 24;
      // 네이버 형식을 흉내 낸 여정 ID: {YYYYMMDD}{DEP}{ARR}{항공사코드}{편명}(-{귀국편})
      const outId = `${q.departDate.replaceAll("-", "")}${q.origin}${q.destination}${flightNo}`;
      const inId = q.returnDate ? `${q.returnDate.replaceAll("-", "")}${q.destination}${q.origin}${code}${200 + i}` : null;

      // --- 가격(변동): 스캔마다 85~135% 출렁, 5% 확률 특가(60~75%) ---
      const isDeal = Math.random() < 0.05;
      const factor = isDeal ? 0.6 + Math.random() * 0.15 : 0.85 + Math.random() * 0.5;
      const price = Math.round((base * factor * roundTripFactor) / 100) * 100;

      const stops = q.directOnly ? 0 : seeded() < 0.2 ? 1 : 0;
      const returnHour = 8 + Math.floor(seeded() * 14); // 08~21시 (스케줄 고정)

      fares.push({
        airline,
        flightNo,
        departTime,
        arriveTime: `${String(arriveHour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
        price,
        agency: "mock",
        itineraryIds: inId ? `${outId}-${inId}` : outId,
        fareType: "A01",
        returnDepartTime: inId ? `${String(returnHour).padStart(2, "0")}:00` : undefined,
        durationMin: 60 + Math.floor(seeded() * 120),
        stops,
      });
    }

    return fares.sort((a, b) => a.price - b.price);
  },
};
