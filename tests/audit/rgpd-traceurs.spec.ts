import { expect, test, type BrowserContext, type Page } from "../helpers/test";
import { neon } from "../helpers/sql";
import { config } from "dotenv";
import { BASE_URL } from "../helpers/base-url";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);
const BASE = BASE_URL;
const APP_HOST = new URL(BASE).host;

/**
 * Phase 4 — Inventaire des cookies, du stockage du navigateur et des services
 * tiers contactés par le navigateur (docs/audit-2026-10/04-RGPD-CONFORMITE.md,
 * section « Cookies et traceurs »).
 *
 * Aucune requête ne quitte réellement le poste : tout appel vers un autre hôte
 * que le serveur de test est relevé puis bloqué (`route.abort`). Le relevé est
 * écrit dans la sortie du test.
 *
 * Seule assertion : aucun cookie n'est déposé par un tiers, ni aucun cookie
 * propre au site en dehors de ceux que le code déclare (session, attente de
 * la double authentification, état du retour Google). Le reste est un
 * inventaire, que le rapport interprète.
 */

// src/lib/auth/session.ts:5, :8 ; src/lib/calendar/google-oauth-state.ts:17.
const FIRST_PARTY_COOKIES = new Set(["animeo-session", "animeo-2fa-pending", "animeo-google-oauth-state"]);

async function observe(context: BrowserContext, page: Page, path: string, settle: (page: Page) => Promise<void> = async () => {}) {
  const thirdParty = new Set<string>();
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.host === APP_HOST || url.protocol === "data:" || url.protocol === "blob:") return route.continue();
    thirdParty.add(`${url.protocol}//${url.host}`);
    return route.abort();
  });
  await page.goto(path);
  await settle(page);
  await page.waitForTimeout(2_000); // tuiles et images chargées après coup
  const cookies = (await context.cookies()).map((cookie) => ({ name: cookie.name, domain: cookie.domain, httpOnly: cookie.httpOnly, sameSite: cookie.sameSite }));
  const storage = await page.evaluate(() => ({
    localStorage: Object.keys(window.localStorage),
    sessionStorage: Object.keys(window.sessionStorage),
  }));
  const report = { path, thirdParty: [...thirdParty].sort(), cookies, storage };
  console.log(`INVENTAIRE ${JSON.stringify(report)}`);
  return report;
}

test("visiteur anonyme de la page de réservation : tiers contactés et cookies", async ({ browser }) => {
  const [profile] = await sql`SELECT slug FROM "BusinessProfile" WHERE "organizationId" = 'org-1002-pattes'`;
  expect(profile?.slug, "lien de réservation du cabinet de test").toBeTruthy();

  const context = await browser.newContext();
  const page = await context.newPage();
  const report = await observe(context, page, `/reserver/${profile.slug}`, async (p) => {
    // Défiler jusqu'en bas : la carte du cabinet et les photos des prestations.
    await p.mouse.wheel(0, 4000);
  });
  await context.close();

  for (const cookie of report.cookies) {
    expect(cookie.domain.replace(/^\./, ""), `cookie « ${cookie.name} » déposé par le site lui-même`).toBe(new URL(BASE).hostname);
  }
  expect(report.cookies.filter((cookie) => !FIRST_PARTY_COOKIES.has(cookie.name)), "aucun cookie non déclaré pour un visiteur").toEqual([]);
});

test("professionnel connecté : tiers contactés et cookies sur le tableau de bord et la carte", async ({ browser }) => {
  const context = await browser.newContext({ storageState: "tests/.auth/practitioner.json" });
  const page = await context.newPage();
  const dashboard = await observe(context, page, "/dashboard");
  const map = await observe(context, page, "/dashboard/carte");
  await context.close();

  for (const report of [dashboard, map]) {
    expect(report.cookies.filter((cookie) => !FIRST_PARTY_COOKIES.has(cookie.name)), `aucun cookie non déclaré (${report.path})`).toEqual([]);
  }
});
