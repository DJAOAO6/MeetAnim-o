#!/usr/bin/env node
/**
 * Compte restreint de l'application : la seconde barrière du cloisonnement.
 *
 * Les règles de la base (Row-Level Security) empêchent un espace de voir les
 * lignes d'un autre — mais PostgreSQL les ignore pour un superutilisateur.
 * Quand l'hébergeur ne fournit qu'un tel compte (c'est le cas d'Iridflow),
 * ce script s'en sert pour créer un compte ordinaire, `app_runtime`, et rend
 * l'adresse de connexion à utiliser pour faire tourner le site. Les
 * migrations, elles, continuent de passer par le compte d'origine : modifier
 * la structure des tables demande ses droits.
 *
 * Ce qu'il écrit sur la sortie standard est l'adresse de connexion, et rien
 * d'autre : le démarrage du conteneur la reprend (Dockerfile). Les messages
 * vont sur la sortie d'erreur, donc au journal, jamais l'adresse.
 *
 * - Compte ordinaire fourni (la plupart des hébergeurs, le poste de
 *   développement, l'intégration continue) : rien à faire, l'adresse est
 *   rendue telle quelle.
 * - Superutilisateur : le compte restreint est créé ou mis à jour, ses droits
 *   sont reposés sur toutes les tables (celles des migrations du jour
 *   comprises), puis la connexion est essayée avant d'être rendue.
 * - Le moindre échec : l'adresse d'origine est rendue, avec un avertissement.
 *   Le site démarre comme avant, jamais pas du tout.
 *
 * Le mot de passe n'est stocké nulle part : il est dérivé d'un secret déjà
 * présent sur le serveur (RUNTIME_DB_SECRET, à défaut SESSION_SECRET). Il est
 * donc le même d'un démarrage à l'autre — l'ancienne et la nouvelle version,
 * qui tournent ensemble le temps d'un déploiement, s'accordent sans se
 * couper l'une l'autre.
 */
import { createHmac } from "node:crypto";
import pg from "pg";

const ROLE = "app_runtime";
const original = process.env.DATABASE_URL ?? "";

function log(message) {
  process.stderr.write(`[cloisonnement] ${message}\n`);
}

async function prepare() {
  if (!original) return original;

  const secret = process.env.RUNTIME_DB_SECRET || process.env.SESSION_SECRET;
  const admin = new pg.Client({ connectionString: original });
  await admin.connect();
  let password;
  try {
    const { rows: [me] } = await admin.query("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user");
    if (!me?.rolsuper && !me?.rolbypassrls) {
      log("compte de connexion ordinaire : pas de compte restreint à préparer.");
      return original;
    }
    if (!secret) {
      log("ATTENTION : aucun secret pour dériver le mot de passe du compte restreint (RUNTIME_DB_SECRET ou SESSION_SECRET).");
      return original;
    }
    password = createHmac("sha256", secret).update(`${ROLE}:postgres`).digest("hex");

    const role = admin.escapeIdentifier(ROLE);
    const { rows: [database] } = await admin.query("SELECT current_database() AS name");
    const exists = (await admin.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [ROLE])).rowCount > 0;

    await admin.query("BEGIN");
    // Aucun pouvoir particulier : ni superutilisateur, ni contournement des
    // règles, ni création de base ou de compte.
    await admin.query(`${exists ? "ALTER" : "CREATE"} ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD ${admin.escapeLiteral(password)}`);
    await admin.query(`GRANT CONNECT ON DATABASE ${admin.escapeIdentifier(database.name)} TO ${role}`);
    await admin.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    // Lire et écrire des lignes, rien d'autre : ni créer, ni modifier, ni
    // supprimer une table. Reposé à chaque démarrage, après les migrations,
    // pour couvrir les tables qu'elles viennent d'ajouter.
    await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${role}`);
    await admin.query(`GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
    // L'historique des migrations n'est pas l'affaire du site.
    await admin.query(`DO $$ BEGIN
      IF to_regclass('public."_prisma_migrations"') IS NOT NULL THEN
        EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON "_prisma_migrations" FROM ${ROLE}';
      END IF;
    END $$`);
    await admin.query("COMMIT");
  } catch (error) {
    await admin.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await admin.end();
  }

  const runtime = new URL(original);
  runtime.username = ROLE;
  runtime.password = password;
  const url = runtime.toString();

  // Essai avant de rendre l'adresse : si ce compte ne peut pas se connecter
  // (règles d'accès de l'hébergeur), mieux vaut démarrer comme avant.
  const probe = new pg.Client({ connectionString: url });
  await probe.connect();
  try {
    const { rows: [check] } = await probe.query(`SELECT current_user AS role, (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS superuser, (SELECT count(*) FROM "Organization") AS organizations`);
    if (check.role !== ROLE || check.superuser) throw new Error(`essai de connexion inattendu (compte « ${check.role} »)`);
  } finally {
    await probe.end();
  }
  log(`compte restreint « ${ROLE} » prêt : le site tourne sans droit de contourner les règles.`);
  return url;
}

let result = original;
try {
  result = await prepare();
} catch (error) {
  const reason = (error instanceof Error && (error.message || error.code || error.name)) || String(error);
  log(`ATTENTION : compte restreint impossible à préparer (${reason}). Le site démarre avec le compte d'origine.`);
  result = original;
}
process.stdout.write(result);
