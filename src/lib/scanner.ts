import { getDb, type WatchRow } from "./db";
import { buildDeeplink } from "./deeplink";
import { getSource, SourceError, type Fare } from "./sources";

/**
 * 스캔 엔진 — 활성 감시(여행 일정)마다 소스를 조회해 요금 스냅샷을 남기고,
 * 시간대·목표가 조건에 맞는 요금이 나오면 알림을 만든다.
 */

const globalForScanner = globalThis as unknown as {
  __planeScanLoop?: ReturnType<typeof setInterval>;
  __planeScanRunning?: boolean;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function matches(w: WatchRow, f: Fare): boolean {
  return f.departTime >= w.time_from && f.departTime <= w.time_to && f.price <= w.max_price;
}

export interface ScanResult {
  scannedWatches: number;
  newAlerts: number;
  errors: string[];
}

export async function runScan(reason: string): Promise<ScanResult> {
  const result: ScanResult = { scannedWatches: 0, newAlerts: 0, errors: [] };

  if (globalForScanner.__planeScanRunning) {
    result.errors.push("이미 스캔이 진행 중");
    return result;
  }
  globalForScanner.__planeScanRunning = true;

  const db = getDb();
  const source = getSource();
  const delayMs = Number(process.env.SCAN_DELAY_MS ?? 2500);

  try {
    const watches = db.prepare("SELECT * FROM watches WHERE active = 1").all() as WatchRow[];
    console.log(`[scanner] scan start (${reason}) — source=${source.name}, watches=${watches.length}`);

    for (const [i, w] of watches.entries()) {
      if (i > 0) await sleep(delayMs); // 소스에 대한 정중한 간격

      let fares: Fare[];
      try {
        fares = await source.search({
          origin: w.origin,
          destination: w.destination,
          departDate: w.depart_date,
          returnDate: w.return_date,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        result.errors.push(`watch#${w.id} ${w.origin}→${w.destination}: ${msg}`);
        console.warn(`[scanner] watch#${w.id} 조회 실패: ${msg}`);
        // 차단 등 재시도 불가 오류면 이번 사이클 전체 중단 (다음 주기에 재시도)
        if (e instanceof SourceError && !e.retryable) break;
        continue;
      }

      result.scannedWatches++;
      if (fares.length === 0) continue;

      // 같은 배치의 스냅샷은 fetched_at 을 공유 → "최신 스캔" 조회가 정확해진다
      const batchTime = new Date().toISOString();
      const insertFare = db.prepare(
        `INSERT INTO fares (watch_id, airline, flight_no, depart_time, arrive_time, price, agency, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      db.transaction(() => {
        for (const f of fares) {
          insertFare.run(w.id, f.airline, f.flightNo ?? null, f.departTime, f.arriveTime ?? null, f.price, f.agency ?? null, batchTime);
        }
      })();

      const hit = fares.filter((f) => matches(w, f)).sort((a, b) => a.price - b.price)[0];
      if (!hit) continue;

      // 중복 방지: 이미 같은 가격 이하로 알린 적이 있으면 스킵 (더 싼 가격만 재알림)
      const bestAlerted = db
        .prepare("SELECT MIN(price) AS p FROM alerts WHERE watch_id = ?")
        .get(w.id) as { p: number | null };
      if (bestAlerted.p !== null && hit.price >= bestAlerted.p) continue;

      const tripLabel = w.return_date ? "왕복" : "편도";
      const message =
        `${w.origin}→${w.destination} ${w.depart_date} ${hit.departTime} 출발 ` +
        `${hit.airline} ${tripLabel} ${hit.price.toLocaleString("ko-KR")}원 — 목표가 ${w.max_price.toLocaleString("ko-KR")}원 달성`;

      db.prepare(
        `INSERT INTO alerts (watch_id, price, airline, depart_time, deeplink, message)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(w.id, hit.price, hit.airline, hit.departTime, buildDeeplink(w), message);

      result.newAlerts++;
      console.log(`[scanner] ALERT watch#${w.id}: ${message}`);
    }
  } finally {
    globalForScanner.__planeScanRunning = false;
  }

  console.log(
    `[scanner] scan done — scanned=${result.scannedWatches}, alerts=${result.newAlerts}, errors=${result.errors.length}`,
  );
  return result;
}

export function startScanLoop(): void {
  if (globalForScanner.__planeScanLoop) return; // dev HMR 중복 기동 방지

  const intervalMin = Math.max(1, Number(process.env.SCAN_INTERVAL_MIN ?? 5));
  console.log(`[scanner] loop start — every ${intervalMin}min, source=${process.env.FLIGHT_SOURCE ?? "mock"}`);

  globalForScanner.__planeScanLoop = setInterval(() => {
    runScan("interval").catch((e) => console.error("[scanner] scan failed:", e));
  }, intervalMin * 60_000);

  // 부팅 10초 후 첫 스캔
  setTimeout(() => {
    runScan("boot").catch((e) => console.error("[scanner] boot scan failed:", e));
  }, 10_000);
}
