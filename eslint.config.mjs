import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Fichiers autorisés à utiliser le client Prisma non cloisonné.
 *
 * Ailleurs, le code métier passe par `currentDb()` / `readDb()`
 * (src/lib/organization.ts), qui restreignent d'office toute requête à
 * l'espace professionnel courant. Ces exceptions touchent ce qui
 * n'appartient à aucun cabinet — connexion, sessions, jetons, comptes,
 * journal d'audit, protection anti-force brute, connexions d'agenda — ou
 * s'exécutent sans session et reçoivent l'espace en argument.
 *
 * Avant d'ajouter un fichier ici : est-ce vraiment une donnée sans
 * propriétaire ? Si elle appartient à un cabinet, c'est `currentDb()`.
 */
const rawPrismaAllowed = [
  "src/lib/db.ts",
  "src/lib/organization.ts",
  "src/lib/db-barrier.ts",
  // Super-administration : la seule partie qui voit plusieurs cabinets,
  // derrière platformAccess() (double authentification obligatoire).
  "src/lib/platform/**",
  "src/lib/audit.ts",
  "src/lib/rate-limit.ts",
  "src/lib/auth/**",
  "src/lib/admin/**",
  "src/lib/calendar.ts",
  "src/lib/calendar-actions.ts",
  "src/lib/calendar/**",
  "src/lib/dashboard-layout-actions.ts",
  // Préférences d'affichage de l'agenda : une donnée du compte, pas de l'espace.
  "src/lib/agenda-preferences-actions.ts",
  "src/lib/scheduler/jobs.ts",
  "src/app/api/calendar/**",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    ignores: rawPrismaAllowed,
    rules: {
      "no-restricted-imports": ["error", {
        paths: [{
          name: "@/lib/db",
          importNames: ["prisma"],
          message: "Utilisez currentDb() ou readDb() (src/lib/organization.ts) : le client cloisonné restreint chaque requête à l'espace professionnel courant.",
        }],
      }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Compilation du serveur de test (NEXT_DIST_DIR, voir next.config.ts).
    ".next-e2e/**",
  ]),
]);

export default eslintConfig;
