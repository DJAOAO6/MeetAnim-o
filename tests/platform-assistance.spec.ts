import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { neon } from "./helpers/sql";
import { config } from "dotenv";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

/**
 * Super-administration : la phase la plus sensible du chantier, puisqu'elle
 * ouvre les données de tous les cabinets.
 *
 * Ce qui est vérifié, dans l'ordre où ça compte :
 * - sans le rôle, la page n'existe pas — pas même un refus qui confirmerait
 *   qu'il y a quelque chose ;
 * - le rôle sans double authentification ne suffit pas ;
 * - une assistance exige un motif, affiche un bandeau, et chaque action faite
 *   pendant ce temps est attribuée, au journal du cabinet, à celui qui
 *   assiste ;
 * - elle s'arrête : à la demande, à l'échéance, ou dès que le rôle est retiré ;
 * - elle ne permet pas de toucher aux comptes de l'équipe.
 *
 * Le compte de plateforme est créé pour l'occasion, hors de tout cabinet,
 * puis supprimé.
 */
const PLATFORM_EMAIL = "plateforme-e2e@example.fr";
const PLATFORM_PASSWORD = "Plateforme-E2E-2026!";
const PRACTITIONER_EMAIL = "praticien-test@pf-osteo-animale.fr";
const ADMIN_EMAIL = "pauline@pf-osteo-animale.fr";
const KNOWN_CODE = "481516";
const REASON = "Test automatique : rendez-vous qui ne s'affichent plus";

let platformId = "";

function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function createPlatformAccount() {
  await removePlatformAccount();
  const bcrypt = (await import("bcryptjs")).default;
  const [row] = await sql`
    INSERT INTO "User" (id, email, "passwordHash", "firstName", "lastName", role, permissions, "platformAdmin", "twoFactorEnabled", "organizationId", "updatedAt")
    VALUES (${`plateforme-e2e-${Date.now()}`}, ${PLATFORM_EMAIL}, ${await bcrypt.hash(PLATFORM_PASSWORD, 10)}, 'Plateforme', 'Test', 'PRACTITIONER', ARRAY[]::text[], true, true, NULL, now())
    RETURNING id`;
  platformId = row.id as string;
}

async function removePlatformAccount() {
  const rows = await sql`SELECT id FROM "User" WHERE email = ${PLATFORM_EMAIL}`;
  for (const row of rows) {
    await sql`DELETE FROM "AuditLog" WHERE "impersonatorId" = ${row.id} OR "userId" = ${row.id}`;
    await sql`DELETE FROM "Session" WHERE "impersonatorId" = ${row.id} OR "userId" = ${row.id}`;
    await sql`DELETE FROM "User" WHERE id = ${row.id}`;
  }
}

