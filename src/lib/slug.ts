/**
 * Lien public d'un cabinet : `/reserver/<lien>`.
 *
 * Il se lit, se dicte et se recopie : lettres minuscules sans accent,
 * chiffres, tirets. C'est aussi lui qui désigne le cabinet pour la page de
 * réservation (voir `dbForSlug`) — d'où une forme stricte, vérifiée côté
 * serveur et pas seulement dans le formulaire.
 */

export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 60;

/** « Élodie Martin — Ostéo » → « elodie-martin-osteo ». */
export function toSlug(value: string): string {
  return value
    .toLocaleLowerCase("fr-FR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, "");
}

/** `null` si le lien est acceptable, sinon la raison, à afficher telle quelle. */
export function slugProblem(slug: string): string | null {
  if (slug.length < SLUG_MIN_LENGTH) return `Le lien doit compter au moins ${SLUG_MIN_LENGTH} caractères.`;
  if (slug.length > SLUG_MAX_LENGTH) return `Le lien ne peut pas dépasser ${SLUG_MAX_LENGTH} caractères.`;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return "Le lien ne peut contenir que des lettres minuscules sans accent, des chiffres et des tirets.";
  return null;
}

/**
 * Premier lien libre à partir d'une base : « elodie-martin », puis
 * « elodie-martin-2 », « elodie-martin-3 »… `isTaken` dit si un lien est
 * déjà pris.
 */
export async function firstFreeSlug(base: string, isTaken: (slug: string) => Promise<boolean>): Promise<string> {
  const root = toSlug(base).slice(0, SLUG_MAX_LENGTH - 4).replace(/-+$/g, "") || "cabinet";
  const start = root.length >= SLUG_MIN_LENGTH ? root : `cabinet-${root}`;
  if (!(await isTaken(start))) return start;
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${start}-${suffix}`;
    if (!(await isTaken(candidate))) return candidate;
  }
  throw new Error("Aucun lien libre trouvé.");
}
