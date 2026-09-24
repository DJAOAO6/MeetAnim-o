"use client";

import { Ban, CalendarOff, CalendarPlus, Unlock } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { formatDuration, formatMinutes, type SlotSelection } from "@/lib/agenda-selection";
import type { SlotAction } from "@/components/agenda/slot-action-menu";

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });

/**
 * Version tactile du menu de créneau.
 *
 * Au doigt, il n'y a pas de glissement de sélection : un appui choisit
 * l'heure, et la durée se choisit ici, au pouce. C'est le parti pris du §20 —
 * le défilement vertical de l'agenda reste prioritaire, et rien ne doit
 * pouvoir déplacer un horaire pendant qu'on fait simplement défiler.
 *
 * Feuille ancrée en bas (comportement par défaut de Modal sur petit écran) :
 * les actions tombent sous le pouce, pas en haut de l'écran.
 */
export function SlotActionSheet({ selection, date, closed, durations, canClose = true, onSelectDuration, onAction, onClose }: {
  selection: SlotSelection;
  date: Date;
  closed: boolean;
  /** Durées réellement possibles ici, bornées par le rendez-vous suivant. */
  durations: number[];
  /** Le compte peut-il fermer un créneau (modifier les horaires) ? */
  canClose?: boolean;
  onSelectDuration: (minutes: number) => void;
  onAction: (action: SlotAction) => void;
  onClose: () => void;
}) {
  const duration = selection.endMinutes - selection.startMinutes;

  return (
    <Modal
      title="Nouveau créneau"
      description={`${capitalize(dateFormatter.format(date))} · ${formatMinutes(selection.startMinutes)}`}
      onClose={onClose}
      size="sm"
    >
      <div className="grid gap-5">
        <div>
          <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.11em] text-animeo-muted">Durée</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Durée du créneau">
            {durations.map((option) => {
              const selected = option === duration;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelectDuration(option)}
                  className={`min-h-11 rounded-xl border px-4 text-sm font-extrabold transition ${
                    selected ? "border-animeo bg-animeo-soft text-animeo-dark" : "border-animeo-border bg-animeo-bg text-animeo-muted"
                  }`}
                >
                  {formatDuration(option)}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-animeo-muted">
            {formatMinutes(selection.startMinutes)} → {formatMinutes(selection.endMinutes)}
          </p>
        </div>

        {closed ? (
          <p className="rounded-xl bg-animeo-border-soft px-3.5 py-2.5 text-xs font-bold text-animeo-muted">
            Cette période est fermée aux réservations.
          </p>
        ) : null}

        <div className="grid gap-2 border-t border-animeo-border-soft pt-4">
          {closed ? (
            <>
              <SheetAction icon={Unlock} label="Ouvrir exceptionnellement" onClick={() => onAction("openExceptionally")} />
              <SheetAction icon={CalendarPlus} label="Ajouter un rendez-vous" primary onClick={() => onAction("create")} />
            </>
          ) : (
            <>
              <SheetAction icon={CalendarPlus} label="Nouveau rendez-vous" primary onClick={() => onAction("create")} />
              <SheetAction icon={Ban} label="Bloquer le créneau" onClick={() => onAction("block")} />
              <SheetAction icon={CalendarOff} label="Indisponible / Fermé" disabledReason={canClose ? undefined : "Réservé aux comptes autorisés à modifier les horaires."} onClick={() => onAction("unavailable")} />
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

function SheetAction({ icon: ActionIcon, label, primary = false, disabledReason, onClick }: {
  icon: typeof CalendarPlus;
  label: string;
  primary?: boolean;
  /** Action indisponible pour ce compte : visible, grisée, et elle dit pourquoi. */
  disabledReason?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={disabledReason ? undefined : onClick}
      aria-disabled={disabledReason ? true : undefined}
      className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-4 py-2 text-left text-sm font-extrabold transition ${
        disabledReason ? "cursor-not-allowed bg-animeo-bg text-animeo-muted opacity-60" : primary ? "bg-animeo text-white" : "bg-animeo-bg text-animeo-dark hover:bg-animeo-soft"
      }`}
    >
      <ActionIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span className="min-w-0">
        {label}
        {disabledReason ? <span className="block text-xs font-semibold">{disabledReason}</span> : null}
      </span>
    </button>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toLocaleUpperCase("fr-FR") + value.slice(1);
}
