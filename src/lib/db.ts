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

CREATE INDEX IF NOT EXISTS idx_fares_watch  ON fares(watch_id, fetched_at);
CREATE INDEX IF NOT EXISTS idx_alerts_watch ON alerts(watch_id, created_at);
`;

// dev HMR로 모듈이 재로드돼도 커넥션은 하나만 유지
const globalForDb = globalThis as unknown as { __planeScanDb?: Database.Database };

function createDb(): Database.Database {
  const dataDir = path.join(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, "plane-scan.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
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
}
