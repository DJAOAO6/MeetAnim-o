#!/usr/bin/env node
/**
 * Contrôle du rattachement aux espaces professionnels (multi-comptes,
 * phase 1) : chaque ligne métier doit appartenir à un espace.
 *
 * Ce que ce script vérifie, table par table :
 *   - combien de lignes existent ;
 *   - combien n'ont pas d'espace (doit être zéro, sauf exceptions voulues) ;
 *   - combien d'espaces distincts sont représentés.
 *
 * Exceptions voulues : les modèles de comptes rendus fournis par 1002 Pattes
 * (communs à tous les cabinets) et les comptes de plateforme.
 *
 * Usage, depuis le dossier du projet :
 *   node scripts/check-organizations.mjs               base de développement
 *   node scripts/check-organizations.mjs --test        base de test
 */
import { readFileSync, existsSync } from "node:fs";
import pg from "pg";
import { parse } from "dotenv";

const useTest = process.argv.includes("--test");
const envFile = useTest ? ".env.test.local" : ".env.local";
if (!existsSync(envFile)) {
  console.error(`✖ ${envFile} introuvable. Lancez ce script depuis le dossier du projet.`);
  process.exit(1);
}
const url = parse(readFileSync(envFile)).DATABASE_URL;

/** Tables où l'absence d'espace est un défaut. */
const required = [
  "BusinessProfile", "Client", "Animal", "Consultation", "AnimalDocument", "StudioDocument",
  "Appointment", "AppointmentCalendarEvent", "BlockedSlot", "Reminder", "Zone", "City",
  "Tour", "Service", "TourRun", "TourStop", "SavedPlace", "ClientImport",
];

/**
 * Tables où une ligne sans espace est légitime, avec la condition qui le
 * justifie. Les comptes de plateforme (super-administration, phase 7)
 * n'existent pas encore : aujourd'hui, tout compte appartient à un espace.
 */
const tolerated = {
  User: "false",
  StudioDocumentTemplate: `"isBuiltIn" = true`,
  // Une action sans compte (visiteur de la page publique, tâche de fond)
  // n'appartient à aucun cabinet.
  AuditLog: `"userId" IS NULL`,
};

const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  const { rows: organizations } = await client.query(`SELECT id, name FROM "Organization" ORDER BY "createdAt"`);
  console.log(`Espaces professionnels : ${organizations.length}`);
  for (const organization of organizations) console.log(`  - ${organization.name} (${organization.id})`);
  console.log("");

  let problems = 0;
  const report = [];

  for (const table of [...required, ...Object.keys(tolerated)]) {
    const exception = tolerated[table];
    const { rows: [row] } = await client.query(`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE "organizationId" IS NULL)::int AS orphelines,
             count(*) FILTER (WHERE "organizationId" IS NULL AND NOT (${exception ?? "false"}))::int AS anormales,
             count(DISTINCT "organizationId")::int AS espaces
      FROM "${table}"`);
    if (row.anormales > 0) problems += row.anormales;
    report.push({ table, ...row });
  }

  const width = Math.max(...report.map((line) => line.table.length));
  console.log(`${"Table".padEnd(width)}  lignes  sans espace  dont anormales  espaces`);
  for (const line of report) {
    console.log(
      `${line.table.padEnd(width)}  ${String(line.total).padStart(6)}  ${String(line.orphelines).padStart(11)}  `
      + `${String(line.anormales).padStart(14)}  ${String(line.espaces).padStart(7)}`,
    );
  }

  console.log("");
  if (problems > 0) {
    console.error(`✖ ${problems} ligne(s) sans espace professionnel là où il en faut un.`);
    process.exit(1);
  }
  console.log("✓ Toutes les données métier appartiennent à un espace professionnel.");
} finally {
  await client.end();
}
