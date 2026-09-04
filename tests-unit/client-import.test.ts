import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeSpreadsheetBytes } from "../src/lib/import/decode-file";
import { detectDelimiter, parseDelimitedText } from "../src/lib/import/csv-parse";
import { guessMapping } from "../src/lib/import/fields";
import { normalizeSpecies, parseFrenchDate, normalizeEmail, phoneKey } from "../src/lib/import/normalize";
import { prepareRows } from "../src/lib/import/build-rows";

function utf8Bytes(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

function withUtf8Bom(bytes: ArrayBuffer): ArrayBuffer {
  const source = new Uint8Array(bytes);
  const withBom = new Uint8Array(source.length + 3);
  withBom.set([0xef, 0xbb, 0xbf], 0);
  withBom.set(source, 3);
  return withBom.buffer;
}

// --- decode-file.ts ---------------------------------------------------

test("decodeSpreadsheetBytes décode un fichier UTF-8 avec BOM", () => {
  const bytes = withUtf8Bom(utf8Bytes("Prénom;Nom\n"));
  assert.equal(decodeSpreadsheetBytes(bytes), "Prénom;Nom\n");
});

test("decodeSpreadsheetBytes se replie sur windows-1252 quand l'UTF-8 strict échoue", () => {
  // "Prénom" en windows-1252 : 'é' = 0xE9, octet isolé invalide en UTF-8 strict.
  const bytes = new Uint8Array([0x50, 0x72, 0xe9, 0x6e, 0x6f, 0x6d]).buffer;
  assert.equal(decodeSpreadsheetBytes(bytes), "Prénom");
});

// --- csv-parse.ts -------------------------------------------------------

test("detectDelimiter choisit ; quand il est majoritaire", () => {
  assert.equal(detectDelimiter("Nom;Prénom;Ville"), ";");
});

test("detectDelimiter choisit , quand il est majoritaire", () => {
  assert.equal(detectDelimiter("Nom,Prénom,Ville"), ",");
});

test("detectDelimiter ignore les délimiteurs à l'intérieur des guillemets", () => {
  assert.equal(detectDelimiter('"Nom;complet";Ville;Notes'), ";");
});

test("parseDelimitedText gère un champ entre guillemets contenant le séparateur", () => {
  const { headers, rows } = parseDelimitedText('Nom;Adresse\nDupont;"12 rue de la Paix; 3ème étage"\n');
  assert.deepEqual(headers, ["Nom", "Adresse"]);
  assert.deepEqual(rows, [["Dupont", "12 rue de la Paix; 3ème étage"]]);
});

test("parseDelimitedText gère un champ entre guillemets contenant un saut de ligne", () => {
  const { rows } = parseDelimitedText('Nom;Notes\nDupont;"Ligne 1\nLigne 2"\n');
  assert.deepEqual(rows, [["Dupont", "Ligne 1\nLigne 2"]]);
});

test("parseDelimitedText gère les guillemets échappés", () => {
  const { rows } = parseDelimitedText('Nom;Notes\nDupont;"Chien dit ""Rex"""\n');
  assert.deepEqual(rows, [["Dupont", 'Chien dit "Rex"']]);
});

test("parseDelimitedText ignore les lignes entièrement vides", () => {
  const { rows } = parseDelimitedText("Nom;Ville\nDupont;Rouen\n\nMartin;Le Havre\n");
  assert.deepEqual(rows, [
    ["Dupont", "Rouen"],
    ["Martin", "Le Havre"],
  ]);
});

test("parseDelimitedText complète les lignes plus courtes que l'en-tête", () => {
  const { rows } = parseDelimitedText("Nom;Ville;Notes\nDupont;Rouen\n");
  assert.deepEqual(rows, [["Dupont", "Rouen", ""]]);
});

test("parseDelimitedText gère \\r\\n", () => {
  const { headers, rows } = parseDelimitedText("Nom;Ville\r\nDupont;Rouen\r\n");
  assert.deepEqual(headers, ["Nom", "Ville"]);
  assert.deepEqual(rows, [["Dupont", "Rouen"]]);
});

// --- fields.ts ------------------------------------------------------------

test("guessMapping reconnaît des en-têtes avec accents et casse mélangés", () => {
  const mapping = guessMapping(["NOM", "Prénom", "E-Mail", "Téléphone", "Nom de l'animal", "Espèce"]);
  assert.deepEqual(mapping, {
    lastName: 0,
    firstName: 1,
    email: 2,
    phone: 3,
    animalName: 4,
    species: 5,
  });
});

test("guessMapping n'affecte jamais deux fois le même champ", () => {
  const mapping = guessMapping(["Nom", "Nom de famille", "Prénom"]);
  assert.equal(mapping.lastName, 0);
  assert.equal(mapping.firstName, 2);
});

// --- normalize.ts -----------------------------------------------------

test("normalizeSpecies reconnaît les 5 espèces et leurs variantes", () => {
  assert.equal(normalizeSpecies("Chien"), "Chien");
  assert.equal(normalizeSpecies("chienne"), "Chien");
  assert.equal(normalizeSpecies("Chat"), "Chat");
  assert.equal(normalizeSpecies("chatte"), "Chat");
  assert.equal(normalizeSpecies("Cheval"), "Cheval");
  assert.equal(normalizeSpecies("jument"), "Cheval");
  assert.equal(normalizeSpecies("Lapin"), "NAC");
  assert.equal(normalizeSpecies("cochon d'inde"), "NAC");
  assert.equal(normalizeSpecies("Chèvre"), "Petit ruminant");
  assert.equal(normalizeSpecies("mouton"), "Petit ruminant");
});

test("normalizeSpecies retourne null pour une espèce non reconnue", () => {
  assert.equal(normalizeSpecies("Poisson"), null);
  assert.equal(normalizeSpecies("Tortue"), null);
  assert.equal(normalizeSpecies(""), null);
});

test("parseFrenchDate accepte JJ/MM/AAAA", () => {
  assert.deepEqual(parseFrenchDate("15/03/2020"), { iso: "2020-03-15", approximate: false });
});

test("parseFrenchDate accepte JJ-MM-AAAA", () => {
  assert.deepEqual(parseFrenchDate("15-03-2020"), { iso: "2020-03-15", approximate: false });
});

test("parseFrenchDate accepte AAAA-MM-JJ", () => {
  assert.deepEqual(parseFrenchDate("2020-03-15"), { iso: "2020-03-15", approximate: false });
});

test("parseFrenchDate accepte JJ.MM.AAAA", () => {
  assert.deepEqual(parseFrenchDate("15.03.2020"), { iso: "2020-03-15", approximate: false });
});

test("parseFrenchDate accepte une année seule, marquée approximative", () => {
  assert.deepEqual(parseFrenchDate("2019"), { iso: "2019-01-01", approximate: true });
});

test("parseFrenchDate rejette une date future", () => {
  const futureYear = new Date().getFullYear() + 5;
  assert.equal(parseFrenchDate(`15/03/${futureYear}`), null);
});

test("parseFrenchDate rejette une date antérieure à 1980", () => {
  assert.equal(parseFrenchDate("15/03/1975"), null);
});

test("normalizeEmail vide un email invalide", () => {
  assert.equal(normalizeEmail("pas-un-email"), "");
  assert.equal(normalizeEmail("marie@exemple.fr"), "marie@exemple.fr");
});

test("phoneKey ramène l'indicatif +33 à un 0 initial", () => {
  assert.equal(phoneKey("+33 6 12 34 56 78"), "0612345678");
  assert.equal(phoneKey("06.12.34.56.78"), "0612345678");
});

// --- build-rows.ts ----------------------------------------------------

const MAPPING = {
  firstName: 0,
  lastName: 1,
  email: 2,
  phone: 3,
  city: 4,
  animalName: 5,
} as const;

test("prepareRows regroupe 3 lignes partageant la même identité en 1 client à 3 animaux", () => {
  const rows = [
    ["Marie", "Dupont", "marie@exemple.fr", "0612345678", "Rouen", "Luna"],
    ["Marie", "Dupont", "marie@exemple.fr", "0612345678", "Rouen", "Oscar"],
    ["Marie", "Dupont", "marie@exemple.fr", "0612345678", "Rouen", "Rex"],
  ];
  const { prepared, groups } = prepareRows(rows, MAPPING, { defaultSpecies: "Chien" });

  assert.equal(groups.length, 1);
  assert.equal(groups[0].animals.length, 3);
  assert.deepEqual(
    groups[0].animals.map((animal) => animal.name),
    ["Luna", "Oscar", "Rex"],
  );
  assert.equal(prepared.every((row) => row.groupIndex === 0), true);
});

test("prepareRows signale une erreur pour une ligne sans nom ni prénom", () => {
  const rows = [["", "", "", "", "", "Luna"]];
  const { prepared } = prepareRows(rows, MAPPING, { defaultSpecies: "Chien" });

  assert.equal(prepared.length, 1);
  assert.equal(
    prepared[0].issues.some((issue) => issue.level === "error"),
    true,
  );
});

test("prepareRows attribue le numéro de ligne avec l'en-tête compté comme ligne 1", () => {
  const rows = [
    ["Marie", "Dupont", "marie@exemple.fr", "0612345678", "Rouen", "Luna"],
    ["Thomas", "Martin", "thomas@exemple.fr", "0698765432", "Le Havre", "Oslo"],
  ];
  const { prepared } = prepareRows(rows, MAPPING, { defaultSpecies: "Chien" });
  assert.equal(prepared[0].lineNumber, 2);
  assert.equal(prepared[1].lineNumber, 3);
});

test("prepareRows signale un avertissement pour une ligne sans animal, sans bloquer l'import du client", () => {
  const rows = [["Marie", "Dupont", "marie@exemple.fr", "0612345678", "Rouen", ""]];
  const { prepared } = prepareRows(rows, MAPPING, { defaultSpecies: "Chien" });

  assert.equal(prepared[0].value.animal, null);
  assert.equal(
    prepared[0].issues.some((issue) => issue.level === "warning" && issue.message.includes("animal")),
    true,
  );
  assert.equal(
    prepared[0].issues.some((issue) => issue.level === "error"),
    false,
  );
});
