import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

const EMAIL = "praticien-test@pf-osteo-animale.fr";

type Availability = { closures: Array<{ id: string; date: string; endDate?: string; scope: string; reason: string }>; publicMessage?: string };

async function profile(): Promise<{ slug: string; cabinetAvailable: boolean; homeAvailable: boolean; availability: Availability }> {
  const sql = neon(process.env.DATABASE_URL!);
  const [row] = await sql`SELECT slug, "cabinetAvailable", "homeAvailable", availability FROM "BusinessProfile" LIMIT 1`;
  return row as { slug: string; cabinetAvailable: boolean; homeAvailable: boolean; availability: Availability };
}

async function restore(original: { cabinetAvailable: boolean; homeAvailable: boolean; availability: Availability }) {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`UPDATE "BusinessProfile" SET "cabinetAvailable" = ${original.cabinetAvailable}, "homeAvailable" = ${original.homeAvailable}, availability = ${JSON.stringify(original.availability)}::jsonb`;
}

function inDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Gestionnaire de disponibilités. Ce qui compte n'est pas l'affichage du
 * badge mais l'effet réel : ce que la base enregistre, et ce que voit un
 * visiteur sur la page de réservation. Les vérifications portent donc sur ces
 * deux points, jamais seulement sur le DOM du tableau de bord.
 *
 * Un seul parcours pour tout le scénario : la connexion est limitée en débit
 * côté serveur, et l'état du cabinet est une donnée partagée qu'il faut
 * remettre en place à la fin.
 */
test("fermer, programmer une fermeture, afficher un message, puis rouvrir", async ({ page }) => {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`UPDATE "User" SET permissions = ARRAY['MANAGE_PUBLIC_SETTINGS'] WHERE email = ${EMAIL}`;
  const original = await profile();

  try {
    await page.goto("/dashboard");

    // CAS 1 — fermeture immédiate du cabinet, confirmée.
    await page.getByTestId("block-availabilityCabinet").getByRole("button", { name: /gérer les disponibilités/i }).click();
    await expect(page.getByRole("heading", { name: "Gérer les disponibilités" })).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "⏸ Fermer maintenant" }).click();
    await page.getByRole("dialog").filter({ hasText: "Fermer le cabinet aux réservations" }).getByRole("button", { name: "Fermer" }).click();
    await expect(page.getByText(/cabinet fermé aux nouvelles réservations/i)).toBeVisible({ timeout: 15000 });
    expect((await profile()).cabinetAvailable, "la fermeture doit être enregistrée").toBe(false);

    // CAS 4 — le domicile reste ouvert : les deux modes sont indépendants.
    expect((await profile()).homeAvailable).toBe(original.homeAvailable);

    // CAS 13 — la page publique refuse désormais le cabinet.
    const { slug } = await profile();
    await page.goto(`/reserver/${slug}`);
    await expect(page.getByText(/cabinet/i).first()).toBeVisible({ timeout: 15000 });
    const cabinetOption = page.getByRole("button", { name: /au cabinet/i });
    if (await cabinetOption.count()) await expect(cabinetOption.first()).toBeDisabled();

    // CAS 2 — réouverture immédiate.
    await page.goto("/dashboard");
    await page.getByTestId("block-availabilityCabinet").getByRole("button", { name: /gérer les disponibilités/i }).click();
    await page.getByRole("button", { name: "▶ Ouvrir maintenant" }).click();
    await expect(page.getByText(/cabinet ouvert aux réservations/i)).toBeVisible({ timeout: 15000 });
    expect((await profile()).cabinetAvailable).toBe(true);

    // CAS 3 — fermeture programmée sur plusieurs jours, avec réouverture
    // automatique : elle cesse de s'appliquer passé sa date de fin.
    await page.getByRole("button", { name: /fermeture temporaire/i }).click();
    const closureDialog = page.getByRole("dialog").filter({ hasText: "Programmer une fermeture" });
    await closureDialog.getByLabel("Du").fill(inDays(7));
    await closureDialog.getByLabel("Au (dernier jour fermé)").fill(inDays(14));
    await closureDialog.getByRole("button", { name: "Programmer" }).click();

    // CAS 13 bis — message affiché aux clients.
    await page.getByLabel("Message affiché aux clients").fill("Le cabinet est fermé la semaine prochaine.");
    await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect(page.getByText(/disponibilités enregistrées/i)).toBeVisible({ timeout: 15000 });

    const saved = await profile();
    const closure = saved.availability.closures.find((item) => item.date === inDays(7));
    expect(closure, "la fermeture programmée doit être enregistrée").toBeDefined();
    expect(closure!.endDate).toBe(inDays(14));
    expect(saved.availability.publicMessage).toContain("fermé la semaine prochaine");

    // Le message apparaît réellement sur la page publique.
    await page.goto(`/reserver/${slug}`);
    await expect(page.getByText("Le cabinet est fermé la semaine prochaine.")).toBeVisible({ timeout: 15000 });

    // La carte du cabinet annonce la fermeture à venir plutôt qu'un simple
    // « ouvert » : c'est toute la raison d'être de cette carte.
    await page.goto("/dashboard");
    await expect(page.getByTestId("block-availabilityCabinet").getByText(/fermeture prévue/i)).toBeVisible({ timeout: 15000 });

    // Et l'autre mode n'est pas concerné : une fermeture du cabinet seul ne
    // doit pas teinter la carte du domicile.
    await expect(page.getByTestId("block-availabilityHome").getByText(/fermeture prévue/i)).toHaveCount(0);
  } finally {
    await restore(original);
  }
});
