import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  // Un seul worker : les specs pilotent le même serveur next dev partagé
  // (npm run dev, voir webServer ci-dessous) avec des parcours de
  // réservation réels (chargement de disponibilités, revalidation de
  // créneau). Plusieurs navigateurs parallèles ralentissent suffisamment ce
  // serveur unique pour que ces vérifications réseau, correctes, échouent
  // par pur manque de temps — pas un bug applicatif (diagnostiqué et
  // documenté au fil des Phases 4/5/PROMPT-CALENDRIER). Le `mode: "serial"`
  // posé dans chaque describe ne sérialise qu'à l'intérieur d'un même
  // fichier/projet, pas entre eux : ceci couvre le cas général une bonne
  // fois plutôt que d'empiler des contournements par fichier.
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // Scopé au calendrier (PROMPT-CALENDRIER.md, test attendu #8) plutôt
    // qu'à toute la suite : faire rejouer chaque test deux fois ralentirait
    // sensiblement l'exécution locale sans valeur ajoutée pour les specs qui
    // ne touchent pas au responsive mobile.
    //
    // devices["iPhone 13"] lance WebKit, indisponible dans cet environnement
    // (bibliothèque système manquante — libegl.dll — hors du périmètre de ce
    // travail à corriger) : moteur Chromium conservé, avec seulement le
    // viewport/densité/tactile de l'iPhone 13 repris pour rester fidèle à
    // l'esprit du test demandé (grille sans défilement horizontal, barre
    // d'actions atteignable, à une largeur et une interaction tactile
    // mobiles réelles) sans dépendre d'un moteur absent de la machine.
    {
      name: "mobile-chromium",
      testMatch: /schedule-calendar\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: devices["iPhone 13"].viewport, deviceScaleFactor: devices["iPhone 13"].deviceScaleFactor, isMobile: true, hasTouch: true },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60000,
  },
});
