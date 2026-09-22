import pg from "pg";
import { expect, test } from "@playwright/test";
import { neon } from "./helpers/sql";
import { config } from "dotenv";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

/**
 * Seconde barrière : le cloisonnement tient-il **sans** le filtre applicatif ?
 *
 * Les autres suites vérifient l'application. Celle-ci vérifie la base : elle
 * parle à PostgreSQL directement, en court-circuitant tout le code, et
 * demande sans détour les données d'un autre cabinet. C'est la situation
 * qu'on redoute — une requête qui aurait échappé au filtre — jouée
 * volontairement.
 *
 * Une connexion de l'application déclare toujours le cabinet qu'elle sert
 * (`app.organization_id`, voir src/lib/db.ts). Ces tests font de même, puis
 * demandent ce qui appartient à l'autre.
 *
 * Limite connue, et volontaire : une connexion qui ne déclare rien voit tout
 * — migrations, peuplement et scripts d'entretien en ont besoin. Le dernier
 * test le constate, pour que cette limite soit écrite noir sur blanc plutôt
 * que découverte un jour par surprise.
 */
const A = "org-e2e-rls-a";
const B = "org-e2e-rls-b";
const MARKER = "E2E-RLS";

/**
 * Une connexion à elle seule, qui se présente comme servant ce cabinet.
 *
 * Une connexion à part, et non celle des autres requêtes du test : le
 * réglage vaut pour toute la connexion, et le partager fausserait aussi bien
 * les essais que les vérifications — c'est d'ailleurs ce qui est arrivé à la
 * première version de ce fichier.
 */
async function connectAs(organizationId: string | null): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  if (organizationId) await client.query("SELECT set_config('app.organization_id', $1, false)", [organizationId]);
  return client;
}

async function seed() {
  await cleanup();
  for (const [organizationId, suffix] of [[A, "a"], [B, "b"]] as const) {
    await sql`INSERT INTO "Organization" (id, name, "createdAt", "updatedAt") VALUES (${organizationId}, ${`${MARKER} ${suffix}`}, now(), now())`;
    await sql`
      INSERT INTO "Client" (id, "organizationId", "firstName", "lastName", phone, email, city, address, "updatedAt")
      VALUES (${`${organizationId}-client`}, ${organizationId}, 'Camille', ${`${MARKER}${suffix}`}, '0600000000', ${`rls-${suffix}@example.fr`}, 'Rouen', '1 rue Test', now())`;
  }
}

async function cleanup() {
  await sql`DELETE FROM "Client" WHERE "organizationId" IN (${A}, ${B})`;
  await sql`DELETE FROM "Organization" WHERE id IN (${A}, ${B})`;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(seed);
test.afterAll(cleanup);

test("une connexion qui sert un cabinet ne voit que ses lignes", async () => {
  const client = await connectAs(A);
  try {
    const { rows } = await client.query(`SELECT id, "organizationId" FROM "Client" WHERE "lastName" LIKE $1`, [`${MARKER}%`]);
    expect(rows.length, "seule la fiche du cabinet A est visible").toBe(1);
    expect(rows[0].organizationId).toBe(A);
  } finally {
    await client.end();
  }
});

test("demander explicitement la fiche de l'autre cabinet ne renvoie rien", async () => {
  // Le cas qui compte : le filtre applicatif a été contourné, l'identifiant
  // de l'autre est connu, et la requête le demande nommément.
  const client = await connectAs(A);
  try {
    const { rows } = await client.query(`SELECT id FROM "Client" WHERE id = $1`, [`${B}-client`]);
    expect(rows.length, "la base refuse la fiche d'un autre cabinet").toBe(0);
  } finally {
    await client.end();
  }
});

test("modifier ou supprimer la fiche de l'autre cabinet ne change rien", async () => {
  const client = await connectAs(A);
  try {
    const modification = await client.query(`UPDATE "Client" SET "firstName" = 'Piraté' WHERE id = $1`, [`${B}-client`]);
    const suppression = await client.query(`DELETE FROM "Client" WHERE id = $1`, [`${B}-client`]);
    expect(modification.rowCount, "aucune ligne modifiée").toBe(0);
    expect(suppression.rowCount, "aucune ligne supprimée").toBe(0);
  } finally {
    await client.end();
  }

  // Vérification depuis une connexion qui ne déclare aucun cabinet : sinon
  // la fiche de B serait invisible, et le test passerait sans rien prouver.
  const témoin = await connectAs(null);
  try {
    const { rows } = await témoin.query(`SELECT "firstName" FROM "Client" WHERE id = $1`, [`${B}-client`]);
    expect(rows[0]?.firstName, "la fiche du cabinet B est intacte").toBe("Camille");
  } finally {
    await témoin.end();
  }
});

test("écrire chez l'autre cabinet est refusé, pas seulement invisible", async () => {
  const client = await connectAs(A);
  try {
    await expect(
      client.query(
        `INSERT INTO "Client" (id, "organizationId", "firstName", "lastName", phone, email, city, address, "updatedAt")
         VALUES ($1, $2, 'Intrus', $3, '0600000000', 'intrus@example.fr', 'Rouen', '1 rue Test', now())`,
        [`${A}-intrus`, B, `${MARKER}intrus`],
      ),
      "insérer une ligne au nom d'un autre cabinet doit être refusé",
    ).rejects.toThrow();
  } finally {
    await client.end();
  }
});

test("une connexion qui ne déclare aucun cabinet voit tout : la limite, énoncée", async () => {
  // Ce n'est pas un défaut caché, c'est le compromis actuel : migrations,
  // peuplement et scripts d'entretien passent par là. L'étape suivante — un
  // rôle dédié pour l'application, sans cette échappatoire — est décrite
  // dans docs/PLAN-MULTI-COMPTES.md, à faire avant le premier cabinet
  // extérieur.
  const rows = await sql`SELECT "organizationId" FROM "Client" WHERE "lastName" LIKE ${`${MARKER}%`}`;
  expect(rows.length, "sans cabinet déclaré, les deux fiches sont visibles").toBe(2);
});
