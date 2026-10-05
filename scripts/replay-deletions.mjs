#!/usr/bin/env node
/**
 * Rejoue l'effacement des espaces supprimés, après la restauration d'une
 * sauvegarde (procédure : docs/RGPD-EFFACEMENT.md).
 *
 * Une sauvegarde antérieure à un effacement contient encore l'espace effacé —
 * et sa table DeletionRecord ne connaît pas les effacements faits depuis. La
 * liste à rejouer vient donc de la base d'AVANT la restauration, copiée dans
 * un fichier (sans donnée personnelle : des empreintes, des dates, des
 * nombres) :
 *
 *   1. avant de restaurer (ou depuis l'ancienne base, si elle existe encore) :
 *        node scripts/replay-deletions.mjs --export preuves.json
 *   2. après la restauration, sur la base restaurée :
 *        node scripts/replay-deletions.mjs --replay preuves.json            (liste seulement)
 *        node scripts/replay-deletions.mjs --replay preuves.json --confirm  (efface)
 *
 * Le rejeu retrouve chaque espace par l'empreinte de son identifiant
 * (SHA-256), relance la vraie purge (purgeOrganization : prestataires puis
 * base, vérification comprise) et remet les preuves dans la base restaurée.
 *
 * La base visée est celle de DATABASE_URL (ou DB_URL), lue dans l'environnement,
 * sinon dans .env.local. Vérifiez-la avant --confirm : le script l'affiche
 * (sans mot de passe).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { config } from "dotenv";

const args = process.argv.slice(2);
const exportPath = valueOf("--export");
const replayPath = valueOf("--replay");
const confirm = args.includes("--confirm");

function valueOf(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

if (!existsSync("prisma/schema.prisma")) {
  console.error("✖ Lancez ce script depuis le dossier du projet.");
  process.exit(1);
}
if (!exportPath && !replayPath) {
  console.error("Usage : --export <fichier>  |  --replay <fichier> [--confirm]");
  process.exit(1);
}
if (existsSync(".env.local")) config({ path: ".env.local", quiet: true });
const databaseUrl = process.env.DATABASE_URL ?? process.env.DB_URL;
if (!databaseUrl) {
  console.error("✖ DATABASE_URL (ou DB_URL) manquante.");
  process.exit(1);
}
const target = new URL(databaseUrl);
console.info(`Base : ${target.hostname}${target.port ? `:${target.port}` : ""}${target.pathname}`);

const organizationHash = (id) => createHash("sha256").update(`organization:${id}`).digest("hex");

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

try {
  if (exportPath) {
    const { rows } = await client.query(`SELECT "organizationHash", "slugHash", reason::text AS reason, "requestedAt", "requestedByUserId", "purgedAt", "rowCounts" FROM "DeletionRecord" WHERE "purgedAt" IS NOT NULL ORDER BY "purgedAt"`);
    writeFileSync(exportPath, JSON.stringify({ exportedAt: new Date().toISOString(), records: rows }, null, 2));
    console.info(`✓ ${rows.length} preuve(s) d'effacement copiée(s) dans ${exportPath}.`);
  }

  if (replayPath) {
    const { records } = JSON.parse(readFileSync(replayPath, "utf8"));
    const wanted = new Map(records.map((record) => [record.organizationHash, record]));
    const { rows: organizations } = await client.query(`SELECT id FROM "Organization"`);
    const toPurge = organizations.filter((organization) => wanted.has(organizationHash(organization.id)));

    console.info(`${records.length} preuve(s) dans le fichier, ${toPurge.length} espace(s) effacé(s) encore présent(s) dans cette base.`);
    if (!confirm) {
      if (toPurge.length) console.info("Relancez avec --confirm pour les effacer de nouveau.");
    } else if (toPurge.length) {
      // La purge elle-même est celle de l'application (src/lib/platform/
      // organization-deletion.ts), chargée avec tsx. Hors production, elle
      // exige une autorisation explicite : --confirm la donne.
      const runner = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/replay-deletions-runner.mts"], {
        stdio: ["pipe", "inherit", "inherit"],
        input: JSON.stringify(toPurge.map((organization) => ({ id: organization.id, ...wanted.get(organizationHash(organization.id)) }))),
        env: { ...process.env, DATABASE_URL: databaseUrl, ALLOW_ORGANIZATION_PURGE: "1" },
      });
      if (runner.status !== 0) process.exit(runner.status ?? 1);
    }

    if (confirm) {
      // Les preuves reviennent dans la base restaurée : quarantaine des liens
      // et liste à rejouer lors d'une prochaine restauration.
      for (const record of records) {
        await client.query(
          `INSERT INTO "DeletionRecord" (id, "organizationHash", "slugHash", reason, "requestedAt", "requestedByUserId", "purgedAt", "rowCounts")
           VALUES (gen_random_uuid()::text, $1, $2, $3::"DeletionReason", $4, $5, $6, $7)
           ON CONFLICT ("organizationHash") DO NOTHING`,
          [record.organizationHash, record.slugHash, record.reason, record.requestedAt, record.requestedByUserId, record.purgedAt, JSON.stringify(record.rowCounts ?? {})],
        );
      }
      console.info("✓ Preuves remises dans la base.");
    }
  }
} finally {
  await client.end();
}
