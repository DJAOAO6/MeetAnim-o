import { expect, test, type Browser, type Page } from "@playwright/test";
import { neon } from "./helpers/sql";
import { createPlatformAccount, loginAsPlatform, removePlatformAccount } from "./helpers/platform";
import { config } from "dotenv";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

/**
 * Suspension d'un espace professionnel (chantier C9, phase 1), vérifiée par
 * ses effets réels et pas par l'écran : le professionnel est déconnecté et ne
 * peut plus se connecter, sa page publique n'existe plus, la tâche planifiée
 * n'envoie rien pour lui ; réactivé, tout revient.
 *
 * L'espace est créé pour le test, à part : jamais celui de démonstration.
 */
const PLATFORM_EMAIL = "plateforme-suspension-e2e@example.fr";
const ORG = "e2e-suspension-org";
const SLUG = "e2e-suspension";
const PRO_EMAIL = "suspension-e2e@example.fr";
const PRO_PASSWORD = "Suspension-E2E-2026!";
const APPOINTMENT = "e2e-suspension-rdv";
const CRON_SECRET = process.env.CRON_SECRET ?? "e2e-cron-local";

let platformId = "";

/** Date et heure de Paris, dans `hours` heures : le rappel de veille le retient. */
function parisIn(hours: number): { dateId: string; time: string } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(Date.now() + hours * 3600_000)).map((part) => [part.type, part.value]));
  return { dateId: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

async function cleanup() {
  await sql`DELETE FROM "Session" WHERE "userId" IN (SELECT id FROM "User" WHERE "organizationId" = ${ORG})`;
  await sql`DELETE FROM "AuditLog" WHERE "organizationId" = ${ORG} OR "userId" IN (SELECT id FROM "User" WHERE "organizationId" = ${ORG})`;
  await sql`DELETE FROM "Appointment" WHERE "organizationId" = ${ORG}`;
  await sql`DELETE FROM "Client" WHERE "organizationId" = ${ORG}`;
  await sql`DELETE FROM "BusinessProfile" WHERE "organizationId" = ${ORG}`;
  await sql`DELETE FROM "User" WHERE "organizationId" = ${ORG}`;
  await sql`DELETE FROM "Organization" WHERE id = ${ORG}`;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await cleanup();
  platformId = await createPlatformAccount(sql, PLATFORM_EMAIL);
  const bcrypt = (await import("bcryptjs")).default;
  await sql`INSERT INTO "Organization" (id, name, "onboardedAt", "createdAt", "updatedAt") VALUES (${ORG}, 'E2E Suspension', now(), now(), now())`;
  await sql`INSERT INTO "User" (id, email, "passwordHash", "firstName", "lastName", role, permissions, "organizationId", "updatedAt")
    VALUES (${`${ORG}-pro`}, ${PRO_EMAIL}, ${await bcrypt.hash(PRO_PASSWORD, 10)}, 'Pro', 'Suspension', 'ADMIN', ARRAY['MANAGE_PUBLIC_SETTINGS']::text[], ${ORG}, now())`;
  await sql`INSERT INTO "BusinessProfile" (id, "organizationId", slug, "firstName", "lastName", profession, company, phone, email, address, "postalCode", city, location, bio, photo, logo, "publicColor", "updatedAt")
    VALUES (${`${ORG}-profil`}, ${ORG}, ${SLUG}, 'Pro', 'Suspension', 'Ostéopathe', 'E2E Suspension', '', '', '', '', '', '', '', '', '', '#a0522d', now())`;
  await sql`INSERT INTO "Client" (id, "organizationId", "firstName", "lastName", phone, email, city, address, "updatedAt")
    VALUES (${`${ORG}-client`}, ${ORG}, 'Cliente', 'Suspension', '', 'cliente-suspension-e2e@example.fr', '', '', now())`;
  const { dateId, time } = parisIn(3);
  await sql`INSERT INTO "Appointment" (id, "organizationId", "clientId", "clientName", "animalName", "serviceName", date, start, duration, mode, location, price, status, notes, "createdAt", "updatedAt")
    VALUES (${APPOINTMENT}, ${ORG}, ${`${ORG}-client`}, 'Cliente Suspension', 'Rex', 'Séance', ${dateId}::date, ${time}, 45, 'CABINET', 'Cabinet', 60, 'CONFIRMED', '', now(), now())`;
});

test.afterAll(async () => {
  await cleanup();
  await removePlatformAccount(sql, PLATFORM_EMAIL);
});

async function loginPro(page: Page) {
  await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%'`;
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', PRO_EMAIL);
  await page.fill('input[type="password"]', PRO_PASSWORD);
  await page.click('button[type="submit"]');
}

