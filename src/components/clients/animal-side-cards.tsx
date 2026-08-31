import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import type { Animal } from "@/data/clients";

type AnimalSideCardsProps = {
  animal: Animal;
  onAction: (message: string) => void;
  onScheduleReminder: () => void;
};

export function AnimalSideCards({ animal, onAction, onScheduleReminder }: AnimalSideCardsProps) {
  return (
    <aside className="grid gap-6 sm:grid-cols-2 2xl:sticky 2xl:top-6 2xl:grid-cols-1" aria-label={`Documents et rappel de ${animal.name}`}>
      <DocumentsCard animal={animal} onAction={onAction} />
      <ReminderCard animal={animal} onScheduleReminder={onScheduleReminder} />
    </aside>
  );
}

function DocumentsCard({ animal, onAction }: { animal: Animal; onAction: (message: string) => void }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-animeo">Documents</p>
          <h2 className="mt-1 font-extrabold text-animeo-dark">Dossier de {animal.name}</h2>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-animeo-soft text-animeo-dark">
          <DocumentIcon />
        </div>
      </div>

      {animal.documents.length > 0 ? (
        <div className="mt-4 space-y-2">
          {animal.documents.map((document) => (
            <button
              key={document.id}
              type="button"
              onClick={() => onAction(`L’ouverture de ${document.name} sera ajoutée ici`)}
              className="flex w-full items-center gap-3 rounded-2xl border border-[#e4ecea] bg-animeo-bg p-3 text-left transition hover:border-animeo"
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[10px] font-black ${document.type === "PDF" ? "bg-[#fff0e8] text-[#a9572e]" : "bg-[#e8f1f4] text-[#315f6c]"}`}>
                {document.type === "PDF" ? "PDF" : "IMG"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-extrabold text-animeo-dark">{document.name}</span>
                <span className="mt-0.5 block truncate text-[10px] font-semibold text-animeo-muted">{document.linkedTo}</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-2xl bg-animeo-bg p-4 text-sm font-semibold text-animeo-muted">Aucun document pour cet animal.</p>
      )}

      <button
        type="button"
        onClick={() => onAction(`Le téléversement d’un document pour ${animal.name} sera ajouté ici`)}
        className="mt-4 flex w-full items-center justify-center rounded-xl bg-animeo px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-[#459e90]"
      >
        Téléverser un document
      </button>
      <button
        type="button"
        onClick={() => onAction(`La liste complète des documents de ${animal.name} sera ajoutée ici`)}
        className="mt-2 flex w-full items-center justify-center rounded-xl bg-animeo-soft px-4 py-2.5 text-sm font-extrabold text-animeo-dark transition hover:bg-[#dceee9]"
      >
        Voir tous les documents
      </button>
    </Card>
  );
}

function ReminderCard({ animal, onScheduleReminder }: { animal: Animal; onScheduleReminder: () => void }) {
  return (
    <Card className="overflow-hidden sm:self-start">
      <div className="bg-[#fff8e8] p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-[#a66d16]">Prochain rappel</p>
            <h2 className="mt-2 text-xl font-black text-animeo-dark">{animal.reminder.label}</h2>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-[#b7791f]">
            <Icon name="bell" className="h-5 w-5" />
          </div>
        </div>
        <p className="mt-3 text-sm font-bold text-animeo-muted">Prévu le {animal.reminder.date}</p>
        <p className="mt-2 text-xs leading-relaxed text-animeo-muted">Ce rappel est associé uniquement à {animal.name}, pas à toute la fiche propriétaire.</p>
      </div>
      <div className="p-4">
        <button
          type="button"
          onClick={onScheduleReminder}
          className="flex w-full items-center justify-center rounded-xl bg-[#fff0cf] px-4 py-2.5 text-sm font-extrabold text-[#8c6118] transition hover:bg-[#ffe7b2]"
        >
          Programmer un rappel
        </button>
      </div>
    </Card>
  );
}

function DocumentIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6M8 13h8M8 17h6" />
    </svg>
  );
}
