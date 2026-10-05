import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSex, sexLabel, sexOf, splitSex, validateAnimal } from "../src/lib/animal-validation";
import { animalAgeLabel } from "../src/lib/animal-age";

/**
 * Fiche animal (chantier C3, phase 1) : le serveur exige ce que l'interface
 * impose — nom, espèce, sexe —, et n'écrit que les champs prévus.
 */

const valid = { name: " Filou ", species: "Chien", breed: "", age: "", weight: "", sex: "Mâle", history: "", conditions: "", treatments: "", notes: "" };

test("création : nom, espèce de la liste et sexe obligatoires", () => {
  const ok = validateAnimal(valid);
  assert.ok(ok.ok);
  assert.equal(ok.ok && ok.data.name, "Filou");
  assert.deepEqual(validateAnimal({ ...valid, name: "  " }), { ok: false, errors: { name: "Indiquez le nom de l’animal." } });
  assert.deepEqual(validateAnimal({ ...valid, sex: "" }), { ok: false, errors: { sex: "Indiquez le sexe de l’animal." } });
  assert.deepEqual(validateAnimal({ ...valid, sex: "M" }), { ok: false, errors: { sex: "Choisissez Mâle ou Femelle." } });
  assert.deepEqual(validateAnimal({ ...valid, species: "Lapin" }), { ok: false, errors: { species: "Choisissez l’espèce dans la liste." } });
  for (const sex of ["Mâle", "Mâle castré", "Femelle", "Femelle stérilisée"]) assert.ok(validateAnimal({ ...valid, sex }).ok, sex);
});

test("modification : une ancienne espèce ou un ancien sexe restent acceptés s'ils ne changent pas", () => {
  const previous = { species: "Lapin", sex: "M" };
  assert.ok(validateAnimal({ ...valid, species: "Lapin", sex: "M" }, previous).ok);
  assert.ok(validateAnimal({ ...valid, species: "Lapin", sex: "" }, { species: "Lapin", sex: "" }).ok);
  // Mais on ne choisit pas une nouvelle valeur hors liste.
  assert.equal(validateAnimal({ ...valid, species: "Furet" }, previous).ok, false);
  assert.equal(validateAnimal({ ...valid, species: "Lapin", sex: "Mâle entier" }, previous).ok, false);
});

test("date de naissance : valide, pas dans le futur ; vide = inconnue", () => {
  assert.equal(validateAnimal({ ...valid, birthDate: "2020-02-30" }).ok, false);
  assert.equal(validateAnimal({ ...valid, birthDate: "2999-01-01" }).ok, false);
  assert.equal(validateAnimal({ ...valid, birthDate: "02/03/2020" }).ok, false);
  const ok = validateAnimal({ ...valid, birthDate: "2020-03-02" });
  assert.equal(ok.ok && ok.data.birthDate, "2020-03-02");
  const empty = validateAnimal({ ...valid, birthDate: "" });
  assert.equal(empty.ok && empty.data.birthDate, null);
  const absent = validateAnimal(valid);
  assert.equal(absent.ok && absent.data.birthDate, undefined, "absente : la date en base reste inchangée");
});

test("seuls les champs prévus passent : rien d'autre n'atteint la base", () => {
  const result = validateAnimal({ ...valid, avatar: "🦄", clientId: "autre-client", photo: "data:image/png;base64,AAAA", organizationId: "autre" });
  assert.ok(result.ok);
  const data = result.ok ? (result.data as Record<string, unknown>) : {};
  for (const key of ["avatar", "clientId", "photo", "organizationId"]) assert.equal(key in data, false, key);
});

test("le sexe saisi librement est ramené aux quatre valeurs quand c'est possible", () => {
  const cases: Array<[string, string | null]> = [
    ["M", "Mâle"], ["mâle", "Mâle"], ["Mâle entier", "Mâle"], ["Étalon", "Mâle"],
    ["mâle castré", "Mâle castré"], ["Hongre", "Mâle castré"],
    ["F", "Femelle"], ["Jument", "Femelle"], ["femelle non stérilisée", "Femelle"],
    ["Femelle stérilisée", "Femelle stérilisée"], ["", null], ["inconnu", null],
  ];
  for (const [input, expected] of cases) assert.equal(normalizeSex(input), expected, input);
  assert.equal(sexOf("Femelle", true), "Femelle stérilisée");
  assert.deepEqual(splitSex("Hongre"), { base: "Mâle", neutered: true });
  assert.equal(splitSex("inconnu"), null);
});

test("vocabulaire équin à l'affichage", () => {
  assert.equal(sexLabel("Cheval", "Mâle castré"), "Hongre");
  assert.equal(sexLabel("Cheval", "Femelle"), "Jument");
  assert.equal(sexLabel("Cheval", "Mâle"), "Étalon");
  assert.equal(sexLabel("Chien", "Mâle castré"), "Mâle castré");
});

test("l'âge affiché vient de la date de naissance quand elle existe, sinon du texte", () => {
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  assert.equal(animalAgeLabel({ age: "environ 8 ans", birthDate: twoYearsAgo.toISOString().slice(0, 10), birthDateApproximate: false }), "2 ans");
  assert.equal(animalAgeLabel({ age: "environ 8 ans", birthDate: null, birthDateApproximate: false }), "environ 8 ans");
  assert.match(animalAgeLabel({ age: "", birthDate: twoYearsAgo, birthDateApproximate: true }), /estimation/);
});
