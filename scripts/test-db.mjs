#!/usr/bin/env node
/**
 * Prépare la base de test dédiée : migrations, puis données de test.
 *
 * Pourquoi une base à part : les tests E2E créent, modifient et effacent des
 * données, et une suite complète consomme beaucoup de calcul. Sur la base de
 * développement, ils ont fini par en épuiser le quota (Neon, 21 septembre
 * 2026) et mélangeaient leurs données à celles du développement.
 *
 * Le peuplement (prisma/seed.ts) EFFACE clients, animaux, rendez-vous et
 * prestations avant de recréer des données fictives. D'où trois garde-fous,
 * tous obligatoires :
 *   1. l'adresse vient de .env.test.local, jamais de .env.local ;
 *   2. elle doit différer de celle de .env.local ;
 *   3. la base doit porter la marque « test » (table _TestDatabase) — posée
 *      seulement si la base est vierge. Une base qui a déjà des comptes et
 *      pas la marque est refusée : ce n'est pas une base de test.
 *
 * Usage, depuis le dossier du projet :
 *   npm run test:db:setup
 */
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { parse } from "dotenv";
import pg from "pg";

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

if (!existsSync(".env.test.local")) {
  fail("Fichier .env.test.local introuvable. Copiez .env.test.local.example et renseignez l'adresse de la base de test.");
}
const testEnv = parse(readFileSync(".env.test.local"));
const devEnv = existsSync(".env.local") ? parse(readFileSync(".env.local")) : {};
const testUrl = testEnv.DATABASE_URL;
if (!testUrl) fail("DATABASE_URL manquant dans .env.test.local.");

/** Hôte + base, sans identifiants : ce qui désigne réellement une base. */
function target(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return url;
  }
}
if (devEnv.DATABASE_URL && target(devEnv.DATABASE_URL) === target(testUrl)) {
  fail("La base de test est la même que celle de développement (.env.local). Refus : le peuplement l'effacerait.");
}

const client = new pg.Client({ connectionString: testUrl });
await client.connect();
try {
  const { rows: [marker] } = await client.query(`SELECT to_regclass('public."_TestDatabase"') IS NOT NULL AS present`);
  if (!marker.present) {
    const { rows: [users] } = await client.query(`SELECT to_regclass('public."User"') IS NOT NULL AS present`);
    if (users.present) {
      const { rows: [count] } = await client.query(`SELECT count(*)::int AS n FROM "User"`);
      if (count.n > 0) fail(`Cette base contient ${count.n} compte(s) et n'est pas marquée comme base de test. Refus : le peuplement effacerait ses données.`);
    }
    await client.query(`CREATE TABLE "_TestDatabase" ("createdAt" timestamptz NOT NULL DEFAULT now())`);
    await client.query(`INSERT INTO "_TestDatabase" DEFAULT VALUES`);
    console.log("✓ Base vierge marquée comme base de test.");
  } else {
    console.log("✓ Base de test reconnue.");
  }
} finally {
  await client.end();
}

// Toutes les étapes suivantes reçoivent l'adresse de test dans leur
// environnement : dotenv ne remplace jamais une variable déjà définie, donc
// le .env.local chargé par ces scripts ne peut pas la supplanter.
const env = { ...process.env, ...testEnv };
function run(label, command, args) {
  console.log(`\n→ ${label}`);
  const result = spawnSync(command, args, { stdio: "inherit", env, shell: process.platform === "win32" });
  if (result.status !== 0) fail(`${label} a échoué.`);
}

run("Migrations", "node", ["scripts/apply-migrations.mjs"]);
run("Données de test (comptes, prestations, clients fictifs)", "npx", ["tsx", "prisma/seed.ts"]);
run("Modèles de comptes rendus", "npx", ["tsx", "prisma/seed-document-templates.ts"]);

console.log("\n✓ Base de test prête. Lancer les tests : npm run test:e2e\n");
