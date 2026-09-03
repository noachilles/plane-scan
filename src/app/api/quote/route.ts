import { NextResponse } from "next/server";
import { getSource, searchWithCache, SourceError, type Fare } from "@/lib/sources";
import { quoteInputSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const toDto = (f: Fare | undefined) =>
  f
    ? {
        price: f.price,
        airline: f.airline,
        flightNo: f.flightNo ?? null,
        departTime: f.departTime,
        arriveTime: f.arriveTime ?? null,
        agency: f.agency ?? null,
        returnDepartTime: f.returnDepartTime ?? null,
        durationMin: f.durationMin ?? null,
        stops: f.stops ?? null,
      }
    : null;

/**
 * 목표가 없이 "현재 최저가"만 조회한다 (일정 등록 전 제안용).
 * 결과는 검색 캐시에 남겨 바로 이어지는 등록 시 재크롤링을 피한다.
 */
export async function POST(req: Request) {
  const parsed = quoteInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join(", ") }, { status: 400 });
  }
  const q = parsed.data;
  const source = getSource();

  // 최근 5분 내 같은 조건 검색(자동 스캔 포함)이 있으면 재사용해 불필요한 크롤링을 피한다
  let fares: Fare[];
  let cached = false;
  try {
    ({ fares, cached } = await searchWithCache(
      {
        origin: q.origin,
        destination: q.destination,
        departDate: q.departDate,
        returnDate: q.returnDate ?? null,
        timeFrom: q.timeFrom,
        timeTo: q.timeTo,
        returnTimeFrom: q.returnTimeFrom ?? undefined,
        returnTimeTo: q.returnTimeTo ?? undefined,
        directOnly: q.directOnly,
      },
      5 * 60_000,
    ));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: e instanceof SourceError ? 502 : 500 });
  }

  const sorted = [...fares].sort((a, b) => a.price - b.price);
  const rtf = q.returnTimeFrom ?? "00:00";
  const rtt = q.returnTimeTo ?? "23:59";
  const inWindow = sorted.filter(
    (f) =>
      f.departTime >= q.timeFrom &&
      f.departTime <= q.timeTo &&
      (!q.directOnly || (f.stops ?? 0) === 0) &&
      (!q.returnDate || !f.returnDepartTime || (f.returnDepartTime >= rtf && f.returnDepartTime <= rtt)),
  );

  return NextResponse.json({
    source: source.name,
    cached,
    fareCount: fares.length,
    lowest: toDto(sorted[0]),
    lowestInWindow: toDto(inWindow[0]),
  });
}
