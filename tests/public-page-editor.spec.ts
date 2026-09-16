import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

const EMAIL = "praticien-test@pf-osteo-animale.fr";

type StoredPage = { theme: { primaryColor: string }; sections: Array<{ id: string; visible: boolean; title?: string }> };

async function storedPages(): Promise<{ draft: StoredPage | null; published: StoredPage | null }> {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`SELECT "publicPageDraft" AS draft, "publicPagePublished" AS published, slug FROM "BusinessProfile" LIMIT 1`;
  const row = rows[0] as { draft: StoredPage | null; published: StoredPage | null };
  return { draft: row.draft, published: row.published };
}

async function professionalSlug(): Promise<string> {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`SELECT slug FROM "BusinessProfile" LIMIT 1`;
  return (rows[0] as { slug: string }).slug;
}

/**
 * La page de démonstration est partagée avec les autres specs publiques :
 * publier une composition et la laisser en place ferait échouer, à juste
 * titre, les tests qui vérifient la présentation d'origine.
 */
test.afterEach(async () => {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`UPDATE "BusinessProfile" SET "publicPageDraft" = NULL, "publicPagePublished" = NULL, "publicPagePublishedAt" = NULL`;
});

/**
 * Éditeur de page de réservation : brouillon puis publication.
 *
 * Le point le plus important n'est pas que l'éditeur enregistre, mais que le
 * brouillon ne change rien pour les visiteurs tant qu'il n'est pas publié —
 * c'est toute la raison d'avoir deux versions. Le test vérifie donc aussi la
 * page publique entre les deux.
 */
test("composer la page, enregistrer un brouillon invisible des clients, puis publier", async ({ page }) => {
  const sql = neon(process.env.DATABASE_URL!);
  // Même préparation que les autres specs de réglages publics : le compte de
  // test est praticien, la permission lui est accordée explicitement.
  await sql`UPDATE "User" SET permissions = ARRAY['MANAGE_PUBLIC_SETTINGS'] WHERE email = ${EMAIL}`;
  await sql`UPDATE "BusinessProfile" SET "publicPageDraft" = NULL, "publicPagePublished" = NULL, "publicPagePublishedAt" = NULL`;
  const slug = await professionalSlug();

  await page.goto("/dashboard/parametres");
  await page.getByRole("button", { name: /page de réservation/i }).click();
  await expect(page.getByTestId("public-page-preview")).toBeVisible({ timeout: 15000 });

  // Masquer les horaires, renommer « À propos », changer la couleur principale.
  await page.getByTestId("block-hours").getByRole("button", { name: "Masquer" }).click();
  await page.getByTestId("block-about").getByRole("button", { name: "Régler" }).click();
  await page.getByRole("textbox").first().fill("Qui suis-je");
  await page.getByRole("button", { name: /toute la page/i }).click();
  await page.getByLabel("Couleur principale").fill("#2f7a6e");

  // Aperçu : les trois formats sont proposés et le contenu suit.
  await page.getByRole("button", { name: "Téléphone", exact: true }).click();
  await expect(page.getByTestId("public-page-preview")).toBeVisible();

  await page.getByRole("button", { name: /enregistrer le brouillon/i }).click();
  await expect(page.getByTestId("save-status")).toHaveText(/modifications enregistrées/i, { timeout: 15000 });

  const afterDraft = await storedPages();
  expect(afterDraft.draft, "le brouillon doit être enregistré").not.toBeNull();
  expect(afterDraft.published, "rien ne doit être publié à ce stade").toBeNull();
  expect(afterDraft.draft!.theme.primaryColor).toBe("#2f7a6e");
  expect(afterDraft.draft!.sections.find((section) => section.id === "hours")!.visible).toBe(false);

  // La page publique n'a pas bougé : les horaires y sont toujours.
  await page.goto(`/reserver/${slug}`);
  await expect(page.getByRole("heading", { name: "Horaires" })).toBeVisible({ timeout: 15000 });

  // Publication.
  await page.goto("/dashboard/parametres");
  await page.getByRole("button", { name: /page de réservation/i }).click();
  await expect(page.getByTestId("public-page-preview")).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Publier", exact: true }).click();
  await expect(page.getByTestId("save-status")).toHaveText(/modifications enregistrées/i, { timeout: 15000 });

  const afterPublish = await storedPages();
  expect(afterPublish.published, "la page doit être publiée").not.toBeNull();
  expect(afterPublish.published!.sections.find((section) => section.id === "hours")!.visible).toBe(false);
  expect(afterPublish.published!.sections.find((section) => section.id === "about")!.title).toBe("Qui suis-je");

  // La page publique applique la composition publiée.
  await page.goto(`/reserver/${slug}`);
  await expect(page.getByRole("heading", { name: "Qui suis-je" })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("heading", { name: "Horaires" })).toHaveCount(0);
});
