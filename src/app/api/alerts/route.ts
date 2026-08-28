import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export function GET() {
  const db = getDb();
  const alerts = db
    .prepare(
      `SELECT a.*, w.origin, w.destination, w.depart_date, w.return_date
       FROM alerts a JOIN watches w ON w.id = a.watch_id
       ORDER BY a.created_at DESC, a.id DESC LIMIT 50`,
    )
    .all();
  return NextResponse.json({ alerts });
}

const patchSchema = z.object({ ids: z.array(z.number().int()).min(1) });

/** 읽음 처리 */
export async function PATCH(req: Request) {
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ids 배열이 필요합니다" }, { status: 400 });

  const db = getDb();
  const mark = db.prepare("UPDATE alerts SET read = 1 WHERE id = ?");
  db.transaction(() => {
    for (const id of parsed.data.ids) mark.run(id);
  })();
  return NextResponse.json({ ok: true });
}