/** Connexion du compte de plateforme, double authentification comprise. */
async function loginAsPlatform(page: Page) {
  await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%'`;
  await sql`DELETE FROM "TwoFactorCode" WHERE "userId" = ${platformId}`;
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', PLATFORM_EMAIL);
  await page.fill('input[type="password"]', PLATFORM_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/login/verification**", { timeout: 15000 });
  await sql`
    UPDATE "TwoFactorCode" SET "codeHash" = ${hashToken(KNOWN_CODE)}
    WHERE id = (SELECT id FROM "TwoFactorCode" WHERE "userId" = ${platformId} AND "usedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 1)`;
  await page.fill('input[name="code"]', KNOWN_CODE);
  await page.getByRole("button", { name: "Valider" }).click();
  // Sans cabinet, l'espace professionnel renvoie vers la super-administration.
  await page.waitForURL("**/plateforme**", { timeout: 15000 });
}

/** Ouvre l'assistance d'un compte depuis la liste de la plateforme. */
async function startAssistance(page: Page, email: string, reason: string) {
  await page.goto("/plateforme", { waitUntil: "networkidle" });
  const row = page.getByRole("listitem").filter({ hasText: email });
  await row.getByRole("button", { name: "Assister" }).click();
  await row.getByLabel("Motif de l’assistance").fill(reason);
  await row.getByRole("button", { name: /^Ouvrir l’assistance/ }).click();
}

test.describe.configure({ mode: "serial" });

test.beforeAll(createPlatformAccount);
test.afterAll(removePlatformAccount);

test("sans le rôle de plateforme, la page n'existe pas", async ({ browser }) => {
  const context = await browser.newContext({ storageState: "tests/.auth/practitioner.json" });
  try {
    const page = await context.newPage();
    const response = await page.goto("/plateforme", { waitUntil: "networkidle" });
    expect(response?.status(), "introuvable, pas « accès refusé » : rien ne confirme que la page existe").toBe(404);
    await expect(page.getByText("Cabinets de la plateforme")).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("le rôle sans double authentification ne suffit pas", async ({ page }) => {
  await sql`UPDATE "User" SET "twoFactorEnabled" = false WHERE id = ${platformId}`;
  try {
    await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%'`;
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.fill('input[type="email"]', PLATFORM_EMAIL);
    await page.fill('input[type="password"]', PLATFORM_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/plateforme**", { timeout: 15000 });
    // Le message de refus, pas l'annonceur de navigation de Next, qui porte
    // lui aussi le rôle « alert ».
    await expect(page.getByRole("alert").filter({ hasText: "double authentification est obligatoire" })).toBeVisible();
    await expect(page.getByText("Cabinets de la plateforme")).toHaveCount(0);
  } finally {
    await sql`UPDATE "User" SET "twoFactorEnabled" = true WHERE id = ${platformId}`;
  }
});

test("une assistance exige un motif, s'affiche en permanence, et chaque action est attribuée à celui qui assiste", async ({ page }) => {
  await loginAsPlatform(page);
  await expect(page.getByRole("heading", { name: "Cabinets de la plateforme" })).toBeVisible();

  // Sans motif : refusé, et rien n'est ouvert.
  const row = page.getByRole("listitem").filter({ hasText: PRACTITIONER_EMAIL });
  await row.getByRole("button", { name: "Assister" }).click();
  await row.getByRole("button", { name: /^Ouvrir l’assistance/ }).click();
  await expect(row.getByRole("alert")).toContainText("motif");
  const [before] = await sql`SELECT count(*)::int AS n FROM "Session" WHERE "impersonatorId" = ${platformId}`;
  expect(before.n, "aucune assistance ouverte sans motif").toBe(0);

  // Avec motif : l'espace du professionnel, bandeau en tête.
  await startAssistance(page, PRACTITIONER_EMAIL, REASON);
  await page.waitForURL("**/dashboard**", { timeout: 15000 });
  const banner = page.getByRole("region", { name: "Mode assistance" });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("Camille Test");
  await expect(banner).toContainText(REASON);

  // Une action journalisée : consulter une fiche client.
  const [client] = await sql`SELECT id FROM "Client" WHERE "organizationId" = 'org-1002-pattes' ORDER BY "createdAt" LIMIT 1`;
  await page.goto(`/dashboard/clients/${client.id}`, { waitUntil: "networkidle" });
  await expect(page.getByRole("region", { name: "Mode assistance" }), "le bandeau suit sur chaque écran").toBeVisible();

  const [practitioner] = await sql`SELECT id FROM "User" WHERE email = ${PRACTITIONER_EMAIL}`;
  const [started] = await sql`
    SELECT "organizationId", metadata FROM "AuditLog"
    WHERE action = 'ASSISTANCE_STARTED' AND "impersonatorId" = ${platformId} AND "userId" = ${practitioner.id}
    ORDER BY "createdAt" DESC LIMIT 1`;
  expect(started, "l'ouverture est inscrite au journal").toBeTruthy();
  expect(started.organizationId, "…au journal du cabinet assisté").toBe("org-1002-pattes");
  expect((started.metadata as { reason: string }).reason).toBe(REASON);

  const [viewed] = await sql`
    SELECT "impersonatorId" FROM "AuditLog"
    WHERE action = 'CLIENT_VIEWED' AND "entityId" = ${client.id} AND "userId" = ${practitioner.id}
    ORDER BY "createdAt" DESC LIMIT 1`;
  expect(viewed?.impersonatorId, "la consultation est attribuée à celui qui assiste, pas au professionnel").toBe(platformId);

  // Fin : retour à la plateforme, session d'assistance révoquée.
  await banner.getByRole("button", { name: "Terminer l’assistance" }).click();
  await page.waitForURL("**/plateforme**", { timeout: 15000 });
  await expect(page.getByRole("heading", { name: "Cabinets de la plateforme" })).toBeVisible();
  const [open] = await sql`SELECT count(*)::int AS n FROM "Session" WHERE "impersonatorId" = ${platformId} AND "revokedAt" IS NULL`;
  expect(open.n, "plus aucune assistance ouverte").toBe(0);
  const [ended] = await sql`SELECT count(*)::int AS n FROM "AuditLog" WHERE action = 'ASSISTANCE_ENDED' AND "impersonatorId" = ${platformId}`;
  expect(ended.n, "la fin est inscrite au journal").toBeGreaterThan(0);
});

test("une assistance s'arrête d'elle-même à l'échéance", async ({ page }) => {
  await loginAsPlatform(page);
  await startAssistance(page, PRACTITIONER_EMAIL, REASON);
  await page.waitForURL("**/dashboard**", { timeout: 15000 });

  await sql`UPDATE "Session" SET "expiresAt" = now() - interval '1 minute' WHERE "impersonatorId" = ${platformId} AND "revokedAt" IS NULL`;
  await page.goto("/dashboard", { waitUntil: "networkidle" });
  await expect(page, "l'assistance échue ne rouvre plus l'espace du professionnel").toHaveURL(/\/login/);
});

test("retirer le rôle coupe l'assistance en cours", async ({ page }) => {
  await loginAsPlatform(page);
  await startAssistance(page, PRACTITIONER_EMAIL, REASON);
  await page.waitForURL("**/dashboard**", { timeout: 15000 });

  await sql`UPDATE "User" SET "platformAdmin" = false WHERE id = ${platformId}`;
  try {
    await page.goto("/dashboard", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/login/);
  } finally {
    await sql`UPDATE "User" SET "platformAdmin" = true WHERE id = ${platformId}`;
  }
});

test("pendant une assistance, les comptes de l'équipe ne se modifient pas", async ({ page }) => {
  await loginAsPlatform(page);
  await startAssistance(page, ADMIN_EMAIL, REASON);
  await page.waitForURL("**/dashboard**", { timeout: 15000 });

  await page.goto("/dashboard/admin", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "+ Nouveau compte" }).click();
  await page.locator('input[name="firstName"]').fill("Intrus");
  await page.locator('input[name="lastName"]').fill("Test");
  await page.locator('input[name="email"]').fill("intrus-assistance@example.fr");
  await page.getByRole("button", { name: /Créer le compte|Créer/ }).first().click();
  await expect(page.getByText("les comptes de l'équipe ne se modifient pas")).toBeVisible({ timeout: 15000 });

  const [created] = await sql`SELECT count(*)::int AS n FROM "User" WHERE email = 'intrus-assistance@example.fr'`;
  expect(created.n, "aucun compte créé pendant l'assistance").toBe(0);
});
