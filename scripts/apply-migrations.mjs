#!/usr/bin/env node
/**
 * Applique les migrations Prisma en attente, sans le moteur natif de Prisma.
 *
 * Sur certains postes Windows, une stratégie de contrôle d'application bloque
 * `schema-engine-windows.exe` : `npx prisma migrate deploy` échoue alors avec
 * « spawn UNKNOWN ». Ce script fait le même travail avec le pilote Postgres
 * en JavaScript : il exécute chaque migration non encore appliquée, dans une
 * transaction, et l'inscrit dans `_prisma_migrations` avec la même somme de
 * contrôle (sha256 du fichier) que Prisma — qui la reconnaît ensuite comme
 * appliquée.
 *
 * La production n'en a pas besoin : son conteneur lance `prisma migrate
 * deploy` au démarrage (Dockerfile), sous Linux.
 *
 * Usage, depuis le dossier du projet :
 *   node scripts/apply-migrations.mjs            applique ce qui manque
 *   node scripts/apply-migrations.mjs --dry-run  liste seulement
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { config } from "dotenv";

const dryRun = process.argv.includes("--dry-run");

if (!existsSync("prisma/migrations") || !existsSync(".env.local")) {
  console.error("✖ Lancez ce script depuis le dossier du projet.");
  process.exit(1);
}
config({ path: ".env.local", quiet: true });

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  // Base vierge : la table d'historique n'existe pas encore. Même définition
  // que celle que crée Prisma, pour qu'il la reconnaisse ensuite.
  await client.query(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                  VARCHAR(36) PRIMARY KEY NOT NULL,
    "checksum"            VARCHAR(64) NOT NULL,
    "finished_at"         TIMESTAMPTZ,
    "migration_name"      VARCHAR(255) NOT NULL,
    "logs"                TEXT,
    "rolled_back_at"      TIMESTAMPTZ,
    "started_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
    "applied_steps_count" INTEGER NOT NULL DEFAULT 0
  )`);

  const { rows } = await client.query(`SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations"`);
  const applied = new Map(rows.map((row) => [row.migration_name, row]));

  const unfinished = rows.filter((row) => !row.finished_at && !row.rolled_back_at);
  if (unfinished.length) {
    console.error(`✖ Migration commencée mais jamais terminée : ${unfinished.map((row) => row.migration_name).join(", ")}. À examiner avant d'aller plus loin.`);
    process.exit(1);
  }

  const pending = readdirSync("prisma/migrations", { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(`prisma/migrations/${entry.name}/migration.sql`))
    .map((entry) => entry.name)
    .sort()
    .filter((name) => !applied.has(name));

  if (pending.length === 0) {
    console.log("✓ Base à jour, aucune migration en attente.");
    process.exit(0);
  }

  console.log(`${pending.length} migration(s) en attente :`);
  for (const name of pending) console.log(`  - ${name}`);
  if (dryRun) process.exit(0);

  for (const name of pending) {
    const script = readFileSync(`prisma/migrations/${name}/migration.sql`, "utf8");
    const checksum = createHash("sha256").update(script).digest("hex");
    const id = randomUUID();
    // Une migration entière ou rien : en cas d'échec, la base reste telle
    // qu'avant et la migration n'est pas marquée comme appliquée.
    await client.query("BEGIN");
    try {
      await client.query(`INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at, applied_steps_count) VALUES ($1, $2, $3, now(), 0)`, [id, checksum, name]);
      await client.query(script);
      await client.query(`UPDATE "_prisma_migrations" SET finished_at = now(), applied_steps_count = 1 WHERE id = $1`, [id]);
      await client.query("COMMIT");
      console.log(`✓ ${name}`);
    } catch (error) {
      await client.query("ROLLBACK");
      console.error(`✖ ${name} : ${error.message}`);
      process.exit(1);
    }
  }
  console.log("✓ Toutes les migrations sont appliquées.");
} finally {
  await client.end();
}
