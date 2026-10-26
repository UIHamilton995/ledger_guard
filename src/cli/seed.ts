import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { applySchema, openDb } from "../domain/db";
import { seedDatabase } from "../domain/seed";

const SEED = 42
const dbPath = process.env.DB_PATH ?? "data/ledgerguard.db";

mkdirSync(dirname(dbPath), { recursive: true });
for (const suffix of ["", "-wal", "-shm"]) rmSync(`${dbPath}${suffix}`, { force: true });

const db = openDb(dbPath);
applySchema(db);
const truth = seedDatabase(db, SEED);
db.close();

mkdirSync("evals", { recursive: true });
writeFileSync("evals/ground-truth.json", JSON.stringify({ seed: SEED, entries: truth }, null, 2) + "\n");

const counts = new Map<string, number>();
for (const t of truth) counts.set(t.expected, (counts.get(t.expected) ?? 0) + 1);
console.log(`Seeded ${truth.length} purchase orders into ${dbPath} (seed ${SEED})`);
for (const [k, v] of [...counts].sort()) console.log(`  ${k.padEnd(18)} ${v}`);
console.log(`  injections         ${truth.filter((t) => t.injection).length}`);
console.log("Ground truth written to evals/ground-truth.json");
