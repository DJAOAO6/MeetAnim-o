// Logique de calcul d'âge partagée entre le sélecteur de date de naissance
// (composant client) et la persistance de la réservation publique (action
// serveur) : reste ici, sans "use client", pour être importable des deux côtés.

export type BirthDateValue = {
  date: string; // ISO YYYY-MM-DD, ou "" si non renseignée
  approximate: boolean;
};

function parseIso(iso: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
}

export function computeAgeLabel(value: BirthDateValue): string | null {
  if (!value.date) return null;
  const parsed = parseIso(value.date);
  if (!parsed) return null;
  const birth = new Date(parsed.year, parsed.month, parsed.day, 12);
  const now = new Date();

  if (value.approximate) {
    const years = now.getFullYear() - parsed.year;
    return years > 0 ? `~${years} an${years > 1 ? "s" : ""} (estimation)` : "Moins d’un an (estimation)";
  }

  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  if (now.getDate() < birth.getDate()) months -= 1;
  if (months < 0) { years -= 1; months += 12; }

  if (years <= 0 && months <= 0) return "Moins d’un mois";
  if (years === 0) return `${months} mois`;
  if (months === 0) return `${years} an${years > 1 ? "s" : ""}`;
  return `${years} an${years > 1 ? "s" : ""} et ${months} mois`;
}
