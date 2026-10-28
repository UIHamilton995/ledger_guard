
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { applySchema, openDb } from "../domain/db";
import { seedDatabase } from "../domain/seed";

// Fixed seed keeps generated evaluation data reproducible.
const SEED = 42;
const dbPath = process.env.DB_PATH ?? "data/ledgerguard.db";

// Prepare the database directory before opening the database.
mkdirSync(dirname(dbPath), { recursive: true });

// Reset SQLite files to prevent stale data from contaminating evaluations.
// WARNING: This permanently deletes the database at dbPath.
for (const suffix of ["", "-wal", "-shm"]) {
  rmSync(`${dbPath}${suffix}`, { force: true });
}

const db = openDb(dbPath);
applySchema(db); // Initialize the schema before seeding.

const truth = seedDatabase(db, SEED); // Generate data and expected results.
db.close(); // Release the connection before writing evaluation artifacts.

// Keep evaluation outputs separate from the application database.
mkdirSync("evals", { recursive: true });
writeFileSync(
  "evals/ground-truth.json",
  JSON.stringify({ seed: SEED, entries: truth }, null, 2) + "\n"
);

// Summarize expected labels to expose dataset imbalances.
const counts = new Map<string, number>();
for (const t of truth) {
  counts.set(t.expected, (counts.get(t.expected) ?? 0) + 1);
}

console.log(`Seeded ${truth.length} purchase orders into ${dbPath} (seed ${SEED})`);
for (const [k, v] of [...counts].sort()) {
  console.log(`  ${k.padEnd(18)} ${v}`);
}

// Track injected cases separately to verify evaluation coverage.
console.log(`  injections         ${truth.filter((t) => t.injection).length}`);
console.log("Ground truth written to evals/ground-truth.json");
