import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import type { Animal } from "@/data/clients";

type AnimalSideCardsProps = {
  animal: Animal;
  onScheduleReminder: () => void;
  /** Faux sans le module Rappels clients (src/lib/modules.ts). */
  showReminder?: boolean;
};

/**
 * Le rappel de l'animal, à côté de sa fiche.
 *
 * Une carte « Documents » s'y trouvait aussi (audit 2026-10, FONC-01) : une
 * liste et trois boutons qui ne faisaient rien (« sera ajouté ici »). Les
 * vrais comptes rendus de l'animal ont déjà leur section dans la fiche
 * (DocumentsHistory, animal-record.tsx) : la carte est retirée plutôt que
 * de répéter la même liste.
 */
export function AnimalSideCards({ animal, onScheduleReminder, showReminder = true }: AnimalSideCardsProps) {
  if (!showReminder) return null;
  return (
    <aside className="grid gap-6 2xl:sticky 2xl:top-6" aria-label={`Rappel de ${animal.name}`}>
      <ReminderCard animal={animal} onScheduleReminder={onScheduleReminder} />
    </aside>
  );
}

function ReminderCard({ animal, onScheduleReminder }: { animal: Animal; onScheduleReminder: () => void }) {
  return (
    <Card className="overflow-hidden sm:self-start">
      <div className="bg-animeo-warning-soft p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-animeo-warning">Prochain rappel</p>
            <h2 className="mt-2 text-xl font-black text-animeo-dark">{animal.reminder.label}</h2>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-animeo-warning">
            <Icon name="bell" className="h-5 w-5" />
          </div>
        </div>
        <p className="mt-3 text-sm font-bold text-animeo-muted">Prévu le {animal.reminder.date}</p>
        <p className="mt-2 text-xs leading-relaxed text-animeo-muted">Ce rappel est associé uniquement à {animal.name}, pas à toute la fiche propriétaire.</p>
      </div>
      <div className="p-4">
        <Button type="button" variant="secondary" onClick={onScheduleReminder} className="w-full">
          Programmer un rappel
        </Button>
      </div>
    </Card>
  );
}
