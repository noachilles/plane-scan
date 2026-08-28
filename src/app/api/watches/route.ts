import { NextResponse } from "next/server";
import { getDb, type WatchRow } from "@/lib/db";
import { buildDeeplink } from "@/lib/deeplink";
import { watchInputSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export function GET() {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM watches ORDER BY created_at DESC, id DESC").all() as WatchRow[];

  const lastBatch = db.prepare("SELECT MAX(fetched_at) AS t FROM fares WHERE watch_id = ?");
  const lowestOf = db.prepare("SELECT MIN(price) AS p FROM fares WHERE watch_id = ? AND fetched_at = ?");
  const unreadOf = db.prepare("SELECT COUNT(*) AS c FROM alerts WHERE watch_id = ? AND read = 0");

  const watches = rows.map((w) => {
    const t = (lastBatch.get(w.id) as { t: string | null }).t;
    const lowestPrice = t ? ((lowestOf.get(w.id, t) as { p: number | null }).p ?? null) : null;
    const unreadAlerts = (unreadOf.get(w.id) as { c: number }).c;
    return { ...w, lowestPrice, lastScanAt: t, unreadAlerts, deeplink: buildDeeplink(w) };
  });

  return NextResponse.json({ watches });
}

export async function POST(req: Request) {
  const parsed = watchInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const v = parsed.data;

  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO watches (origin, destination, depart_date, return_date, time_from, time_to, max_price)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(v.origin, v.destination, v.departDate, v.returnDate ?? null, v.timeFrom, v.timeTo, v.maxPrice);

  const watch = db.prepare("SELECT * FROM watches WHERE id = ?").get(info.lastInsertRowid) as WatchRow;
  return NextResponse.json({ watch }, { status: 201 });
}
