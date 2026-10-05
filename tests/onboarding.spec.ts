import { expect, test, type Browser } from "@playwright/test";
import { config } from "dotenv";
import { neon } from "./helpers/sql";
import { createPlatformAccount, loginAsPlatform, removePlatformAccount } from "./helpers/platform";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

/**
 * Multi-comptes, phase 4 : un professionnel invité ouvre son cabinet, le
 * configure, et reçoit sa première réservation — sans jamais croiser les
 * données ni l'identité du premier cabinet.
 *
 * Et autour : un lien d'invitation ne sert qu'une fois, une nouvelle
 * invitation annule la précédente, et la page de réservation n'existe pas
 * avant la fin de la configuration.
 */
const PLATFORM_EMAIL = "plateforme-onboarding-e2e@example.fr";
const INVITEE_EMAIL = "invitee-onboarding-e2e@example.fr";
const INVITEE_PASSWORD = "Invitee-E2E-2026!";
const SLUG = "elodie-onboarding-e2e";
const OTHER_CABINET_CLIENT = "E2E Autre Cabinet";

let platformId = "";

/** Tables d'un cabinet, dans un ordre qui respecte les clés étrangères. */
const CABINET_TABLES = ["AppointmentCalendarEvent", "Reminder", "Appointment", "Consultation", "AnimalDocument", "StudioDocument", "Animal", "Client", "Service", "TourStop", "TourRun", "Tour", "City", "Zone", "BlockedSlot", "SavedPlace", "ClientImport", "BusinessProfile", "AuditLog"] as const;

/** Tout ce qu'a créé l'invité : son cabinet et ce qu'il contient. */
async function removeInvitee() {
  const organizations = await sql`SELECT "organizationId" AS id FROM "Invitation" WHERE email = ${INVITEE_EMAIL} AND "organizationId" IS NOT NULL
    UNION SELECT "organizationId" AS id FROM "User" WHERE email = ${INVITEE_EMAIL} AND "organizationId" IS NOT NULL`;
  for (const { id } of organizations) {
    if (id === "org-1002-pattes") throw new Error("Le nettoyage viserait le premier cabinet.");
    // Noms de tables fixés ici, jamais venus d'ailleurs : seul le cabinet
    // est un paramètre.
    for (const table of CABINET_TABLES) {
      await sql(Object.assign([`DELETE FROM "${table}" WHERE "organizationId" = `, ""], { raw: [] }) as TemplateStringsArray, id);
    }
    await sql`DELETE FROM "Session" WHERE "userId" IN (SELECT id FROM "User" WHERE "organizationId" = ${id})`;
    await sql`DELETE FROM "User" WHERE "organizationId" = ${id}`;
    await sql`DELETE FROM "Invitation" WHERE "organizationId" = ${id}`;
    await sql`DELETE FROM "Organization" WHERE id = ${id}`;
  }
  await sql`DELETE FROM "Invitation" WHERE email = ${INVITEE_EMAIL}`;
}

async function invite(browser: Browser): Promise<string> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await loginAsPlatform(page, sql, platformId, PLATFORM_EMAIL);
    await page.getByLabel("Adresse e-mail").fill(INVITEE_EMAIL);
    await page.getByLabel("Nom de l’activité").fill("Élodie Comportement");
    await page.getByRole("button", { name: "Envoyer l’invitation" }).click();
    const url = (await page.getByTestId("invitation-url").textContent())?.trim() ?? "";
    expect(url, "le lien est montré une fois, pour le transmettre si l'e-mail n'arrive pas").toMatch(/\/inscription\/[a-f0-9]{64}$/);
    return url;
  } finally {
    await context.close();
  }
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await removeInvitee();
  platformId = await createPlatformAccount(sql, PLATFORM_EMAIL);
});

test.afterAll(async () => {
  await removeInvitee();
  await removePlatformAccount(sql, PLATFORM_EMAIL);
});

