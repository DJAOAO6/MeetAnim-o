import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Prisma } from "../src/generated/prisma/browser";
import { JOIN_TABLES, ORGANIZATION_TABLES, OTHER_TABLES, USER_TABLES } from "../src/lib/deletion-plan";

/**
 * Couverture de la purge d'un espace (chantier C9, phase 4).
 *
 * Doit échouer bruyamment le jour où quelqu'un ajoute une table sans dire ce
 * que devient son contenu à l'effacement d'un espace : chaque modèle du
 * schéma est soit purgé par purgeOrganization, soit classé ici, avec la
 * raison écrite, comme n'étant pas une donnée d'espace.
 */
const NOT_TENANT_DATA: Record<string, string> = {
  DeletionRecord: "Preuve de l'effacement, sans donnée personnelle (empreintes, dates, nombres) : elle doit survivre à la purge.",
};

const models = Object.keys(Prisma.ModelName).sort();
const purged = [...ORGANIZATION_TABLES, ...USER_TABLES, ...OTHER_TABLES] as string[];
const purgeSource = readFileSync(new URL("../src/lib/platform/organization-deletion.ts", import.meta.url), "utf8");
const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");

test("chaque modèle du schéma est purgé, ou classé hors espace avec sa raison", () => {
  const unclassified = models.filter((model) => !purged.includes(model) && !(model in NOT_TENANT_DATA));
  assert.deepEqual(unclassified, [], `Modèle(s) à classer : purgé par purgeOrganization (deletion-plan.ts) ou NOT_TENANT_DATA avec une raison — ${unclassified.join(", ")}`);
  for (const [model, reason] of Object.entries(NOT_TENANT_DATA)) {
    assert.ok(models.includes(model), `${model} n'existe plus : retirez-le de NOT_TENANT_DATA`);
    assert.ok(reason.length > 20, `${model} : la raison doit être écrite`);
    assert.ok(!purged.includes(model), `${model} est à la fois purgé et exclu`);
  }
});

test("chaque table du plan existe dans le schéma, et purgeOrganization la supprime réellement", () => {
  for (const table of purged) {
    assert.ok(models.includes(table), `${table} n'est plus un modèle : mettez deletion-plan.ts à jour`);
    assert.match(purgeSource, new RegExp(`counts\\.${table} = `), `purgeOrganization ne supprime pas ${table}`);
  }
  for (const table of JOIN_TABLES) {
    assert.match(purgeSource, new RegExp(`counts\\.${table} = `), `purgeOrganization ne vide pas ${table}`);
  }
});

test("toute table qui porte un organizationId est purgée par cette colonne", () => {
  const withOrganization = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)]
    .filter(([, , body]) => /^\s+organizationId\s/m.test(body))
    .map(([, name]) => name);
  const handledOtherwise = ["User", "AuditLog", "Invitation"];
  for (const model of withOrganization) {
    assert.ok(ORGANIZATION_TABLES.includes(model as (typeof ORGANIZATION_TABLES)[number]) || handledOtherwise.includes(model), `${model} a un organizationId mais n'est pas dans ORGANIZATION_TABLES`);
  }
});

test("le schéma et le client généré listent les mêmes modèles", () => {
  const fromSchema = [...schema.matchAll(/^model (\w+) \{/gm)].map(([, name]) => name).sort();
  assert.deepEqual(fromSchema, models, "client Prisma à régénérer (npx prisma generate)");
});
