import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Vérifie le scénario exact décrit dans AUDIT-RESERVATION.md (test attendu
 * #4) : un soin de 60 min à 09:00 doit rendre 09:30 indisponible, alors que
 * 09:00 et 10:30+ restent libres. hasConflict() (src/lib/appointments-actions.ts)
 * compare désormais des intervalles [start, start+duration) plutôt qu'une
 * égalité stricte sur l'heure de départ.
 *
 * Passe par le formulaire interne (saveAppointmentAction) plutôt que le
 * tunnel public : les créneaux fixes proposés publiquement (slotsByWeekday)
 * ne sont volontairement pas espacés de 30 min les uns des autres, donc ce
 * scénario précis n'y est pas reproductible tel quel — mais hasConflict()
 * est la même fonction pour les deux flux (règle du dépôt : toute
 * correction de conflit doit valoir pour le dashboard ET le public).
 */

const TEST_DATE = "2026-10-19"; // Lundi, hors de toute donnée de démonstration ou réelle connue
const TEST_CLIENT_NAMES = ["E2E Overlap Ref", "E2E Overlap Conflict"];

test.describe("Chevauchement de créneaux (dashboard)", () => {
  test.afterEach(async () => {
    // Les rendez-vous créés par ce test sont réels (mêmes actions serveur
    // que le dashboard) : nettoyage direct en base plutôt que de laisser des
    // fiches de test s'accumuler à chaque exécution. Requête SQL brute
    // (plutôt que le client Prisma généré) pour rester compatible avec le
    // runtime de test de Playwright, qui ne charge pas ce module ESM généré
    // de la même façon que Next.js/tsx.
    const sql = neon(process.env.DATABASE_URL!);
    await sql`DELETE FROM "Appointment" WHERE "clientName" = ANY(${TEST_CLIENT_NAMES})`;
  });

  test("un rendez-vous de 60 min à 09:00 rend 09:30 indisponible mais laisse 10:30 libre", async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);

    await page.goto("/login");
    await page.fill('input[type="email"]', "praticien-test@pf-osteo-animale.fr");
    await page.fill('input[type="password"]', "Praticien-Test-2026!");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 10000 });

    async function openForm() {
      await page.goto("/dashboard/agenda");
      // Course d'hydratation connue : un clic immédiatement après goto()
      // peut atterrir avant que React n'ait attaché ses gestionnaires et
      // ne rien faire silencieusement (même contournement que les tests de
      // notifications).
      await page.waitForTimeout(600);
      await page.getByRole("button", { name: "Nouveau rendez-vous", exact: true }).click();
      const dialog = page.locator('[role="dialog"]').first();
      await expect(dialog).toBeVisible();
      return dialog;
    }

    async function fill(dialog: ReturnType<typeof page.locator>, opts: { time: string; duration: number; name: string }) {
      await dialog.getByPlaceholder("Nom du client, ou recherchez une fiche existante").fill(opts.name);
      await dialog.getByPlaceholder("Nom de l’animal").fill(opts.name);
      await dialog.locator('input[type="date"]').fill(TEST_DATE);
      await dialog.locator('input[type="time"]').fill(opts.time);
      await dialog.getByLabel("Durée").selectOption(String(opts.duration));
    }

    // Le formulaire se ferme dès l'enregistrement réussi (le message de
    // confirmation est donc trop transitoire pour être une assertion fiable
    // en E2E) : la vérité vérifiée ici est l'état réel en base, pas un
    // message d'UI éphémère.
    async function fetchAppointment(clientName: string) {
      const rows = await sql`SELECT "start", "duration" FROM "Appointment" WHERE "clientName" = ${clientName} AND "date" = ${`${TEST_DATE}T00:00:00.000Z`}`;
      return rows[0] as { start: string; duration: number } | undefined;
    }

    // RDV de référence : 60 min à 09:00.
    const dialog1 = await openForm();
    await fill(dialog1, { time: "09:00", duration: 60, name: "E2E Overlap Ref" });
    await dialog1.getByRole("button", { name: "Créer le rendez-vous" }).click();
    await expect.poll(() => fetchAppointment("E2E Overlap Ref"), { timeout: 5000 }).toMatchObject({ start: "09:00", duration: 60 });

    // 09:30 chevauche [09:00, 10:00) : doit être refusé, le dialogue reste
    // ouvert avec le message d'erreur (ici vérifiable de façon fiable,
    // puisque rien ne ferme le formulaire dans ce cas).
    const dialog2 = await openForm();
    await fill(dialog2, { time: "09:30", duration: 30, name: "E2E Overlap Conflict" });
    await dialog2.getByRole("button", { name: "Créer le rendez-vous" }).click();
    await expect(page.getByText(/chevauche un autre rendez-vous/)).toBeVisible({ timeout: 5000 });
    expect(await fetchAppointment("E2E Overlap Conflict")).toBeUndefined();

    // 10:30 ne chevauche pas [09:00, 10:00) : doit passer.
    await dialog2.locator('input[type="time"]').fill("10:30");
    await dialog2.getByRole("button", { name: "Créer le rendez-vous" }).click();
    await expect.poll(() => fetchAppointment("E2E Overlap Conflict"), { timeout: 5000 }).toMatchObject({ start: "10:30", duration: 30 });
  });
});