async function runJobs(page: Page) {
  const response = await page.request.get(`/api/cron/daily?organization=${ORG}`, { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
  expect(response.status(), "route des tâches planifiées (CRON_SECRET du serveur de test)").toBe(200);
  return response.json() as Promise<{ organizations: number }>;
}

async function platformPage(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAsPlatform(page, sql, platformId, PLATFORM_EMAIL);
  return { context, page, card: page.getByRole("region", { name: /^E2E Suspension/ }) };
}

test("suspendre coupe tout ; réactiver rétablit tout", async ({ browser }) => {
  test.setTimeout(120_000);
  // Le professionnel est connecté, sa page publique existe.
  const proContext = await browser.newContext();
  const pro = await proContext.newPage();
  await loginPro(pro);
  await pro.waitForURL("**/dashboard**", { timeout: 15000 });
  expect((await pro.request.get(`/reserver/${SLUG}`)).status()).toBe(200);

  // Suspension depuis la plateforme, motif obligatoire.
  const platform = await platformPage(browser);
  await expect(platform.card).toContainText("Actif");
  await platform.card.getByRole("button", { name: "Suspendre…" }).click();
  await platform.card.getByRole("button", { name: "Suspendre E2E Suspension" }).click();
  await expect(platform.card.getByRole("alert")).toContainText("motif");
  await platform.card.getByLabel("Motif de la suspension").fill("Test automatique de suspension");
  await platform.card.getByRole("button", { name: "Suspendre E2E Suspension" }).click();
  await expect(platform.card).toContainText(/Suspendu depuis le/);

  // Déconnecté : sa session ne vaut plus rien.
  await pro.goto("/dashboard");
  await pro.waitForURL("**/login**", { timeout: 15000 });
  const [sessions] = await sql`SELECT count(*)::int AS n FROM "Session" WHERE "userId" = ${`${ORG}-pro`}`;
  expect(sessions.n, "toutes ses sessions sont supprimées").toBe(0);

  // Ne peut plus se connecter, sans qu'on lui dise pourquoi.
  await loginPro(pro);
  await expect(pro.getByText(/Ce compte est suspendu\. Contactez/)).toBeVisible();
  await expect(pro.getByText(/Test automatique/)).toHaveCount(0);

  // Page publique fermée, tâche planifiée muette pour cet espace.
  expect((await pro.request.get(`/reserver/${SLUG}`)).status()).toBe(404);
  expect((await runJobs(pro)).organizations, "l'espace suspendu est ignoré par les tâches").toBe(0);
  const [held] = await sql`SELECT "reminderSentAt" FROM "Appointment" WHERE id = ${APPOINTMENT}`;
  expect(held.reminderSentAt, "aucun rappel envoyé").toBeNull();

  // L'assistance reste possible, en lecture seule : rien ne s'enregistre.
  const assistant = platform.page;
  const accountRow = assistant.getByRole("listitem").filter({ hasText: PRO_EMAIL });
  await accountRow.getByRole("button", { name: "Assister" }).click();
  await accountRow.getByLabel("Motif de l’assistance").fill("Test automatique : espace suspendu, lecture seule");
  await accountRow.getByRole("button", { name: /^Ouvrir l’assistance/ }).click();
  await assistant.waitForURL("**/dashboard**", { timeout: 15000 });
  await expect(assistant.getByText("Espace suspendu : lecture seule. Aucune modification ne sera enregistrée.")).toBeVisible();
  await assistant.goto("/dashboard/clients", { waitUntil: "networkidle" });
  await assistant.waitForTimeout(600);
  await assistant.getByRole("button", { name: "Nouveau client" }).click();
  const dialog = assistant.locator('section[role="dialog"]');
  await dialog.getByLabel("Prénom").fill("Essai");
  await dialog.getByLabel("Nom", { exact: true }).fill("Lecture-Seule-E2E");
  await dialog.getByLabel("Téléphone").fill("0600000001");
  await dialog.getByRole("button", { name: "Enregistrer sans animal" }).click();
  await assistant.waitForTimeout(2000);
  const [written] = await sql`SELECT count(*)::int AS n FROM "Client" WHERE "lastName" = 'Lecture-Seule-E2E'`;
  expect(written.n, "aucune écriture pendant l'assistance d'un espace suspendu").toBe(0);
  await assistant.goto("/dashboard", { waitUntil: "networkidle" });
  await assistant.getByRole("button", { name: "Terminer l’assistance" }).click();
  await assistant.waitForURL("**/plateforme**", { timeout: 15000 });

  // Réactivation : tout revient.
  await platform.card.getByRole("button", { name: "Réactiver" }).click();
  await expect(platform.card).toContainText("Actif");
  await loginPro(pro);
  await pro.waitForURL("**/dashboard**", { timeout: 15000 });
  expect((await pro.request.get(`/reserver/${SLUG}`)).status()).toBe(200);
  expect((await runJobs(pro)).organizations).toBe(1);
  const [sent] = await sql`SELECT "reminderSentAt" FROM "Appointment" WHERE id = ${APPOINTMENT}`;
  expect(sent.reminderSentAt, "le rappel part de nouveau").not.toBeNull();

  const audit = await sql`SELECT action::text FROM "AuditLog" WHERE "organizationId" = ${ORG} AND action::text LIKE 'ORGANIZATION_%' ORDER BY "createdAt"`;
  expect(audit.map((row) => row.action)).toEqual(["ORGANIZATION_SUSPENDED", "ORGANIZATION_REACTIVATED"]);

  await platform.context.close();
  await proContext.close();
});
