import { existsSync, readFileSync, statSync } from "node:fs";
import { config } from "dotenv";
import { test as setup, expect } from "@playwright/test";
import { BASE_URL } from "./helpers/base-url";

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
// Session réutilisée tant qu'elle est fraîche : sans cela, chaque exécution
// de la suite consommait une connexion, et quelques itérations suffisaient à
// déclencher la limitation anti-force brute du serveur.
//
// Six heures : le cookie de session vaut sept jours côté serveur
// (src/lib/auth/session.ts), la marge est donc large, et une journée de
// développement tient en deux ou trois connexions au lieu d'une par
// exécution.
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

/**
 * La session enregistrée ouvre-t-elle encore l'espace pro ? L'âge du fichier
 * ne suffit plus : depuis que les sessions sont révocables côté serveur
 * (déconnexion, migration, mot de passe changé), un fichier récent peut
 * porter un jeton refusé — et toutes les specs connectées échoueraient.
 */
async function storedSessionStillWorks(): Promise<boolean> {
  try {
    const state = JSON.parse(readFileSync(PRACTITIONER_STATE, "utf8")) as { cookies: { name: string; value: string }[] };
    const cookie = state.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const response = await fetch(`${BASE_URL}/dashboard`, { headers: { Cookie: cookie }, redirect: "manual" });
    return response.status === 200;
  } catch {
    return false;
  }
}

setup("connexion praticien", async ({ page }) => {
  if (existsSync(PRACTITIONER_STATE) && Date.now() - statSync(PRACTITIONER_STATE).mtimeMs < MAX_AGE_MS && await storedSessionStillWorks()) {
    setup.skip(true, "session encore valide, connexion inutile");
    return;
  }

  await page.goto("/login");
  await page.fill('input[type="email"]', "praticien-test@pf-osteo-animale.fr");
  await page.fill('input[type="password"]', "Praticien-Test-2026!");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 20000 });
  await expect(page).toHaveURL(/dashboard/);
  await page.context().storageState({ path: PRACTITIONER_STATE });
});