test("une nouvelle invitation annule la précédente", async ({ browser }) => {
  const first = await invite(browser);
  const second = await invite(browser);
  expect(second).not.toBe(first);

  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(first);
    await expect(page.getByRole("heading", { name: "Invitation annulée" })).toBeVisible();
    await page.goto(second);
    await expect(page.getByRole("heading", { name: "Ouvrir votre espace" })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("un professionnel invité ouvre son espace, le configure et reçoit sa première réservation", async ({ browser }) => {
  // Parcours long : inscription, cinq écrans, puis une réservation complète.
  test.setTimeout(240_000);
  const url = await invite(browser);
  const context = await browser.newContext();
  const page = await context.newPage();
  // Recherche d'adresse : jamais vers le service externe pendant un test.
  await page.route("**/api/address-search**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results: [] }) }));

  try {
    // Création du compte : l'adresse est celle de l'invitation, pas saisie.
    await page.goto(url);
    await expect(page.getByText(INVITEE_EMAIL)).toBeVisible();
    await page.getByLabel("Prénom").fill("Élodie");
    await page.getByLabel("Nom", { exact: true }).fill("Invitée");
    await page.getByLabel("Mot de passe", { exact: true }).fill(INVITEE_PASSWORD);
    await page.getByLabel("Confirmer le mot de passe").fill(INVITEE_PASSWORD);
    await page.getByRole("button", { name: "Créer mon compte" }).click();
    await page.waitForURL("**/dashboard/bienvenue", { timeout: 20000 });

    const [created] = await sql`SELECT u.role, u."organizationId", o.name, o."onboardedAt", p.slug, p."firstName", p.company, p.phone, p.address
      FROM "User" u JOIN "Organization" o ON o.id = u."organizationId" JOIN "BusinessProfile" p ON p."organizationId" = o.id
      WHERE u.email = ${INVITEE_EMAIL}`;
    expect(created.role, "l'invité administre son propre cabinet").toBe("ADMIN");
    expect(created.organizationId).not.toBe("org-1002-pattes");
    expect(created.name).toBe("Élodie Comportement");
    expect(created.onboardedAt, "configuration pas encore terminée").toBeNull();
    expect([created.firstName, created.company, created.phone, created.address], "aucune identité empruntée au premier cabinet").toEqual(["Élodie", "Élodie Comportement", "", ""]);
    const [services] = await sql`SELECT count(*)::int AS n FROM "Service" WHERE "organizationId" = ${created.organizationId}`;
    expect(services.n, "aucune prestation d'un autre professionnel").toBe(0);

    // Tant que la configuration n'est pas finie, la page publique n'existe pas.
    const anonymous = await browser.newContext();
    const closed = await (await anonymous.newPage()).goto(`/reserver/${created.slug}`);
    expect(closed?.status()).toBe(404);
    await anonymous.close();

    // 1. Façon d'exercer : au cabinet uniquement — l'écran « déplacements »
    // disparaît du parcours.
    await expect(page.getByText("Étape 1 sur 6")).toBeVisible();
    await page.getByLabel(/Au cabinet uniquement/).check();
    await expect(page.getByText("Étape 1 sur 5")).toBeVisible();
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "adresse du cabinet" })).toBeVisible();
    await page.getByLabel("Adresse du cabinet").fill("8 rue de l’Essai, 76000 Rouen");
    await page.getByRole("button", { name: "Continuer" }).click();

    // 2. Profil.
    await expect(page.getByRole("heading", { name: "Votre profil" })).toBeVisible({ timeout: 15000 });
    await page.getByLabel("Métier").selectOption("Comportementaliste");
    await page.getByLabel("Téléphone").fill("06 00 00 00 01");
    await page.getByRole("button", { name: "Continuer" }).click();

    // 3. Horaires : ceux proposés conviennent.
    await expect(page.getByRole("heading", { name: "Vos horaires" })).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "Continuer" }).click();

    // 4. Prestations : au moins une, sinon rien à réserver.
    await expect(page.getByRole("heading", { name: "Vos prestations" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByLabel("Tarif à domicile"), "pas de tarif à domicile sans déplacement").toHaveCount(0);
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "au moins une prestation" })).toBeVisible();
    await page.getByLabel("Nom", { exact: true }).fill("Bilan comportemental");
    await page.getByLabel("Chien").check();
    // Sans prestation, l'ajout est l'action principale (pleine couleur)…
    const addService = page.getByRole("button", { name: "Ajouter la prestation" });
    await expect(addService).toHaveClass(/(^|\s)bg-animeo(\s|$)/);
    await expect(page.getByLabel("Tarif au cabinet")).toHaveAttribute("inputmode", "decimal");
    await page.getByLabel("Tarif au cabinet").fill("55");
    await addService.click();
    await expect(page.getByRole("list", { name: "Prestations ajoutées" })).toContainText("Bilan comportemental");
    await expect(page.getByRole("alert").filter({ hasText: "au moins une prestation" }), "le rappel disparaît une fois la prestation ajoutée").toHaveCount(0);
    // … ensuite « Continuer » redevient la seule.
    await expect(page.getByRole("button", { name: "Ajouter une autre prestation" })).not.toHaveClass(/(^|\s)bg-animeo(\s|$)/);
    await page.getByRole("button", { name: "Continuer" }).click();

    // 5. Lien de réservation : la page s'ouvre.
    await expect(page.getByRole("heading", { name: "Votre lien de réservation" })).toBeVisible({ timeout: 15000 });
    await page.getByLabel("Votre lien").fill(SLUG);
    await page.getByRole("button", { name: "Ouvrir ma page de réservation" }).click();
    await expect(page.getByRole("heading", { name: /Félicitations, la première étape est faite/ })).toBeVisible({ timeout: 15000 });

    const [profile] = await sql`SELECT p."practiceMode", p.slug, p.profession, o."onboardedAt" FROM "BusinessProfile" p JOIN "Organization" o ON o.id = p."organizationId" WHERE p."organizationId" = ${created.organizationId}`;
    expect(profile.practiceMode).toBe("OFFICE_ONLY");
    expect(profile.slug).toBe(SLUG);
    expect(profile.profession).toBe("Comportementaliste");
    expect(profile.onboardedAt).not.toBeNull();
    const [service] = await sql`SELECT "cabinetEnabled", "homeEnabled", "cabinetPrice" FROM "Service" WHERE "organizationId" = ${created.organizationId}`;
    expect([service.cabinetEnabled, service.homeEnabled, service.cabinetPrice]).toEqual([true, false, 55]);

    // Le tableau de bord ne réclame plus la configuration.
    await page.getByRole("link", { name: "Découvrir mon tableau de bord" }).click();
    await page.waitForURL("**/dashboard", { timeout: 15000 });
    await expect(page.getByRole("region", { name: "Configuration à terminer" })).toHaveCount(0);
  } finally {
    await context.close();
  }

  // Le premier cabinet est occupé à 9 h les deux prochaines semaines : cela
  // ne regarde que lui. Le nouveau cabinet doit toujours proposer 9 h.
  for (let offset = 1; offset <= 14; offset += 1) {
    await sql`
      INSERT INTO "Appointment" (id, date, start, duration, "clientName", "animalName", "serviceName", mode, location, price, status, notes, "createdAt", "updatedAt", "organizationId")
      VALUES (gen_random_uuid()::text, (current_date + ${offset}::int)::timestamp, '09:00', 60, ${OTHER_CABINET_CLIENT}, 'Rex', 'Test', 'CABINET', 'Cabinet', 0, 'CONFIRMED', '', now(), now(), 'org-1002-pattes')
      ON CONFLICT DO NOTHING`;
  }

  // Première réservation, par un visiteur, sur la page du nouveau cabinet.
  const visitor = await browser.newContext();
  try {
    const page = await visitor.newPage();
    await page.goto(`/reserver/${SLUG}`);
    await expect(page.getByText("Élodie Invitée").first()).toBeVisible();
    await expect(page.getByText("Pauline"), "rien du premier cabinet").toHaveCount(0);
    await expect(page.getByText("Ostéopathie canine")).toHaveCount(0);

    await page.getByText("Bilan comportemental").first().click();
    await page.getByRole("button", { name: "Continuer" }).click();
    await page.waitForTimeout(600);
    await page.locator('[role="gridcell"][aria-disabled="false"]').first().click();
    await page.waitForTimeout(500);
    const firstSlot = page.locator("button", { hasText: /^\d{2}:\d{2}$/ }).first();
    expect((await firstSlot.textContent())?.trim(), "les rendez-vous d'un autre cabinet n'occupent pas ses créneaux").toBe("09:00");
    await firstSlot.click();
    await page.getByRole("button", { name: "Continuer" }).click();

    await page.waitForTimeout(600);
    await page.locator("#booking-details-firstName").fill("Premier");
    await page.locator("#booking-details-lastName").fill("ClientOnboarding");
    await page.locator('input[autocomplete="tel"]').fill("0612345678");
    await page.locator('input[type="email"]').fill("client-onboarding-e2e@example.fr");
    await page.getByText("Adresse", { exact: true }).click();
    await page.waitForTimeout(300);
    await page.locator("#booking-details-address").fill("1 rue du Premier Client");
    await page.locator("#booking-details-postalCode").fill("76000");
    await page.locator("#booking-details-city").fill("Rouen");
    await page.getByText("Votre animal", { exact: true }).click();
    await page.waitForTimeout(300);
    await page.locator("#booking-details-animalName").fill("NouveauChien");
    await page.locator("#booking-details-reason").fill("Première visite pour le test d'ouverture de cabinet.");
    await page.getByRole("button", { name: "Continuer" }).click();

    await page.waitForTimeout(600);
    await page.locator('input[type="checkbox"]').check();
    await page.getByRole("button", { name: "Réserver mon rendez-vous" }).click();
    await expect(page.getByRole("heading", { name: /Demande envoyée à/ })).toBeVisible({ timeout: 15000 });
  } finally {
    await visitor.close();
    await sql`DELETE FROM "Appointment" WHERE "clientName" = ${OTHER_CABINET_CLIENT}`;
  }

  const appointments = await sql`SELECT a."organizationId", a.mode, a.status FROM "Appointment" a WHERE a."animalName" = 'NouveauChien'`;
  expect(appointments, "une seule réservation").toHaveLength(1);
  const [owner] = await sql`SELECT "organizationId" FROM "User" WHERE email = ${INVITEE_EMAIL}`;
  expect(appointments[0].organizationId, "rangée dans le nouveau cabinet, pas dans le premier").toBe(owner.organizationId);
  expect(appointments[0].mode).toBe("CABINET");
  expect(appointments[0].status).toBe("PENDING");
});

