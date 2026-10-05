import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "./helpers/sql";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

/**
 * Numéro RNA dans Paramètres (chantier C4, phase 3). L'espace de
 * démonstration a été marqué vérifié par la migration, sans numéro : il peut
 * le saisir une fois, puis le numéro est figé.
 *
 * Et les deux formulaires de l'onglet « Mon cabinet » n'envoient que leurs
 * champs : enregistrer « Profil public » ne rétablit pas le numéro d'avant.
 *
 * Le profil, le statut et les permissions sont rétablis à la fin.
 */
const EMAIL = "praticien-test@pf-osteo-animale.fr";
const ORGANIZATION = "org-1002-pattes";
const NUMBER = "E2E-RNA-DEMO";
const TAGLINE = "Accroche E2E numéro RNA";

let saved: { registrationNumber: string | null; tagline: string | null; profession: string; verificationStatus: string; permissions: string[] } | null = null;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const [row] = await sql`SELECT p."registrationNumber", p.tagline, p.profession, o."verificationStatus"::text AS "verificationStatus", u.permissions
    FROM "BusinessProfile" p JOIN "Organization" o ON o.id = p."organizationId" JOIN "User" u ON u."organizationId" = o.id
    WHERE o.id = ${ORGANIZATION} AND u.email = ${EMAIL}`;
  saved = row as typeof saved;
  await sql`UPDATE "BusinessProfile" SET "registrationNumber" = NULL, profession = 'Ostéopathe animalier' WHERE "organizationId" = ${ORGANIZATION}`;
  await sql`UPDATE "Organization" SET "verificationStatus" = 'VERIFIED' WHERE id = ${ORGANIZATION}`;
  await sql`UPDATE "User" SET permissions = ARRAY['MANAGE_PUBLIC_SETTINGS'] WHERE email = ${EMAIL}`;
});

test.afterAll(async () => {
  if (!saved) return;
  await sql`UPDATE "BusinessProfile" SET "registrationNumber" = ${saved.registrationNumber}, tagline = ${saved.tagline}, profession = ${saved.profession} WHERE "organizationId" = ${ORGANIZATION}`;
  await sql`UPDATE "Organization" SET "verificationStatus" = ${saved.verificationStatus}::"VerificationStatus" WHERE id = ${ORGANIZATION}`;
  await sql`UPDATE "User" SET permissions = ${saved.permissions} WHERE email = ${EMAIL}`;
});

test("un espace vérifié sans numéro le saisit une fois, puis il est figé", async ({ page }) => {
  await page.goto("/dashboard/parametres");
  const profile = page.getByTestId("settings-profile");
  await expect(profile.getByLabel("Profession")).toHaveValue("Ostéopathe animalier");
  const field = profile.getByLabel("Numéro RNA (Registre national d’aptitude)");
  await expect(field).toBeEditable();
  await expect(profile.getByText("Une fois enregistré, seul le support pourra le modifier.")).toBeVisible();

  await field.fill(NUMBER);
  await profile.getByRole("button", { name: "Enregistrer les modifications" }).click();
  await expect(page.getByText("Profil enregistré et visible sur votre page publique")).toBeVisible({ timeout: 10000 });
  await expect(field, "figé une fois enregistré").not.toBeEditable();
  await expect(profile.getByText("Numéro vérifié. Contactez le support pour le modifier.")).toBeVisible();

  // L'autre formulaire date d'avant l'enregistrement : il ne doit pas
  // renvoyer l'ancien numéro (vide), ni rien d'autre que ses propres champs.
  const publicProfile = page.getByTestId("settings-public-profile");
  await publicProfile.getByLabel("Phrase d’accroche").fill(TAGLINE);
  await publicProfile.getByRole("button", { name: "Enregistrer les modifications" }).click();
  await expect(page.getByText("Profil public enregistré et visible sur votre page de réservation")).toBeVisible({ timeout: 10000 });

  const [row] = await sql`SELECT "registrationNumber", tagline FROM "BusinessProfile" WHERE "organizationId" = ${ORGANIZATION}`;
  expect([row.registrationNumber, row.tagline]).toEqual([NUMBER, TAGLINE]);

  await page.reload();
  await expect(page.getByTestId("settings-profile").getByLabel("Numéro RNA (Registre national d’aptitude)")).toHaveValue(NUMBER);
  await expect(page.getByTestId("settings-profile").getByLabel("Numéro RNA (Registre national d’aptitude)")).not.toBeEditable();
});

test("un autre métier voit un numéro d'agrément facultatif, et ne change plus de métier", async ({ page }) => {
  await sql`UPDATE "BusinessProfile" SET "registrationNumber" = NULL, profession = 'Toiletteur' WHERE "organizationId" = ${ORGANIZATION}`;
  await page.goto("/dashboard/parametres");
  const profile = page.getByTestId("settings-profile");
  await expect(profile.getByLabel("N° d’agrément / certification (facultatif)")).toBeVisible();
  await expect(profile.getByLabel("Numéro RNA (Registre national d’aptitude)")).toHaveCount(0);
  // Le métier choisi à la configuration est figé : devenir « ostéopathe »
  // ici contournerait la vérification du numéro RNA.
  const profession = profile.getByLabel("Profession");
  await expect(profession).toHaveValue("Toiletteur");
  await expect(profession).not.toBeEditable();
  await expect(profile.getByText("Choisi à la configuration de votre espace. Contactez le support pour le modifier.")).toBeVisible();
});
