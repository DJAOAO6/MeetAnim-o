"use client";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const labels: Record<Exclude<SaveState, "idle">, string> = {
  dirty: "Modifications non enregistrées",
  saving: "Enregistrement…",
  saved: "Modifications enregistrées",
  error: "Échec de l'enregistrement",
};

/**
 * État d'une personnalisation en cours. Le cas "error" existe pour une raison
 * précise : laisser croire qu'une disposition est enregistrée alors que la
 * requête a échoué ferait perdre son travail à l'utilisateur sans qu'il le
 * sache. aria-live pour que le changement soit annoncé aux lecteurs d'écran,
 * qui ne voient pas la pastille changer de couleur.
 */
export function SaveStatus({ state, className = "" }: { state: SaveState; className?: string }) {
  if (state === "idle") return null;

  const tone =
    state === "error" ? "bg-animeo-danger-soft text-animeo-error"
    : state === "saved" ? "bg-animeo-positive-soft text-animeo-positive"
    : "bg-animeo-soft text-animeo-dark";

  return (
    <p role="status" aria-live="polite" data-testid="save-status" className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-extrabold ${tone} ${className}`}>
      {state === "saving" ? <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-current" /> : null}
      {labels[state]}
    </p>
  );
}