test("un lien d'invitation ne sert qu'une fois", async ({ browser }) => {
  const [invitation] = await sql`SELECT "usedAt" FROM "Invitation" WHERE email = ${INVITEE_EMAIL} AND "usedAt" IS NOT NULL`;
  expect(invitation, "l'invitation du test précédent a été utilisée").toBeTruthy();

  // Réinviter une adresse qui a déjà un compte est refusé d'emblée.
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await loginAsPlatform(page, sql, platformId, PLATFORM_EMAIL);
    await expect(page.getByRole("heading", { name: "Élodie Comportement" })).toBeVisible();
    await page.getByLabel("Adresse e-mail").fill(INVITEE_EMAIL);
    await page.getByLabel("Nom de l’activité").fill("Doublon");
    await page.getByRole("button", { name: "Envoyer l’invitation" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Un compte existe déjà" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Invitations" })).toContainText("Espace ouvert");
  } finally {
    await context.close();
  }
});

test("un nouvel espace n'a que le socle ; la plateforme lui ouvre un module", async ({ browser }) => {
  const [owner] = await sql`SELECT u."organizationId", o.modules FROM "User" u JOIN "Organization" o ON o.id = u."organizationId" WHERE u.email = ${INVITEE_EMAIL}`;
  expect(owner.modules, "socle seul à l'ouverture").toEqual([]);

  const invitee = await browser.newContext();
  const platform = await browser.newContext();
  try {
    const page = await invitee.newPage();
    await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%'`;
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.fill('input[type="email"]', INVITEE_EMAIL);
    await page.fill('input[type="password"]', INVITEE_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard", { timeout: 15000 });

    // Sur l'agenda, la catégorie « Planning » du menu est dépliée : Agenda y
    // est, Tournées — de la même catégorie — n'y est pas.
    await page.goto("/dashboard/agenda", { waitUntil: "networkidle" });
    const nav = page.getByRole("navigation", { name: "Navigation principale" }).first();
    await expect(nav.getByRole("link", { name: "Agenda" }).first(), "le socle est là").toBeVisible();
    await expect(nav.getByRole("link", { name: "Tournées" }), "pas de Tournées sans le module").toHaveCount(0);
    // Et l'adresse tapée à la main n'ouvre rien.
    await page.goto("/dashboard/tournees");
    await expect(page.getByRole("heading", { name: "Tournées et carte" })).toBeVisible();
    await expect(page.getByText("n’est pas activé pour votre espace").first()).toBeVisible();

    // La plateforme ouvre le module.
    const admin = await platform.newPage();
    await loginAsPlatform(admin, sql, platformId, PLATFORM_EMAIL);
    const modules = admin.getByRole("group", { name: "Modules de Élodie Comportement" });
    await modules.getByLabel(/Tournées et carte/).check();
    await modules.getByRole("button", { name: "Enregistrer les modules" }).click();
    await expect(modules.getByRole("status")).toContainText("Modules enregistrés");

    await page.goto("/dashboard/tournees", { waitUntil: "networkidle" });
    await expect(page.getByText("n’est pas activé pour votre espace"), "le module s'ouvre à la page suivante").toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Navigation principale" }).first().getByRole("link", { name: "Tournées" }).first()).toBeVisible();

    const [logged] = await sql`SELECT metadata FROM "AuditLog" WHERE action = 'MODULES_CHANGED' AND "organizationId" = ${owner.organizationId} ORDER BY "createdAt" DESC LIMIT 1`;
    expect(logged, "inscrit au journal de l'espace").toBeTruthy();
    expect((logged.metadata as { opened: string[] }).opened).toEqual(["Tournées et carte"]);
  } finally {
    await invitee.close();
    await platform.close();
  }
});

test("chaque page de politique de confidentialité montre son propre professionnel", async ({ page }) => {
  // Deux espaces existent désormais : la page doit suivre son lien, pas
  // « le seul espace ».
  await page.goto(`/politique-de-confidentialite/${SLUG}`);
  await expect(page.getByText("Élodie Invitée").first()).toBeVisible();
  await expect(page.getByText("Pauline")).toHaveCount(0);

  await page.goto("/politique-de-confidentialite/pauline-faucillon");
  await expect(page.getByText("Pauline Faucillon").first()).toBeVisible();
});

test("« Les deux » : un jour peut n'ouvrir que le domicile, et revenir à l'étape 1 ne l'écrase pas", async ({ browser }) => {
  test.setTimeout(180_000);
  await removeInvitee();
  const url = await invite(browser);
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route("**/api/address-search**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results: [] }) }));

  async function wednesday() {
    const [row] = await sql`SELECT p.availability FROM "BusinessProfile" p JOIN "User" u ON u."organizationId" = p."organizationId" WHERE u.email = ${INVITEE_EMAIL}`;
    const days = (row.availability as { days: Array<{ label: string; slots: Array<{ cabinet: boolean; home: boolean }> }> }).days;
    const flags = (label: string) => days.find((day) => day.label === label)!.slots.map((slot) => [slot.cabinet, slot.home]);
    return { wednesday: flags("Mercredi"), monday: flags("Lundi") };
  }

  try {
    await page.goto(url);
    await page.getByLabel("Prénom").fill("Élodie");
    await page.getByLabel("Nom", { exact: true }).fill("Invitée");
    await page.getByLabel("Mot de passe", { exact: true }).fill(INVITEE_PASSWORD);
    await page.getByLabel("Confirmer le mot de passe").fill(INVITEE_PASSWORD);
    await page.getByRole("button", { name: "Créer mon compte" }).click();
    await page.waitForURL("**/dashboard/bienvenue", { timeout: 20000 });

    await page.getByLabel(/Les deux/).check();
    await page.getByLabel("Adresse du cabinet").fill("8 rue de l’Essai, 76000 Rouen");
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page.getByRole("heading", { name: "Votre profil" })).toBeVisible({ timeout: 15000 });
    await page.getByLabel("Métier").selectOption("Comportementaliste");
    await page.getByLabel("Téléphone").fill("06 00 00 00 01");
    await page.getByRole("button", { name: "Continuer" }).click();

    // Horaires : le mercredi, domicile seulement.
    await expect(page.getByRole("heading", { name: "Vos horaires" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("checkbox", { name: "Lundi, cabinet" })).toBeChecked();
    await page.getByRole("checkbox", { name: "Mercredi, cabinet" }).uncheck();
    // Décocher aussi le domicile fermerait le jour : un jour garde au moins un mode.
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page.getByRole("heading", { name: "Vos prestations" })).toBeVisible({ timeout: 15000 });
    expect(await wednesday()).toEqual({ wednesday: [[false, true], [false, true]], monday: [[true, true], [true, true]] });

    // Prestation proposée au cabinet seulement : un seul tarif demandé.
    await expect(page.getByLabel("Proposée au cabinet")).toBeChecked();
    await expect(page.getByLabel("Proposée à domicile")).toBeChecked();
    await page.getByLabel("Nom", { exact: true }).fill("Bilan au cabinet");
    await page.getByLabel("Chien").check();
    await page.getByLabel("Proposée à domicile").uncheck();
    await expect(page.getByLabel("Tarif à domicile"), "pas de tarif pour un mode non proposé").toHaveCount(0);
    await page.getByLabel("Tarif au cabinet").fill("55");
    await page.getByRole("button", { name: "Ajouter la prestation" }).click();
    await expect(page.getByRole("list", { name: "Prestations ajoutées" })).toContainText("Cabinet uniquement · 55 €");
    const [service] = await sql`SELECT s."cabinetEnabled", s."homeEnabled", s."cabinetPrice" FROM "Service" s JOIN "User" u ON u."organizationId" = s."organizationId" WHERE u.email = ${INVITEE_EMAIL}`;
    expect([service.cabinetEnabled, service.homeEnabled, service.cabinetPrice]).toEqual([true, false, 55]);

    // Retour à l'étape 1, même façon d'exercer : le mercredi reste au domicile (bug B5).
    for (const heading of ["Vos horaires", "Votre profil", "Votre façon d’exercer"]) {
      await page.getByRole("button", { name: "Précédent" }).click();
      await expect(page.getByRole("heading", { name: heading })).toBeVisible({ timeout: 15000 });
    }
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page.getByRole("heading", { name: "Votre profil" })).toBeVisible({ timeout: 15000 });
    expect(await wednesday()).toEqual({ wednesday: [[false, true], [false, true]], monday: [[true, true], [true, true]] });
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page.getByRole("checkbox", { name: "Mercredi, cabinet" })).not.toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Mercredi, domicile" })).toBeChecked();
  } finally {
    await context.close();
  }
});

