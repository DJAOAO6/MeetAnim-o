import { expect, test } from "@playwright/test";
import { loginAsSecretary } from "./helpers/secretary-login";

/**
 * FIX_PLAN.md item 30(d) : la séparation des rôles pour le compte
 * Secrétariat n'avait jamais été vérifiée en direct (AUDIT_COMPLET.md
 * P2-14) — seulement par lecture de code, faute d'accès à la double
 * authentification par email pendant l'audit initial. La technique de
 * connexion simulée développée pour tests/auth-login-2fa.spec.ts
 * (tests/helpers/secretary-login.ts) lève cette limite : ces scénarios
 * vérifient donc, pour la première fois en conditions réelles, que le
 * compte Secrétariat (role: SECRETARY, permissions: []) est bien restreint
 * comme le code le laissait supposer.
 */

test.describe("Séparation des rôles — compte Secrétariat", () => {
  test.describe.configure({ mode: "serial" });

  test("connexion aboutit bien au tableau de bord", async ({ page }) => {
    await loginAsSecretary(page);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("la barre latérale ne propose ni Administration ni Statistiques", async ({ page }) => {
    await loginAsSecretary(page);
    await expect(page.getByRole("link", { name: "Administration" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Statistiques" })).toHaveCount(0);
  });

  test("l'accès direct à /dashboard/admin redirige (garde côté serveur, pas seulement un lien masqué)", async ({ page }) => {
    await loginAsSecretary(page);
    await page.goto("/dashboard/admin");
    await page.waitForURL("**/dashboard", { timeout: 10000 });
    await expect(page).not.toHaveURL(/\/dashboard\/admin/);
  });

  test("l'accès direct à /dashboard/statistiques redirige (garde côté serveur)", async ({ page }) => {
    await loginAsSecretary(page);
    await page.goto("/dashboard/statistiques");
    await page.waitForURL("**/dashboard", { timeout: 10000 });
    await expect(page).not.toHaveURL(/\/dashboard\/statistiques/);
  });

  test("aucun bouton de suppression de client n'est proposé (DELETE_CLIENTS absent)", async ({ page }) => {
    await loginAsSecretary(page);
    await page.goto("/dashboard/clients");
    await page.waitForTimeout(800);
    await expect(page.getByRole("button", { name: "Supprimer ce client" })).toHaveCount(0);
  });

  test("les prestations sont visibles mais en lecture seule, avec un message explicite", async ({ page }) => {
    await loginAsSecretary(page);
    await page.goto("/dashboard/prestations");
    await page.waitForTimeout(800);
    await expect(page.getByText("Vous n’avez pas la permission de modifier les prestations")).toBeVisible();
    await expect(page.getByRole("button", { name: "+ Nouvelle prestation" })).toHaveCount(0);
  });
});
