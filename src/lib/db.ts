import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS watches (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  origin      TEXT    NOT NULL,
  destination TEXT    NOT NULL,
  depart_date TEXT    NOT NULL,
  return_date TEXT,
  time_from   TEXT    NOT NULL DEFAULT '00:00',
  time_to     TEXT    NOT NULL DEFAULT '23:59',
  max_price   INTEGER NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS fares (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  watch_id    INTEGER NOT NULL REFERENCES watches(id) ON DELETE CASCADE,
  airline     TEXT    NOT NULL,
  flight_no   TEXT,
  depart_time TEXT    NOT NULL,
  arrive_time TEXT,
  price       INTEGER NOT NULL,
  agency      TEXT,
  fetched_at  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS alerts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  watch_id    INTEGER NOT NULL REFERENCES watches(id) ON DELETE CASCADE,
  price       INTEGER NOT NULL,
  airline     TEXT    NOT NULL,
  depart_time TEXT    NOT NULL,
  deeplink    TEXT    NOT NULL,
  message     TEXT    NOT NULL,
  read        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS favorite_routes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  origin      TEXT    NOT NULL,
  destination TEXT    NOT NULL,
  label       TEXT,
  use_count   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
  UNIQUE(origin, destination)
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint    TEXT    NOT NULL UNIQUE,
  p256dh      TEXT    NOT NULL,
  auth        TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_fares_watch  ON fares(watch_id, fetched_at);
CREATE INDEX IF NOT EXISTS idx_alerts_watch ON alerts(watch_id, created_at);
`;

/** 기존 DB에 컬럼을 추가하는 가벼운 마이그레이션 (없을 때만) */
const MIGRATIONS: Array<{ table: string; column: string; ddl: string }> = [
  { table: "watches", column: "return_time_from", ddl: "ALTER TABLE watches ADD COLUMN return_time_from TEXT" },
  { table: "watches", column: "return_time_to", ddl: "ALTER TABLE watches ADD COLUMN return_time_to TEXT" },
  { table: "watches", column: "direct_only", ddl: "ALTER TABLE watches ADD COLUMN direct_only INTEGER NOT NULL DEFAULT 0" },
  { table: "fares", column: "return_depart_time", ddl: "ALTER TABLE fares ADD COLUMN return_depart_time TEXT" },
  { table: "fares", column: "duration_min", ddl: "ALTER TABLE fares ADD COLUMN duration_min INTEGER" },
  { table: "fares", column: "stops", ddl: "ALTER TABLE fares ADD COLUMN stops INTEGER" },
  { table: "alerts", column: "return_depart_time", ddl: "ALTER TABLE alerts ADD COLUMN return_depart_time TEXT" },
  { table: "alerts", column: "duration_min", ddl: "ALTER TABLE alerts ADD COLUMN duration_min INTEGER" },
  { table: "alerts", column: "stops", ddl: "ALTER TABLE alerts ADD COLUMN stops INTEGER" },
  { table: "alerts", column: "dismissed", ddl: "ALTER TABLE alerts ADD COLUMN dismissed INTEGER NOT NULL DEFAULT 0" },
  { table: "alerts", column: "flight_no", ddl: "ALTER TABLE alerts ADD COLUMN flight_no TEXT" },
  { table: "alerts", column: "arrive_time", ddl: "ALTER TABLE alerts ADD COLUMN arrive_time TEXT" },
  { table: "alerts", column: "agency", ddl: "ALTER TABLE alerts ADD COLUMN agency TEXT" },
  { table: "alerts", column: "itinerary_ids", ddl: "ALTER TABLE alerts ADD COLUMN itinerary_ids TEXT" },
  { table: "alerts", column: "fare_type", ddl: "ALTER TABLE alerts ADD COLUMN fare_type TEXT" },
  { table: "alerts", column: "expired", ddl: "ALTER TABLE alerts ADD COLUMN expired INTEGER NOT NULL DEFAULT 0" },
  { table: "alerts", column: "verified_at", ddl: "ALTER TABLE alerts ADD COLUMN verified_at TEXT" },
  { table: "alerts", column: "latest_price", ddl: "ALTER TABLE alerts ADD COLUMN latest_price INTEGER" },
  { table: "alerts", column: "source", ddl: "ALTER TABLE alerts ADD COLUMN source TEXT" },
  { table: "alerts", column: "booking_url", ddl: "ALTER TABLE alerts ADD COLUMN booking_url TEXT" },
  { table: "alerts", column: "booking_partner", ddl: "ALTER TABLE alerts ADD COLUMN booking_partner TEXT" },
  { table: "fares", column: "itinerary_ids", ddl: "ALTER TABLE fares ADD COLUMN itinerary_ids TEXT" },
  { table: "fares", column: "fare_type", ddl: "ALTER TABLE fares ADD COLUMN fare_type TEXT" },
];

// dev HMR로 모듈이 재로드돼도 커넥션은 하나만 유지
const globalForDb = globalThis as unknown as { __planeScanDb?: Database.Database };

function createDb(): Database.Database {
  const dataDir = path.join(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, "plane-scan.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  for (const m of MIGRATIONS) {
    const cols = db.prepare(`PRAGMA table_info(${m.table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === m.column)) db.exec(m.ddl);
  }
  return db;
}

export function getDb(): Database.Database {
  if (!globalForDb.__planeScanDb) {
    globalForDb.__planeScanDb = createDb();
  }
  return globalForDb.__planeScanDb;
}

export interface WatchRow {
  id: number;
  origin: string;
  destination: string;
  depart_date: string;
  return_date: string | null;
  time_from: string;
  time_to: string;
  max_price: number;
  active: number;
  created_at: string;
  return_time_from: string | null;
  return_time_to: string | null;
  direct_only: number;
}

export interface FareRow {
  id: number;
  watch_id: number;
  airline: string;
  flight_no: string | null;
  depart_time: string;
  arrive_time: string | null;
  price: number;
  agency: string | null;
  fetched_at: string;
  itinerary_ids: string | null;
  fare_type: string | null;
  return_depart_time: string | null;
  duration_min: number | null;
  stops: number | null;
}

export interface AlertRow {
  id: number;
  watch_id: number;
  price: number;
  airline: string;
  depart_time: string;
  deeplink: string;
  message: string;
  read: number;
  created_at: string;
  flight_no: string | null;
  arrive_time: string | null;
  agency: string | null;
  itinerary_ids: string | null;
  fare_type: string | null;
  expired: number;
  verified_at: string | null;
  latest_price: number | null;
  source: string | null;
  booking_url: string | null;
  booking_partner: string | null;
  return_depart_time: string | null;
  duration_min: number | null;
  stops: number | null;
  dismissed: number;
}

export interface FavoriteRouteRow {
  id: number;
  origin: string;
  destination: string;
  label: string | null;
  use_count: number;
  created_at: string;
}

export interface PushSubscriptionRow {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}
