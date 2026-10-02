import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
fs.mkdirSync(config.uploadDir, { recursive: true });

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = [path.join(here, 'schema.sql'), path.join(here, '../../src/db/schema.sql')].find((p) => fs.existsSync(p))!;
db.exec(fs.readFileSync(schemaPath, 'utf8'));

export const j = (v: any) => JSON.stringify(v ?? null);
export const parse = <T = any>(s: string | null | undefined, d: T): T => {
  try { return s ? (JSON.parse(s) as T) : d; } catch { return d; }
};
