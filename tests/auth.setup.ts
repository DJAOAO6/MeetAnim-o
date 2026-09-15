import { config } from "dotenv";
import { test as setup, expect } from "@playwright/test";

config({ path: ".env.local" });

export const PRACTITIONER_STATE = "tests/.auth/practitioner.json";

/**
 * Connexion jouée une seule fois, réutilisée par les specs qui ont juste
 * besoin d'être connectées (responsive, tableau de bord, agenda tactile).
 *
 * Raison d'être : la connexion est limitée en débit côté serveur (protection
 * anti-force brute, 10 tentatives par quart d'heure et par compte). Une
 * exécution répétée de la suite — le cas normal pendant un développement —
 * épuisait ce quota et faisait échouer des tests parfaitement corrects.
 *
 * Les specs qui testent le parcours de connexion lui-même gardent
 * évidemment leur propre connexion explicite.
 */
setup("connexion praticien", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[type="email"]', "praticien-test@pf-osteo-animale.fr");
  await page.fill('input[type="password"]', "Praticien-Test-2026!");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 20000 });
  await expect(page).toHaveURL(/dashboard/);
  await page.context().storageState({ path: PRACTITIONER_STATE });
});
