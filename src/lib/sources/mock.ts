import type { Fare, FareQuery, FlightSource } from "./types";

/**
 * 개발용 모의 소스 — 노선별 기준가를 중심으로 가격이 출렁이는 요금을 생성한다.
 * 낮은 확률로 기준가의 55~70% 수준 "특가"가 섞여 알림 플로우를 검증할 수 있다.
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

export const mockSource: FlightSource = {
  name: "mock",

  async search(q: FareQuery): Promise<Fare[]> {
    const base = 120_000 + (routeHash(q) % 280_000); // 노선별 12만~40만 기준가
    const roundTripFactor = q.returnDate ? 1.8 : 1;
    const count = 6 + Math.floor(Math.random() * 5);
    const fares: Fare[] = [];

    for (let i = 0; i < count; i++) {
      const [airline, code] = AIRLINES[Math.floor(Math.random() * AIRLINES.length)];
      const hour = 6 + Math.floor(Math.random() * 17); // 06~22시
      const minute = Math.random() < 0.5 ? 0 : 30;
      const wobble = 0.85 + Math.random() * 0.5; // 기준가의 85~135%
      const isDeal = Math.random() < 0.12; // 12% 확률 특가
      const factor = isDeal ? 0.55 + Math.random() * 0.15 : wobble;
      const price = Math.round((base * factor * roundTripFactor) / 100) * 100;
      const departTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      const arriveHour = (hour + 2) % 24;

      fares.push({
        airline,
        flightNo: `${code}${100 + Math.floor(Math.random() * 900)}`,
        departTime,
        arriveTime: `${String(arriveHour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
        price,
        agency: "mock",
      });
    }

    return fares.sort((a, b) => a.price - b.price);
  },
};
