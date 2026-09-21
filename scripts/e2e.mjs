#!/usr/bin/env node
/**
 * Lance les tests E2E contre la base de test dédiée, jamais contre celle de
 * développement.
 *
 * Le serveur de test est démarré par Playwright (webServer) avec l'adresse
 * de la base de test dans son environnement. Si un serveur de développement
 * tourne déjà sur le port 3000, Playwright le réutiliserait — branché sur la
 * base de développement. D'où le refus tant que le port est occupé.
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

const portBusy = await new Promise((resolve) => {
  const socket = net.connect({ port: 3000, host: "127.0.0.1" });
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
