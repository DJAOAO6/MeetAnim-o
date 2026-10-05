/**
 * Recherche tolérante (chantier C5) : accents oubliés, fautes de frappe,
 * mots dans le désordre. Fonctions pures, sans moteur externe ni extension
 * Postgres : à l'échelle d'un cabinet (quelques milliers de fiches au plus),
 * classer en JavaScript répond instantanément.
 *
 * « helene » trouve « Hélène », « dupon » trouve « Dupont », « mirza »
 * trouve « Mirsa », « 06 12 » trouve « 06 12 34 56 78 ».
 */

/** Minuscules, sans accents ni ligatures ; tirets et apostrophes deviennent des espaces. */
export function normalizeForSearch(text: string | null | undefined): string {
  return (text ?? "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[-‐‑‒–—'’ʼ`´]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Les chiffres d'un numéro, au format national : « +33 6 12… » se compare à « 06 12… ». */
export function phoneDigits(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.startsWith("33") && digits.length === 11 ? `0${digits.slice(2)}` : digits;
}

// Trois lignes réutilisées d'un appel à l'autre : la recherche compare des
// milliers de mots à chaque frappe, sans allouer de tableau à chaque fois.
let previous2: number[] = [];
let previous: number[] = [];
let current: number[] = [];

/**
 * Distance de Damerau-Levenshtein restreinte (transpositions adjacentes),
 * sur les `bLength` premiers caractères de `b` ; arrêtée dès qu'elle dépasse
 * `max`.
 */
export function editDistance(a: string, b: string, max: number, bLength = b.length): number {
  if (Math.abs(a.length - bLength) > max) return max + 1;
  for (let j = 0; j <= bLength; j += 1) previous[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    let rowMin = i;
    for (let j = 1; j <= bLength; j += 1) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      let value = previous[j] + 1;
      if (current[j - 1] + 1 < value) value = current[j - 1] + 1;
      if (previous[j - 1] + cost < value) value = previous[j - 1] + cost;
      if (i > 1 && j > 1 && a.charCodeAt(i - 1) === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === b.charCodeAt(j - 1) && previous2[j - 2] + 1 < value) value = previous2[j - 2] + 1;
      current[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
    const recycled = previous2;
    previous2 = previous;
    previous = current;
    current = recycled;
  }
  return previous[bLength];
}

/**
 * Fautes tolérées selon la longueur du mot tapé : aucune sous 4 lettres, 1
 * jusqu'à 6, 2 au-delà. Aucune sur un nombre : un chiffre faux, c'est le
 * numéro de quelqu'un d'autre.
 */
function allowedTypos(word: string): number {
  if (word.length < 4 || /^\d+$/.test(word)) return 0;
  return word.length <= 6 ? 1 : 2;
}

/** Le meilleur score d'un mot tapé contre un mot de la fiche. */
function wordScore(query: string, candidate: string): number {
  if (!candidate) return 0;
  if (candidate === query) return 1;
  if (candidate.startsWith(query)) return 0.9;
  // L'inclusion à partir de 3 caractères : « an » dans « Jean » ramènerait tout le monde.
  if (query.length >= 3 && candidate.includes(query)) return 0.75;
  const typos = allowedTypos(query);
  if (typos === 0) return 0;
  // Le mot entier, ou son début pendant la frappe (« mirz » → « mirsa »).
  let distance = editDistance(query, candidate, typos);
  if (distance > 1 && candidate.length > query.length) distance = Math.min(distance, editDistance(query, candidate, typos, query.length));
  if (distance > typos) return 0;
  return distance === 1 ? 0.6 : 0.5;
}

/** Les mots d'une requête ; une requête toute en chiffres (« 06 12 34 ») est un seul numéro. */
export function queryWords(query: string): string[] {
  const words = normalizeForSearch(query).split(" ").filter(Boolean);
  if (words.length > 1 && words.every((word) => /^\d+$/.test(word))) return [words.join("")];
  return words;
}

/** Les mots d'une fiche, à partir de ses champs (texte libre, ou numéro de téléphone). */
export function candidateWords(fields: Array<string | null | undefined>, phones: Array<string | null | undefined> = []): string[] {
  return [
    ...fields.flatMap((field) => normalizeForSearch(field).split(" ").filter(Boolean)),
    ...phones.map(phoneDigits).filter(Boolean),
  ];
}

/**
 * Score d'une fiche pour une requête, entre 0 et 1 : pour chaque mot tapé,
 * son meilleur score sur les mots de la fiche (égalité 1, début 0,9,
 * inclusion 0,75, une faute 0,6, deux fautes 0,5), puis la moyenne. Un seul
 * mot tapé sans correspondance, et la fiche n'est pas retenue (0).
 */
export function scoreMatch(query: string | string[], words: string[]): number {
  const wordsOfQuery = typeof query === "string" ? queryWords(query) : query;
  if (wordsOfQuery.length === 0) return 0;
  let total = 0;
  for (const word of wordsOfQuery) {
    let best = 0;
    for (const candidate of words) {
      best = Math.max(best, wordScore(word, candidate));
      if (best === 1) break;
    }
    if (best === 0) return 0;
    total += best;
  }
  return total / wordsOfQuery.length;
}

/** En dessous : « Vous cherchiez peut-être ». */
export const APPROXIMATE_BELOW = 0.75;

export const MIN_QUERY_LENGTH = 2;

export type SearchablePerson = {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  city?: string | null;
  animals: Array<{ id: string; name: string }>;
};

export type ScoredClient<C> = { client: C; score: number };
export type ScoredAnimal<C extends SearchablePerson> = { animal: C["animals"][number]; client: C; score: number };

export type PeopleSearch<C extends SearchablePerson> = {
  clients: ScoredClient<C>[];
  animals: ScoredAnimal<C>[];
  /** Résultats approchants (fautes), à proposer à part. */
  approximate: { clients: ScoredClient<C>[]; animals: ScoredAnimal<C>[] };
};

function byScoreThenName<C extends SearchablePerson>(a: { score: number; client: C; label?: string }, b: { score: number; client: C; label?: string }): number {
  return b.score - a.score
    || (a.label ?? "").localeCompare(b.label ?? "", "fr")
    || `${a.client.lastName} ${a.client.firstName}`.localeCompare(`${b.client.lastName} ${b.client.firstName}`, "fr");
}

/**
 * Clients et animaux qui correspondent à une requête, chacun en deux
 * groupes : correspondances franches (égalité, début, inclusion), et
 * approchantes (score sous 0,75). Un client se cherche par prénom, nom,
 * téléphone et ville ; un animal par son nom, éventuellement complété du nom
 * de son propriétaire (« mirsa dupont ») — mais son propre nom doit
 * correspondre, sinon chercher « Dupont » listerait tous ses animaux.
 */
type IndexedPerson = { ownerWords: string[]; clientWords: string[]; animalWords: string[][] };

// Mots normalisés de chaque fiche, calculés une fois : les fiches du tableau
// de bord restent les mêmes objets d'une frappe à l'autre.
const index = new WeakMap<SearchablePerson, IndexedPerson>();

function indexed(person: SearchablePerson): IndexedPerson {
  let entry = index.get(person);
  if (!entry) {
    const ownerWords = candidateWords([person.firstName, person.lastName]);
    entry = {
      ownerWords,
      clientWords: [...ownerWords, ...candidateWords([person.city], [person.phone])],
      animalWords: person.animals.map((animal) => candidateWords([animal.name])),
    };
    index.set(person, entry);
  }
  return entry;
}

export function searchPeople<C extends SearchablePerson>(query: string, people: C[], options: { limit?: number } = {}): PeopleSearch<C> {
  const empty: PeopleSearch<C> = { clients: [], animals: [], approximate: { clients: [], animals: [] } };
  if (normalizeForSearch(query).replace(/\s/g, "").length < MIN_QUERY_LENGTH) return empty;
  const words = queryWords(query);
  const limit = options.limit ?? Infinity;

  const clients: ScoredClient<C>[] = [];
  const animals: ScoredAnimal<C>[] = [];
  for (const client of people) {
    const { ownerWords, clientWords, animalWords } = indexed(client);
    const score = scoreMatch(words, clientWords);
    if (score > 0) clients.push({ client, score });
    client.animals.forEach((animal, position) => {
      const nameWords = animalWords[position] ?? candidateWords([animal.name]);
      if (!words.some((word) => nameWords.some((candidate) => wordScore(word, candidate) > 0))) return;
      const animalScore = scoreMatch(words, [...nameWords, ...ownerWords]);
      if (animalScore > 0) animals.push({ animal, client, score: animalScore });
    });
  }

  clients.sort(byScoreThenName);
  animals.sort((a, b) => byScoreThenName({ ...a, label: a.animal.name }, { ...b, label: b.animal.name }));
  const firm = <T extends { score: number }>(list: T[]) => list.filter((entry) => entry.score >= APPROXIMATE_BELOW).slice(0, limit);
  const near = <T extends { score: number }>(list: T[]) => list.filter((entry) => entry.score < APPROXIMATE_BELOW).slice(0, limit);
  return { clients: firm(clients), animals: firm(animals), approximate: { clients: near(clients), animals: near(animals) } };
}
