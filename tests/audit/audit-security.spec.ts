import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { neon } from "../helpers/sql";
import { config } from "dotenv";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);
const BASE = "http://localhost:3000";

/**
 * Audit pré-production — scénarios que l'interface ne permet pas de tester :
 * ils passent par les Server Actions directement, comme le ferait n'importe
 * qui depuis l'extérieur avec les identifiants présents dans le JavaScript
 * public. Tout ce qui est créé ici porte le marqueur AUDIT et est supprimé à
 * la fin.
 *
 * Ces tests CONSTATENT : un test « rouge » signale un défaut à corriger, pas
 * une erreur du test. Chaque assertion dit ce qui est attendu d'une
 * application prête pour de vrais clients.
 */

const MARKER = "AUDITRACE";
/** Lien public du cabinet : premier argument des actions de réservation. */
const SLUG = "pauline-faucillon";

function practitionerCookie(): string {
  const state = JSON.parse(readFileSync("tests/.auth/practitioner.json", "utf8")) as { cookies: { name: string; value: string }[] };
  return state.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

/** Identifiants d'actions présents dans le JavaScript servi par une page. */
async function actionIds(path: string, cookie?: string): Promise<Record<string, string>> {
  const html = await (await fetch(`${BASE}${path}`, { headers: cookie ? { Cookie: cookie } : {} })).text();
  const chunks = [...new Set(html.match(/\/_next\/static\/[^"'\s]+\.js/g) ?? [])];
  const ids: Record<string, string> = {};
  for (const chunk of chunks) {
    const js = await (await fetch(`${BASE}${chunk}`)).text();
    for (const m of js.matchAll(/"([0-9a-f]{40,})":\{"name":"(\w+)"\}/g)) ids[m[2]] = m[1];
  }
  return ids;
}

async function callAction(id: string, args: unknown[], { path = "/", cookie }: { path?: string; cookie?: string } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: { "Next-Action": id, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component", Origin: BASE, ...(cookie ? { Cookie: cookie } : {}) },
    body: typeof args === "string" ? args : JSON.stringify(args),
  });
  const raw = await response.text();
  let value: unknown;
  for (const line of raw.split("\n")) {
    const m = /^1:(\{.*\}|\[.*\])$/.exec(line);
    if (m) { try { value = JSON.parse(m[1]); } catch { /* flux partiel */ } }
  }
  return { status: response.status, raw, value };
}

test.describe.configure({ mode: "default" });

test.afterAll(async () => {
  await sql`DELETE FROM "Appointment" WHERE "clientName" LIKE ${`%${MARKER}%`}`;
  await sql`DELETE FROM "Client" WHERE "lastName" LIKE ${`${MARKER}%`}`;
  await sql`DELETE FROM "StudioDocument" WHERE title LIKE 'AUDIT-%'`;
});

// ---------------------------------------------------------------------------
// Double réservation
// ---------------------------------------------------------------------------

async function bookingFixture() {
  // Toutes les demandes partent de la même adresse IP : après quelques
  // exécutions, la protection anti-envoi en masse refusait tout — à raison.
  // Ce qu'on vérifie ici est la course entre deux demandes, pas ce quota.
  await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'public-booking:%'`;
  const ids = await actionIds("/reserver/pauline-faucillon");
  const [service] = await sql`SELECT id, duration FROM "Service" WHERE active = true AND "cabinetEnabled" = true ORDER BY "createdAt" LIMIT 1`;
  const schedule = await callAction(ids.getPublicScheduleAction, [SLUG, "cabinet", service.duration], { path: "/reserver/pauline-faucillon" });
  const dates = (schedule.value as { dates: { id: string; slots: string[] }[] }).dates;
  // Loin dans la fenêtre : aucune chance de heurter un autre test.
  const date = [...dates].reverse().find((d) => d.slots.includes("14:00") && d.slots.includes("15:00"));
  if (!date) throw new Error("Aucune date avec 14:00 et 15:00 libres");
  return { ids, serviceId: service.id as string, duration: service.duration as number, date: date.id };
}

function bookingInput(serviceId: string, date: string, start: string, n: number) {
  return {
    serviceId, date, start, mode: "cabinet", location: "Cabinet", notes: "",
    clientName: `Client ${MARKER}${n}`, animalName: "Rex",
    bookingStartedAt: Date.now() - 20_000,
    ownerFirstName: "Audit", ownerLastName: `${MARKER}${n}`, ownerPhone: "0600000000",
    ownerEmail: `audit-race-${n}-${Date.now()}@example.fr`, animalSpecies: "Chien",
  };
}

test("deux visiteurs valident le même créneau au même instant : un seul rendez-vous", async () => {
  const { ids, serviceId, date } = await bookingFixture();
  const results = await Promise.all([1, 2].map((n) => callAction(ids.submitPublicBookingAction, [SLUG, bookingInput(serviceId, date, "14:00", n)], { path: "/reserver/pauline-faucillon" })));
  const ok = results.filter((r) => (r.value as { ok?: boolean } | undefined)?.ok === true).length;
  console.log("même créneau :", results.map((r) => JSON.stringify(r.value)));
  const rows = await sql`SELECT count(*)::int AS n FROM "Appointment" WHERE date = ${date}::date AND start = '14:00' AND status <> 'CANCELLED'`;
  expect(rows[0].n, "un seul rendez-vous actif à 14:00").toBe(1);
  expect(ok).toBe(1);
});

test("deux réservations qui se chevauchent (14:00 et 14:30) envoyées au même instant", async () => {
  const { ids, serviceId, date } = await bookingFixture();
  // Repartir de zéro, fiches client comprises : sinon celles du test
  // précédent passeraient pour des orphelines au test suivant.
  await sql`DELETE FROM "Appointment" WHERE "clientName" LIKE ${`%${MARKER}%`}`;
  await sql`DELETE FROM "Client" WHERE "lastName" LIKE ${`${MARKER}%`}`;
  const results = await Promise.all([
    callAction(ids.submitPublicBookingAction, [SLUG, bookingInput(serviceId, date, "14:00", 3)], { path: "/reserver/pauline-faucillon" }),
    callAction(ids.submitPublicBookingAction, [SLUG, bookingInput(serviceId, date, "14:30", 4)], { path: "/reserver/pauline-faucillon" }),
  ]);
  console.log("chevauchement :", results.map((r) => JSON.stringify(r.value)));
  const rows = await sql`SELECT start FROM "Appointment" WHERE "clientName" LIKE ${`%${MARKER}%`} AND status <> 'CANCELLED' ORDER BY start`;
  console.log("rendez-vous enregistrés :", rows.map((r) => r.start));
  expect(rows.length, "deux rendez-vous qui se chevauchent ne doivent jamais coexister").toBeLessThanOrEqual(1);
});

test("une demande refusée pour conflit ne laisse pas de fiche client orpheline", async () => {
  const leftovers = await sql`
    SELECT c."lastName" FROM "Client" c
    WHERE c."lastName" LIKE ${`${MARKER}%`}
      AND NOT EXISTS (SELECT 1 FROM "Appointment" a WHERE a."clientId" = c.id)`;
  console.log("fiches sans rendez-vous :", leftovers.map((r) => r.lastName));
  expect(leftovers.length, "fiches client créées pour des demandes refusées").toBe(0);
});

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

test("après déconnexion, l'ancien jeton de session ne doit plus ouvrir l'espace pro", async ({ browser }) => {
  // Une session à part, ouverte pour l'occasion : se déconnecter avec la
  // session partagée (tests/.auth) la révoquerait pour toutes les specs
  // connectées qui passent ensuite.
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  let cookie: string;
  try {
    const page = await context.newPage();
    await page.goto(`${BASE}/login`);
    await page.fill('input[type="email"]', "praticien-test@pf-osteo-animale.fr");
    await page.fill('input[type="password"]', "Praticien-Test-2026!");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 20000 });
    cookie = (await context.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
  } finally {
    await context.close();
  }

  const ids = await actionIds("/dashboard", cookie);
  await callAction(ids.logout, [], { path: "/dashboard", cookie });
  const after = await fetch(`${BASE}/dashboard`, { headers: { Cookie: cookie }, redirect: "manual" });
  console.log("GET /dashboard avec le jeton d'avant la déconnexion :", after.status, after.headers.get("location") ?? "");
  expect(after.status, "le jeton volé reste utilisable 7 jours après la déconnexion").not.toBe(200);

  // Se déconnecter d'un appareil ne déconnecte pas les autres.
  const other = await fetch(`${BASE}/dashboard`, { headers: { Cookie: practitionerCookie() }, redirect: "manual" });
  expect(other.status, "l'autre session du même compte reste ouverte").toBe(200);
});

// ---------------------------------------------------------------------------
// Documents : HTML actif enregistré sans validation
// ---------------------------------------------------------------------------

test("un document ne doit pas pouvoir exécuter de script chez celui qui l'ouvre", async ({ browser }) => {
  const cookie = practitionerCookie();
  const ids = await actionIds("/dashboard", cookie);
  const created = await callAction(ids.createDocumentAction, [{ title: "AUDIT-XSS" }], { path: "/dashboard", cookie });
  const documentId = (created.value as { id?: string; document?: { id: string } } | undefined)?.id
    ?? (created.value as { document?: { id: string } } | undefined)?.document?.id;
  expect(documentId, `création du document : ${created.raw.slice(0, 200)}`).toBeTruthy();

  const editorIds = await actionIds(`/dashboard/documents/${documentId}`, cookie);
  const content = {
    formatVersion: 1, pageSize: "A4_PORTRAIT",
    pages: [{ id: "page-1", elements: [{ id: "t1", type: "text", x: 40, y: 40, width: 300, height: 80, rotation: 0, html: `<p>Bonjour</p><img src="x" onerror="window.__auditXss = 1">` }] }],
  };
  const saved = await callAction(editorIds.saveDocumentAction, [documentId, { content }], { path: `/dashboard/documents/${documentId}`, cookie });
  console.log("enregistrement du contenu piégé :", JSON.stringify(saved.value));

  const context = await browser.newContext({ storageState: "tests/.auth/practitioner.json" });
  const page = await context.newPage();
  await page.goto(`${BASE}/dashboard/documents/${documentId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const executed = await page.evaluate(() => (window as unknown as { __auditXss?: number }).__auditXss === 1);
  await context.close();
  expect(executed, "le script du document s'est exécuté dans la session de celui qui l'ouvre").toBe(false);
});

// ---------------------------------------------------------------------------
// Photos : une vraie photo de téléphone, par la vraie interface
// ---------------------------------------------------------------------------

test("une photo de téléphone de plusieurs Mo s'enregistre, réduite, et survit au rechargement", async ({ browser }) => {
  // Réduire une photo de 12 mégapixels dans le navigateur prend du temps sur
  // le serveur de développement : 30 s ne suffisent pas toujours.
  test.setTimeout(90_000);
  const sharp = (await import("sharp")).default;
  // Bruit gaussien : incompressible, donc un JPEG réellement lourd, comme
  // une photo prise au téléphone.
  const photo = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: "#808080", noise: { type: "gaussian", mean: 128, sigma: 60 } } }).jpeg({ quality: 95 }).toBuffer();
  expect(photo.length, "la photo de test doit dépasser la limite d'origine (1 Mo)").toBeGreaterThan(3 * 1024 * 1024);

  const [before] = await sql`SELECT id, photo FROM "BusinessProfile" LIMIT 1`;
  // Modifier le profil du cabinet demande ce droit ; le compte de test ne
  // l'a pas d'office. Accordé le temps du test, puis rendu tel quel.
  const [account] = await sql`SELECT permissions FROM "User" WHERE email = 'praticien-test@pf-osteo-animale.fr'`;
  await sql`UPDATE "User" SET permissions = array_append(array_remove(permissions, 'MANAGE_PUBLIC_SETTINGS'), 'MANAGE_PUBLIC_SETTINGS') WHERE email = 'praticien-test@pf-osteo-animale.fr'`;
  const context = await browser.newContext({ storageState: "tests/.auth/practitioner.json" });
  const page = await context.newPage();
  try {
    await page.goto(`${BASE}/dashboard/parametres?tab=cabinet`, { waitUntil: "networkidle" });
    const picker = page.locator("div", { has: page.getByText("Photo du professionnel", { exact: true }) }).locator('input[type="file"]').first();
    await picker.setInputFiles({ name: "photo-telephone.jpg", mimeType: "image/jpeg", buffer: photo });
    // L'aperçu ne change qu'une fois la réduction terminée : c'est lui qu'on
    // attend, pas la disparition d'un libellé qui n'est peut-être pas encore
    // apparu.
    await expect(page.locator('img[alt="Aperçu local"][src^="data:image/jpeg"]').first()).toBeVisible({ timeout: 30000 });
    await page.getByRole("button", { name: /enregistrer les modifications/i }).first().click();
    // Le message de réussite, pas n'importe quel « enregistr… » : le bouton
    // lui-même en contient un, et la base était lue avant l'écriture.
    await expect(page.getByText("Profil enregistré", { exact: false }).first()).toBeVisible({ timeout: 15000 });

    const [after] = await sql`SELECT photo FROM "BusinessProfile" WHERE id = ${before.id}`;
    const stored = String(after.photo ?? "");
    console.log(`photo : ${(photo.length / 1024 / 1024).toFixed(1)} Mo envoyée → ${(stored.length / 1024).toFixed(0)} Ko enregistrés`);
    expect(stored.startsWith("data:image/jpeg"), "photo réencodée en JPEG").toBe(true);
    expect(stored.length, "photo réduite sous la limite d'une action").toBeLessThan(1024 * 1024);
  } finally {
    // Un test arrêté par le délai a déjà fermé son contexte : le nettoyage
    // qui suit doit avoir lieu quand même.
    await context.close().catch(() => {});
    await sql`UPDATE "BusinessProfile" SET photo = ${before.photo} WHERE id = ${before.id}`;
    await sql`UPDATE "User" SET permissions = ${account.permissions}::text[] WHERE email = 'praticien-test@pf-osteo-animale.fr'`;
  }
});

// ---------------------------------------------------------------------------
// Comptes rendus : supprimer leur auteur ne doit pas les effacer
// ---------------------------------------------------------------------------

test("supprimer le compte d'un auteur est refusé tant qu'il a des comptes rendus", async ({ browser }) => {
  test.setTimeout(90_000);
  const bcrypt = (await import("bcryptjs")).default;
  const password = `Audit-${Date.now()}-Aa1!`;
  const suffix = Date.now();
  const adminEmail = `audit-admin-${suffix}@example.fr`;
  const [admin] = await sql`INSERT INTO "User" (id, email, "passwordHash", "firstName", "lastName", role, permissions, "updatedAt")
    VALUES (${`auditadmin${suffix}`}, ${adminEmail}, ${await bcrypt.hash(password, 10)}, 'Audit', 'Admin', 'ADMIN', ARRAY[]::text[], now()) RETURNING id`;
  const [author] = await sql`INSERT INTO "User" (id, email, "passwordHash", "firstName", "lastName", role, permissions, "updatedAt")
    VALUES (${`auditauthor${suffix}`}, ${`audit-author-${suffix}@example.fr`}, 'x', 'Audit', 'Auteur', 'PRACTITIONER', ARRAY[]::text[], now()) RETURNING id`;
  await sql`INSERT INTO "StudioDocument" (id, title, "createdByUserId", "contentJson", "updatedAt")
    VALUES (${`auditdoc${suffix}`}, 'AUDIT-AUTEUR', ${author.id}, '{"formatVersion":1,"pageSize":"A4_PORTRAIT","pages":[]}'::jsonb, now())`;

  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    // Attendre l'hydratation : remplir avant efface la saisie au moment où
    // React prend la main sur les champs.
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.fill('input[type="email"]', adminEmail);
    await page.fill('input[type="password"]', password);
    await expect(page.locator('input[type="email"]')).toHaveValue(adminEmail);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });
    // Administration › Utilisateurs › ligne de l'auteur › Supprimer.
    await page.goto(`${BASE}/dashboard/admin`, { waitUntil: "networkidle" });
    const row = page.getByRole("row").filter({ hasText: `audit-author-${suffix}@example.fr` });
    page.once("dialog", (dialog) => dialog.accept());
    await row.getByRole("button", { name: "Supprimer" }).click();
    const refusal = page.getByRole("alert").filter({ hasText: /Désactivez-le plutôt/ });
    await expect(refusal, "le refus est expliqué à l'administrateur").toBeVisible({ timeout: 15000 });
    console.log("message affiché :", await refusal.textContent());

    const [doc] = await sql`SELECT count(*)::int AS n FROM "StudioDocument" WHERE "createdByUserId" = ${author.id}`;
    const [user] = await sql`SELECT count(*)::int AS n FROM "User" WHERE id = ${author.id}`;
    expect(user.n, "le compte de l'auteur existe toujours").toBe(1);
    expect(doc.n, "son compte rendu existe toujours").toBe(1);
  } finally {
    await context.close().catch(() => {});
    await sql`DELETE FROM "StudioDocument" WHERE id = ${`auditdoc${suffix}`}`;
    await sql`DELETE FROM "User" WHERE id IN (${admin.id}, ${author.id})`;
  }
});
