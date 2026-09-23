#!/usr/bin/env node
/**
 * Lance les tests E2E contre la base de test dédiée, jamais contre celle de
 * développement.
 *
 * Le serveur de test est démarré par Playwright (webServer) avec l'adresse
 * de la base de test dans son environnement, sur son propre port (3100 par
 * défaut, voir tests/helpers/base-url.ts) : le serveur de développement
 * peut donc continuer de tourner sur le 3000 pendant les tests.
 *
 * Si quelque chose occupe déjà le port de test, Playwright le réutiliserait
 * sans savoir sur quelle base il est branché. D'où le refus dans ce cas.
 *
 * Usage, depuis le dossier du projet et depuis PowerShell :
 *   npm run test:e2e                         toute la suite
 *   npm run test:e2e -- tests/agenda-*.ts    une sélection
 */
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import net from "node:net";
import { parse } from "dotenv";

if (!existsSync(".env.test.local")) {
  console.error("\n✖ Fichier .env.test.local introuvable. Préparer d'abord la base : npm run test:db:setup\n");
  process.exit(1);
}
const testEnv = parse(readFileSync(".env.test.local"));

const port = Number(process.env.E2E_PORT ?? 3100);
const portBusy = await new Promise((resolve) => {
  const socket = net.connect({ port, host: "127.0.0.1" });
  socket.once("connect", () => { socket.destroy(); resolve(true); });
  socket.once("error", () => resolve(false));
});
if (portBusy) {
  console.error("\n✖ Un serveur tourne déjà sur le port 3000 — probablement branché sur la base de développement.\n  Arrêtez-le (npm run dev), puis relancez : les tests démarreront leur propre serveur sur la base de test.\n");
  process.exit(1);
}

const result = spawnSync("npx", ["playwright", "test", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, ...testEnv, E2E_TEST_DATABASE: "1" },
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
