import { NextResponse } from "next/server";
import { getDb, type FavoriteRouteRow } from "@/lib/db";
import { favoriteRouteSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** 즐겨찾기 노선 + (즐겨찾기에 없는) 최근 등록 노선 */
export function GET() {
  const db = getDb();
  const favorites = db
    .prepare("SELECT * FROM favorite_routes ORDER BY use_count DESC, id DESC")
    .all() as FavoriteRouteRow[];
  const favKeys = new Set(favorites.map((f) => `${f.origin}-${f.destination}`));

  const recent = (
    db
      .prepare(
        `SELECT origin, destination, MAX(created_at) AS last_used
         FROM watches GROUP BY origin, destination ORDER BY last_used DESC LIMIT 10`,
      )
      .all() as { origin: string; destination: string; last_used: string }[]
  )
    .filter((r) => !favKeys.has(`${r.origin}-${r.destination}`))
    .slice(0, 5);

  return NextResponse.json({ favorites, recent });
}

/** 저장 (이미 있으면 별칭만 갱신) */
export async function POST(req: Request) {
  const parsed = favoriteRouteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join(", ") }, { status: 400 });
  }
  const v = parsed.data;
  const db = getDb();
  db.prepare(
    `INSERT INTO favorite_routes (origin, destination, label) VALUES (?, ?, ?)
     ON CONFLICT(origin, destination) DO UPDATE SET label = COALESCE(excluded.label, favorite_routes.label)`,
  ).run(v.origin, v.destination, v.label?.trim() || null);

  const route = db
    .prepare("SELECT * FROM favorite_routes WHERE origin = ? AND destination = ?")
    .get(v.origin, v.destination) as FavoriteRouteRow;
  return NextResponse.json({ route }, { status: 201 });
}
