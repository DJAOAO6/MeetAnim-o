import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { scopeArgs, scopeWhere, TENANT_MODELS } from "../src/lib/db-scope";

/**
 * Cloisonnement des requêtes : c'est la pièce dont dépend la promesse « un
 * professionnel ne voit que ses données ». Ces tests décrivent ce qui doit
 * arriver à une requête avant qu'elle parte vers la base.
 *
 * Le dernier test est le garde-fou du garde-fou : il relit le schéma Prisma
 * pour vérifier qu'aucune table cloisonnée n'a été ajoutée sans être
 * déclarée ici — sans quoi elle échapperait à la restriction en silence.
 */

const ORG = "org-cabinet-a";

test("une lecture sans condition est restreinte à l'espace", () => {
  assert.deepEqual(scopeArgs("Client", "findMany", {}, ORG), { where: { organizationId: ORG } });
});

test("une condition existante est conservée, et restreinte", () => {
  const args = scopeArgs("Client", "findMany", { where: { lastName: "Dupont" } }, ORG);
  assert.deepEqual(args, { where: { AND: [{ lastName: "Dupont" }, { organizationId: ORG }] } });
});

test("un OR reste enfermé dans le filtre d'espace", () => {
  // Le piège : ajouter organizationId à côté d'un OR au même niveau
  // élargirait la requête au lieu de la restreindre.
  const where = { OR: [{ city: "Rouen" }, { city: "Dieppe" }] };
  assert.deepEqual(scopeWhere(where, ORG), { AND: [where, { organizationId: ORG }] });
});

test("chercher par identifiant ne suffit plus : l'espace est vérifié aussi", () => {
  // Sans cela, connaître l'identifiant d'un rendez-vous suffirait à le lire
  // depuis un autre cabinet. Prisma n'accepte pas de AND dans une recherche
  // par clé unique : la condition s'ajoute au même niveau, ce qui est un
  // « et » de toute façon.
  const args = scopeArgs("Appointment", "findUnique", { where: { id: "rdv-1" } }, ORG);
  assert.deepEqual(args, { where: { id: "rdv-1", organizationId: ORG } });
});

test("une suppression ne peut pas atteindre la donnée d'un autre espace", () => {
  const args = scopeArgs("Client", "delete", { where: { id: "client-b" } }, ORG);
  assert.deepEqual(args, { where: { id: "client-b", organizationId: ORG } });
});

test("une création reçoit l'espace courant", () => {
  const args = scopeArgs("Client", "create", { data: { lastName: "Dupont" } }, ORG);
  assert.deepEqual(args, { data: { lastName: "Dupont", organizationId: ORG } });
});

test("une création en lot le reçoit sur chaque ligne", () => {
  const args = scopeArgs("Service", "createMany", { data: [{ name: "A" }, { name: "B" }] }, ORG);
  assert.deepEqual(args, { data: [{ name: "A", organizationId: ORG }, { name: "B", organizationId: ORG }] });
});

test("un upsert crée dans l'espace courant et n'y cherche que là", () => {
  const args = scopeArgs("Zone", "upsert", { where: { id: "z1" }, create: { name: "Rouen" }, update: { name: "Rouen" } }, ORG) as Record<string, unknown>;
  assert.deepEqual(args.where, { id: "z1", organizationId: ORG });
  assert.deepEqual(args.create, { name: "Rouen", organizationId: ORG });
  assert.deepEqual(args.update, { name: "Rouen" });
});

test("déplacer une donnée vers un autre espace est refusé", () => {
  // Toujours une erreur de programmation : un client ne change pas de
  // cabinet. Laisser passer mélangerait les données de deux professionnels.
  assert.throws(
    () => scopeArgs("Client", "update", { where: { id: "c1" }, data: { organizationId: "org-cabinet-b" } }, ORG),
    /interdit/,
  );
});

test("les tables qui n'appartiennent à aucun espace ne sont pas touchées", () => {
  // Une session suit son utilisateur ; la protection anti-force brute vaut
  // pour l'application entière, pas pour un cabinet.
  const args = { where: { id: "s1" } };
  assert.equal(scopeArgs("Session", "findUnique", args, ORG), args);
  assert.equal(scopeArgs("RateLimitEvent", "count", args, ORG), args);
});

test("toute table portant un espace obligatoire est déclarée comme cloisonnée", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const declared = new Set<string>();
  for (const block of schema.split(/(?=^model )/m)) {
    const name = /^model (\w+) \{/.exec(block)?.[1];
    if (!name) continue;
    // Colonne obligatoire (pas « String? ») : la ligne appartient forcément
    // à un espace, donc toute requête doit être restreinte.
    if (/^\s+organizationId\s+String\s/m.test(block)) declared.add(name);
  }

  assert.deepEqual(
    [...declared].sort(),
    [...TENANT_MODELS].sort(),
    "TENANT_MODELS doit lister exactement les tables dont la colonne organizationId est obligatoire",
  );
});
