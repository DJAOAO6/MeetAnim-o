const dateFormatter = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const currencyFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

export function formatFrenchDate(date: Date): string {
  return dateFormatter.format(date);
}

export function formatEuros(amount: number): string {
  return `${currencyFormatter.format(amount)} €`;
}

export function initialsFor(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

/** Plafonne l'affichage du badge de notifications au-delà de 99 (PROMPT-NOTIFICATIONS.md §B2). */
export function formatNotificationBadge(count: number): string {
  return count > 99 ? "99+" : String(count);
}
