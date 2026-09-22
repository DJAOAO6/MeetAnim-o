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
    // Connexion jouée une fois pour toutes (tests/auth.setup.ts) : les specs
    // qui en dépendent repartent d'une session déjà ouverte, sans consommer
    // le quota de connexions du serveur.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      // Les specs à session partagée ont leur propre projet ci-dessous.
      testIgnore: /(auth\.setup|dashboard-layout|accessibility-dashboard|responsive-mobile|agenda-touch-drag|public-page-editor|responsive-widths|notifications-toasts|business-profile-geocoding|availability-manager|sidebar-layout|sidebar-behaviour|dashboard-overview|appointment-modal|agenda-slot-selection|paw-cursor|notifications-bell|public-profile-settings|agenda-slot-touch|practice-mode-dashboard|organization-isolation|organization-isolation-actions|organization-rls)\.(spec\.)?ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium-connecte",
      testMatch: /(dashboard-layout|accessibility-dashboard|public-page-editor|responsive-widths|notifications-toasts|business-profile-geocoding|availability-manager|sidebar-layout|sidebar-behaviour|dashboard-overview|appointment-modal|agenda-slot-selection|paw-cursor|notifications-bell|public-profile-settings|practice-mode-dashboard|organization-isolation|organization-isolation-actions|organization-rls)\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: "tests/.auth/practitioner.json" },
    },
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
      // Parcours public (réservation) : joué en visiteur, sans session — y
      // poser un storageState connecté changerait le parcours testé.
      testMatch: /(schedule-calendar|tour-suggestions)\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: devices["iPhone 13"].viewport, deviceScaleFactor: devices["iPhone 13"].deviceScaleFactor, isMobile: true, hasTouch: true },
    },
    {
      name: "mobile-chromium-connecte",
      testMatch: /(agenda-touch-drag|agenda-slot-touch|responsive-mobile)\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], viewport: devices["iPhone 13"].viewport, deviceScaleFactor: devices["iPhone 13"].deviceScaleFactor, isMobile: true, hasTouch: true, storageState: "tests/.auth/practitioner.json" },
    },
  ],
  webServer: {
    // En local, le serveur de développement : les tests suivent le code en
    // cours. En intégration continue, un vrai build déjà compilé (voir
    // .github/workflows/ci.yml) — sinon chaque page serait compilée à la
    // première visite, et les délais des tests mesureraient la compilation.
    command: process.env.E2E_WEB_SERVER ?? "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120000,
  },
});
