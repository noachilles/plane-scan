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
       WHERE a.dismissed = 0
       ORDER BY a.created_at DESC, a.id DESC LIMIT 50`,
    )
    .all();
  return NextResponse.json({ alerts });
}

const patchSchema = z.object({
  ids: z.array(z.number().int()).min(1),
  action: z.enum(["read", "dismiss"]).default("read"),
});

/**
 * read: 읽음 처리 (뱃지 카운트용, 피드에는 남음)
 * dismiss: 피드에서 제거 (소프트 삭제 — 중복 알림 방지 기준은 유지되어 같은 특가가 재알림되지 않음)
 */
export async function PATCH(req: Request) {
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ids 배열이 필요합니다" }, { status: 400 });

  const db = getDb();
  const stmt =
    parsed.data.action === "dismiss"
      ? db.prepare("UPDATE alerts SET dismissed = 1, read = 1 WHERE id = ?")
      : db.prepare("UPDATE alerts SET read = 1 WHERE id = ?");
  db.transaction(() => {
    for (const id of parsed.data.ids) stmt.run(id);
  })();
  return NextResponse.json({ ok: true });
}
