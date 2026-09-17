#!/usr/bin/env node
/**
 * Déploiement sur Iridflow, en une commande.
 *
 * Iridflow ne déploie pas depuis GitHub : il surveille un dépôt Gitea qui lui
 * est propre, et redéploie le site à chaque poussée sur sa branche `main`.
 * Ce script pousse donc le travail de `master` vers ce dépôt, et le webhook
 * fait le reste.
 *
 * Il remplace la méthode précédente — pousser les fichiers un par un via
 * l'outil MCP `push_files`, avec les images découpées en morceaux base64 —
 * qui demandait une centaine d'appels pour un lot de cette taille et laissait
 * le dépôt Gitea diverger du dépôt local (lockfile factice, `npm install` au
 * lieu de `npm ci`, logos reconstitués au build).
 *
 * Usage :
 *   npm run deploy              vérifie puis pousse
 *   npm run deploy -- --dry-run montre ce qui partirait, sans rien envoyer
 *   npm run deploy -- --skip-checks  saute la vérification TypeScript
 */
import { execFileSync } from "node:child_process";

const REMOTE = "gitea";
/** Branche locale de travail → branche surveillée par l'auto-déploiement. */
const LOCAL_BRANCH = "master";
const REMOTE_BRANCH = "main";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const skipChecks = args.has("--skip-checks");

function git(...parameters) {
  return execFileSync("git", parameters, { encoding: "utf8" }).trim();
}

function fail(message, hint) {
  console.error(`\n✖ ${message}`);
  if (hint) console.error(`\n${hint}\n`);
  process.exit(1);
}

/* ------------------------------------------------------------------ garde-fous */

// Le dépôt Gitea n'est pas public : son adresse et son jeton sont propres à
// l'installation, ils ne peuvent donc pas être écrits ici.
const remotes = git("remote").split("\n");
if (!remotes.includes(REMOTE)) {
  fail(
    `Le dépôt distant « ${REMOTE} » n’est pas configuré.`,
    [
      "À faire une fois, avec un jeton Gitea (Paramètres → Applications →",
      "Générer un jeton, portée write:repository) :",
      "",
      `  git remote add ${REMOTE} https://<utilisateur>:<jeton>@<hôte-gitea>/rdv/animeo-app.git`,
      "",
      "Le jeton est alors stocké dans .git/config, qui n’est pas versionné.",
    ].join("\n"),
  );
}

// Déployer un état non commité est le meilleur moyen d’obtenir en ligne
// quelque chose qu’on ne saura pas reproduire ensuite.
const dirty = git("status", "--porcelain")
  .split("\n")
  .filter((line) => line && !line.startsWith("?? "));
if (dirty.length > 0) {
  fail(
    "Des modifications ne sont pas commitées.",
    `Commitez-les d’abord :\n\n${dirty.map((line) => `  ${line}`).join("\n")}`,
  );
}

const branch = git("rev-parse", "--abbrev-ref", "HEAD");
if (branch !== LOCAL_BRANCH) {
  fail(`Vous êtes sur « ${branch} », pas sur « ${LOCAL_BRANCH} ».`, "Le déploiement part toujours de la branche principale.");
}

// GitHub reste la référence : ce qui est en ligne doit toujours être
// retrouvable là-bas, pas seulement dans le miroir de l’hébergeur.
git("fetch", "origin", LOCAL_BRANCH, "--quiet");
const aheadOfGitHub = git("rev-list", "--count", `origin/${LOCAL_BRANCH}..HEAD`);
if (aheadOfGitHub !== "0") {
  fail(
    `${aheadOfGitHub} commit(s) ne sont pas encore sur GitHub.`,
    "Poussez d’abord vers GitHub :\n\n  git push origin master",
  );
}

/* ------------------------------------------------------------------- aperçu */

let alreadyDeployed = null;
try {
  git("fetch", REMOTE, REMOTE_BRANCH, "--quiet");
  alreadyDeployed = git("rev-parse", `${REMOTE}/${REMOTE_BRANCH}`);
} catch {
  console.log("ℹ Première poussée vers Gitea (ou dépôt distant injoignable) — aperçu limité.\n");
}

if (alreadyDeployed) {
  const range = `${alreadyDeployed}..HEAD`;
  const commits = git("log", "--oneline", range);
  if (!commits) {
    console.log("✔ Rien à déployer : Iridflow est déjà à jour.");
    process.exit(0);
  }
  const files = git("diff", "--name-only", range).split("\n").filter(Boolean);
  console.log(`À déployer — ${commits.split("\n").length} commit(s), ${files.length} fichier(s) :\n`);
  console.log(commits.split("\n").map((line) => `  ${line}`).join("\n"));
  console.log("");
}

/* ------------------------------------------------------------- vérifications */

if (!skipChecks) {
  console.log("Vérification TypeScript…");
  try {
    execFileSync("npx", ["tsc", "--noEmit"], { stdio: "inherit", shell: process.platform === "win32" });
  } catch {
    fail(
      "TypeScript échoue : le build du conteneur échouerait aussi.",
      "Corrigez, ou forcez avec --skip-checks si vous savez ce que vous faites.",
    );
  }
  console.log("✔ TypeScript propre.\n");
}

/* ------------------------------------------------------------------- poussée */

if (dryRun) {
  console.log(`(--dry-run) Aucune poussée. La commande réelle serait :\n\n  git push ${REMOTE} ${LOCAL_BRANCH}:${REMOTE_BRANCH}\n`);
  process.exit(0);
}

console.log(`Poussée vers ${REMOTE}/${REMOTE_BRANCH}…`);
execFileSync("git", ["push", REMOTE, `${LOCAL_BRANCH}:${REMOTE_BRANCH}`], { stdio: "inherit" });

console.log(
  [
    "",
    "✔ Poussé. L’auto-déploiement d’Iridflow prend le relais.",
    "",
    "  • Le build dure quelques minutes ; le site répond à l’ancienne version en attendant.",
    "  • Ne lancez pas un déploiement manuel dans la foulée : il entre en collision",
    "    avec le webhook (« container name already in use »).",
    "  • Vérification : https://app.1002pattes.fr",
  ].join("\n"),
);
