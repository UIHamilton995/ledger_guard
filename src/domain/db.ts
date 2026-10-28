import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type Db = Database.Database;

/**
 * Open the mock-ERP database.
 * Agents' read tools should receive a `readonly: true` handle so that even a
 * bug cannot mutate ERP tables through them.
 */
export function openDb(path: string, options: { readonly?: boolean } = {}): Db {
  const db = new Database(path, { readonly: options.readonly ?? false });
  db.pragma("foreign_keys = ON");
  return db;
}

export function applySchema(db: Db): void {
  const here = dirname(fileURLToPath(import.meta.url));
  db.exec(readFileSync(join(here, "schema.sql"), "utf8"));
}