test("un ostéopathe animalier donne son numéro RNA ; son espace attend la vérification", async ({ browser }) => {
  test.setTimeout(240_000);
  await removeInvitee();
  const url = await invite(browser);
  // Un numéro déjà pris par le premier cabinet, le temps du test.
  const [demo] = await sql`SELECT "registrationNumber" FROM "BusinessProfile" WHERE "organizationId" = 'org-1002-pattes'`;
  await sql`UPDATE "BusinessProfile" SET "registrationNumber" = 'E2E RNA PRIS' WHERE "organizationId" = 'org-1002-pattes'`;
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route("**/api/address-search**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results: [] }) }));

  try {
    await page.goto(url);
    await page.getByLabel("Prénom").fill("Élodie");
    await page.getByLabel("Nom", { exact: true }).fill("Invitée");
    await page.getByLabel("Mot de passe", { exact: true }).fill(INVITEE_PASSWORD);
    await page.getByLabel("Confirmer le mot de passe").fill(INVITEE_PASSWORD);
    await page.getByRole("button", { name: "Créer mon compte" }).click();
    await page.waitForURL("**/dashboard/bienvenue", { timeout: 20000 });

    await page.getByLabel(/Au cabinet uniquement/).check();
    await page.getByLabel("Adresse du cabinet").fill("8 rue de l’Essai, 76000 Rouen");
    await page.getByRole("button", { name: "Continuer" }).click();

    // Profil : « ostéopathe » écrit dans « Autre » demande aussi le numéro.
    await expect(page.getByRole("heading", { name: "Votre profil" })).toBeVisible({ timeout: 15000 });
    const rna = page.getByLabel("Numéro RNA (Registre national d’aptitude)");
    await page.getByLabel("Métier", { exact: true }).selectOption("Autre");
    await page.getByLabel("Précisez votre métier").fill("Ostéopathe équin");
    await expect(rna).toBeVisible();
    await page.getByLabel("Métier", { exact: true }).selectOption("Comportementaliste");
    await expect(rna, "facultatif pour un autre métier : pas demandé").toHaveCount(0);
    await page.getByLabel("Métier", { exact: true }).selectOption("Ostéopathe animalier");
    await expect(page.getByText("Il sera vérifié avant l’ouverture de votre espace.")).toBeVisible();
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Indiquez votre numéro RNA" })).toBeVisible();
    // Déjà associé à un autre espace, même écrit autrement : refusé sans dire lequel.
    await rna.fill("e2e rna pris");
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Ce numéro est déjà associé à un compte." })).toBeVisible();
    await rna.fill("E2E-RNA-2026");
    await page.getByRole("button", { name: "Continuer" }).click();

    await expect(page.getByRole("heading", { name: "Vos horaires" })).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page.getByRole("heading", { name: "Vos prestations" })).toBeVisible({ timeout: 15000 });
    await page.getByLabel("Nom", { exact: true }).fill("Bilan ostéopathique");
    await page.getByLabel("Chien").check();
    await page.getByLabel("Tarif au cabinet").fill("60");
    await page.getByRole("button", { name: "Ajouter la prestation" }).click();
    await expect(page.getByRole("list", { name: "Prestations ajoutées" })).toContainText("Bilan ostéopathique");
    await page.getByRole("button", { name: "Continuer" }).click();

    // Lien : la page ne s'ouvrira qu'après la vérification.
    await expect(page.getByRole("heading", { name: "Votre lien de réservation" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Elle s’ouvrira au public dès que votre numéro RNA aura été vérifié.")).toBeVisible();
    await page.getByLabel("Votre lien").fill(SLUG);
    await page.getByRole("button", { name: "Terminer la configuration" }).click();
    await expect(page.getByRole("heading", { name: "Vérification de votre numéro RNA en cours" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Numéro transmis : E2E-RNA-2026")).toBeVisible();
    await expect(page.getByRole("link", { name: "Voir ma page de rendez-vous" })).toHaveCount(0);

    const [organization] = await sql`SELECT o.id, o."verificationStatus"::text AS status, o."onboardedAt", p."registrationNumber", p.profession
      FROM "Organization" o JOIN "BusinessProfile" p ON p."organizationId" = o.id JOIN "User" u ON u."organizationId" = o.id WHERE u.email = ${INVITEE_EMAIL}`;
    expect(organization.status).toBe("PENDING");
    expect(organization.onboardedAt, "la configuration est bien terminée").not.toBeNull();
    expect([organization.registrationNumber, organization.profession]).toEqual(["E2E-RNA-2026", "Ostéopathe animalier"]);
    const audits = await sql`SELECT action::text FROM "AuditLog" WHERE "organizationId" = ${organization.id} AND action IN ('ONBOARDING_COMPLETED', 'VERIFICATION_REQUESTED') ORDER BY "createdAt"`;
    expect(audits.map((row) => row.action)).toEqual(["ONBOARDING_COMPLETED", "VERIFICATION_REQUESTED"]);

    // Phase 4 : tant que le numéro n'est pas vérifié, l'espace se résume à
    // la page de vérification — quelle que soit l'adresse tapée.
    for (const path of ["/dashboard", "/dashboard/agenda", "/dashboard/clients", "/dashboard/parametres", "/dashboard/bienvenue"]) {
      await page.goto(path);
      await page.waitForURL("**/dashboard/verification", { timeout: 15000 });
    }
    await expect(page.getByRole("heading", { name: "Vérification de votre numéro RNA en cours" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Agenda" }), "ni menu vers des pages fermées").toHaveCount(0);
    await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible();

    // La page publique est fermée, comme un lien inconnu.
    const anonymous = await browser.newContext();
    expect((await (await anonymous.newPage()).goto(`/reserver/${SLUG}`))?.status()).toBe(404);
    await anonymous.close();

    // L'assistance de la plateforme, elle, entre dans l'espace.
    const platform = await browser.newContext();
    try {
      const helper = await platform.newPage();
      await loginAsPlatform(helper, sql, platformId, PLATFORM_EMAIL);
      await helper.goto("/plateforme", { waitUntil: "networkidle" });
      const row = helper.getByRole("listitem").filter({ hasText: INVITEE_EMAIL });
      await row.getByRole("button", { name: "Assister" }).click();
      await row.getByLabel("Motif de l’assistance").fill("Test automatique : espace en attente de vérification");
      await row.getByRole("button", { name: /^Ouvrir l’assistance/ }).click();
      await helper.waitForURL(/\/dashboard$/, { timeout: 15000 });
      await helper.goto("/dashboard/agenda");
      await expect(helper, "pas de renvoi vers la vérification").toHaveURL(/\/dashboard\/agenda$/);
    } finally {
      await platform.close();
    }

    // Phase 5 : la plateforme contrôle le numéro. Une session à part : celle
    // qui assiste n'a plus accès à la super-administration.
    const reviewer = await browser.newContext();
    try {
      const platformPage = await reviewer.newPage();
      await loginAsPlatform(platformPage, sql, platformId, PLATFORM_EMAIL);
      await platformPage.goto("/plateforme", { waitUntil: "networkidle" });
      // Les espaces à vérifier passent en tête.
      await expect(platformPage.getByRole("region").first().getByRole("heading", { level: 2 })).toContainText("Élodie Comportement");
      const firstCard = platformPage.getByRole("region", { name: /^Élodie Comportement/ });
      await expect(firstCard.getByText("À vérifier", { exact: true })).toBeVisible();
      const review = firstCard.getByRole("region", { name: /Vérification du numéro RNA/ });
      await expect(review).toContainText("Ostéopathe animalier");
      await expect(review).toContainText("E2E-RNA-2026");
      await expect(review.getByRole("link", { name: /annuaire de l’Ordre des vétérinaires/ })).toHaveAttribute("href", /registre-national-daptitude-rna/);

      // Refus : motif obligatoire.
      await review.getByRole("button", { name: "Refuser" }).click();
      await review.getByRole("button", { name: "Confirmer le refus" }).click();
      await expect(review.getByRole("alert")).toContainText("Indiquez le motif du refus");
      await review.getByLabel("Motif du refus").fill("Numéro introuvable dans l’annuaire de l’Ordre.");
      await review.getByRole("button", { name: "Confirmer le refus" }).click();
      await expect(firstCard.getByText("Numéro RNA refusé")).toBeVisible({ timeout: 15000 });

      // Le professionnel voit le motif, corrige son numéro et redemande.
      await page.goto("/dashboard/agenda");
      await page.waitForURL("**/dashboard/verification", { timeout: 15000 });
      await expect(page.getByRole("heading", { name: "Votre numéro RNA n’a pas pu être validé" })).toBeVisible();
      await expect(page.getByText("Numéro introuvable dans l’annuaire de l’Ordre.")).toBeVisible();
      const corrected = page.getByLabel("Numéro RNA (Registre national d’aptitude)");
      await expect(corrected).toHaveValue("E2E-RNA-2026");
      await corrected.fill("e2e rna pris");
      await page.getByRole("button", { name: "Demander une nouvelle vérification" }).click();
      await expect(page.getByRole("alert").filter({ hasText: "Ce numéro est déjà associé à un compte." })).toBeVisible();
      await corrected.fill("E2E-RNA-2027");
      await page.getByRole("button", { name: "Demander une nouvelle vérification" }).click();
      await expect(page.getByRole("heading", { name: "Vérification de votre numéro RNA en cours" })).toBeVisible({ timeout: 15000 });
      await expect(page.getByText("Numéro transmis : E2E-RNA-2027")).toBeVisible();
      const [again] = await sql`SELECT o."verificationStatus"::text AS status, o."verificationNote", p."registrationNumber" FROM "Organization" o JOIN "BusinessProfile" p ON p."organizationId" = o.id WHERE o.id = ${organization.id}`;
      expect([again.status, again.verificationNote, again.registrationNumber]).toEqual(["PENDING", null, "E2E-RNA-2027"]);

      // Validation : l'espace et la page publique s'ouvrent.
      await platformPage.reload({ waitUntil: "networkidle" });
      await expect(platformPage.getByRole("region").first().getByRole("heading", { level: 2 })).toContainText("Élodie Comportement");
      const card = platformPage.getByRole("region", { name: /^Élodie Comportement/ });
      await expect(card).toContainText("E2E-RNA-2027");
      await card.getByRole("button", { name: "Valider le numéro" }).click();
      await expect(card.getByText("À vérifier", { exact: true })).toHaveCount(0, { timeout: 15000 });
    } finally {
      await reviewer.close();
    }

    const [verified] = await sql`SELECT "verificationStatus"::text AS status, "verifiedAt", "verifiedByUserId" FROM "Organization" WHERE id = ${organization.id}`;
    expect(verified.status).toBe("VERIFIED");
    expect(verified.verifiedAt).not.toBeNull();
    expect(verified.verifiedByUserId).toBe(platformId);
    const decisions = await sql`SELECT action::text, metadata FROM "AuditLog" WHERE "organizationId" = ${organization.id} AND action IN ('VERIFICATION_REQUESTED', 'VERIFICATION_REJECTED', 'VERIFICATION_APPROVED') ORDER BY "createdAt"`;
    expect(decisions.map((row) => row.action)).toEqual(["VERIFICATION_REQUESTED", "VERIFICATION_REJECTED", "VERIFICATION_REQUESTED", "VERIFICATION_APPROVED"]);
    // L'e-mail de chaque décision est parti (ou son échec serait compté ici).
    for (const row of decisions.filter((decision) => decision.action !== "VERIFICATION_REQUESTED")) expect(row.metadata).toEqual({ emailsSent: 1, emailsFailed: 0 });

    await page.goto("/dashboard");
    await expect(page, "le tableau de bord s'ouvre").toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("link", { name: "Agenda" }).first()).toBeVisible();
    const visitor = await browser.newContext();
    expect((await (await visitor.newPage()).goto(`/reserver/${SLUG}`))?.status(), "page publique ouverte").toBe(200);
    await visitor.close();
  } finally {
    await context.close();
    await sql`UPDATE "BusinessProfile" SET "registrationNumber" = ${demo.registrationNumber} WHERE "organizationId" = 'org-1002-pattes'`;
  }
});
