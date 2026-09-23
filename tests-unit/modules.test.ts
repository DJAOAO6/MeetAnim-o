import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { hasModule, isModuleKey, MODULE_KEYS, normalizeModules } from "../src/lib/modules";

test("seuls les modules connus sont retenus, dans l'ordre de référence", () => {
  assert.deepEqual(normalizeModules(["STATISTICS", "INCONNU", "TOURS", "TOURS"]), ["TOURS", "STATISTICS"]);
  assert.equal(isModuleKey("TEAM"), true);
  assert.equal(isModuleKey("ADMIN"), false);
});

test("sans liste, aucun module", () => {
  assert.equal(hasModule(null, "TOURS"), false);
  assert.equal(hasModule([], "TOURS"), false);
  assert.equal(hasModule(["TOURS"], "TOURS"), true);
});

test("la migration ouvre aux espaces existants exactement les modules connus", () => {
  // Un module ajouté ici sans être accordé aux espaces existants leur
  // retirerait silencieusement une fonction dont ils se servent.
  const migration = readFileSync("prisma/migrations/20260924110000_organization_modules/migration.sql", "utf8");
  for (const key of MODULE_KEYS) assert.match(migration, new RegExp(`'${key}'`), `${key} accordé aux espaces existants`);
});
