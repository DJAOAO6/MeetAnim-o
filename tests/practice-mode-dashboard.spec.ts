import { expect, test } from "@playwright/test";
import { neon } from "./helpers/sql";
import { config } from "dotenv";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

/**
 * Mode d'exercice, vu par le professionnel.
 *
 * Sans cabinet, l'espace de travail ne doit plus en parler : ni bloc
 * « Ouverture du cabinet » sur le tableau de bord, ni onglet Cabinet dans
 * les disponibilités, ni tarif cabinet dans une prestation, ni rappel sur
 * l'agenda expliquant comment concilier deux modes dont un seul existe.
 *
 * Le réglage lui-même reste accessible : c'est par lui qu'on ouvre un
 * cabinet plus tard.
 */
async function setMode(mode: "HOME_ONLY" | "OFFICE_ONLY" | "BOTH") {
  await sql`UPDATE "BusinessProfile" SET "practiceMode" = ${mode}::"PracticeMode"`;
}

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await setMode("BOTH");
});

test("le réglage propose les trois façons d'exercer, et demande un point de départ quand il n'y a pas de cabinet", async ({ page }) => {
  await setMode("BOTH");
  await page.goto("/dashboard/parametres?tab=cabinet", { waitUntil: "networkidle" });

  const group = page.getByRole("group", { name: "Mode d’exercice" });
  await expect(group).toBeVisible();
  await expect(group.getByRole("button", { name: /Les deux/ })).toHaveAttribute("aria-pressed", "true");
  // Avec un cabinet, c'est son adresse qu'on renseigne.
  await expect(page.getByLabel("Adresse du cabinet")).toBeVisible();
  await expect(page.getByLabel("Adresse de départ")).toHaveCount(0);

  await group.getByRole("button", { name: /À domicile uniquement/ }).click();
  // Sans cabinet : plus d'adresse publique à saisir, mais un point de départ
  // privé, annoncé comme tel.
  await expect(page.getByLabel("Adresse du cabinet")).toHaveCount(0);
  await expect(page.getByLabel("Adresse de départ")).toBeVisible();
  await expect(page.getByText(/n’apparaît jamais sur votre page de réservation/)).toBeVisible();
});

test("à domicile uniquement, l'espace professionnel ne parle plus de cabinet", async ({ page }) => {
  await setMode("HOME_ONLY");

  await page.goto("/dashboard", { waitUntil: "networkidle" });
  await expect(page.getByText("Ouverture du cabinet")).toHaveCount(0);

  await page.goto("/dashboard/agenda", { waitUntil: "networkidle" });
  await expect(page.getByText(/Cabinet et Domicile sont deux modes/)).toHaveCount(0);

  await page.goto("/dashboard/prestations", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Modifier" }).first().click();
  await expect(page.getByText("Prix à domicile")).toBeVisible();
  await expect(page.getByText("Prix au cabinet")).toHaveCount(0);
});

test("avec les deux modes, tout est de nouveau là", async ({ page }) => {
  await setMode("BOTH");

  await page.goto("/dashboard/agenda", { waitUntil: "networkidle" });
  await expect(page.getByText(/Cabinet et Domicile sont deux modes/)).toBeVisible();

  await page.goto("/dashboard/prestations", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Modifier" }).first().click();
  await expect(page.getByText("Prix au cabinet")).toBeVisible();
});
