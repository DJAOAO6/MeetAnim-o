"use client";

import Link from "next/link";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import type { Reminder, ReminderStatus } from "@/data/reminders";

type RemindersTableProps = {
  reminders: Reminder[];
  selectedIds: Set<string>;
  onToggleSelected: (id: string) => void;
  onToggleAll: () => void;
  onRemind: (reminder: Reminder) => void;
  onEdit: (reminder: Reminder) => void;
  onIgnore: (reminder: Reminder) => void;
};

const statusStyles: Record<ReminderStatus, string> = {
  "À relancer": "bg-[#fff4dd] text-[#a66d16]",
  "Rappel envoyé": "bg-[#e8f1f4] text-animeo-dark",
  "RDV repris": "bg-[#e4f5ef] text-[#267668]",
  "Ignoré": "bg-[#f0f2f2] text-[#6f7b7f]",
  "À venir": "bg-[#eeeaf8] text-[#6c5598]",
};

function formatDate(date: string) {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    .format(new Date(`${date}T12:00:00`));
}

export function RemindersTable(props: RemindersTableProps) {
  const { reminders, selectedIds, onToggleAll } = props;
  const allSelected = reminders.length > 0 && reminders.every((reminder) => selectedIds.has(reminder.id));

  if (reminders.length === 0) {
    return (
      <Card className="px-6 py-16 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-animeo-soft text-animeo-dark">
          <Icon name="bell" className="h-7 w-7" />
        </div>
        <h3 className="mt-4 font-extrabold text-animeo-dark">Aucun rappel trouvé</h3>
        <p className="mt-1 text-sm text-animeo-muted">Modifiez la recherche ou les filtres sélectionnés.</p>
      </Card>
    );
  }

  return (
    <Card className="overflow-visible">
      <div className="hidden 2xl:block">
        <div className="grid grid-cols-[38px_1.05fr_.75fr_1fr_.65fr_.9fr_.8fr_170px] items-center gap-3 rounded-t-3xl border-b border-[#e5eeeb] bg-[#fbfdfc] px-5 py-3 text-[10px] font-extrabold uppercase tracking-[0.09em] text-animeo-muted">
          <input type="checkbox" checked={allSelected} onChange={onToggleAll} aria-label="Sélectionner tous les rappels affichés" className="h-4 w-4 accent-[#4FAF9F]" />
          <span>Client</span>
          <span>Animal</span>
          <span>Dernière consultation</span>
          <span>Délai</span>
          <span>Date du rappel</span>
          <span>Statut</span>
          <span className="text-right">Action</span>
        </div>
        <div className="divide-y divide-[#edf2f0]">
          {reminders.map((reminder) => <DesktopRow key={reminder.id} reminder={reminder} {...props} />)}
        </div>
      </div>

      <div className="grid gap-4 p-4 sm:grid-cols-2 2xl:hidden">
        {reminders.map((reminder) => <MobileReminderCard key={reminder.id} reminder={reminder} {...props} />)}
      </div>
    </Card>
  );
}

function DesktopRow({ reminder, selectedIds, onToggleSelected, onRemind, onEdit, onIgnore }: RemindersTableProps & { reminder: Reminder }) {
  return (
    <div className={`grid grid-cols-[38px_1.05fr_.75fr_1fr_.65fr_.9fr_.8fr_170px] items-center gap-3 px-5 py-4 transition ${selectedIds.has(reminder.id) ? "bg-animeo-soft/55" : "hover:bg-animeo-bg/70"}`}>
      <input type="checkbox" checked={selectedIds.has(reminder.id)} onChange={() => onToggleSelected(reminder.id)} aria-label={`Sélectionner le rappel de ${reminder.animalName}`} className="h-4 w-4 accent-[#4FAF9F]" />
      <ClientCell reminder={reminder} />
      <AnimalCell reminder={reminder} />
      <span className="text-sm font-semibold text-animeo-muted">{reminder.lastConsultation}</span>
      <span className="text-sm font-extrabold text-animeo-dark">{reminder.delay}</span>
      <span className="text-sm font-bold text-animeo-dark">{formatDate(reminder.dueDate)}</span>
      <StatusBadge status={reminder.status} />
      <RowActions reminder={reminder} onRemind={onRemind} onEdit={onEdit} onIgnore={onIgnore} />
    </div>
  );
}

function MobileReminderCard({ reminder, selectedIds, onToggleSelected, onRemind, onEdit, onIgnore }: RemindersTableProps & { reminder: Reminder }) {
  return (
    <article className={`rounded-2xl border p-4 ${selectedIds.has(reminder.id) ? "border-animeo bg-animeo-soft/50" : "border-[#e1ebe8] bg-white"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <input type="checkbox" checked={selectedIds.has(reminder.id)} onChange={() => onToggleSelected(reminder.id)} aria-label={`Sélectionner le rappel de ${reminder.animalName}`} className="mt-1 h-4 w-4 accent-[#4FAF9F]" />
          <div>
            <ClientCell reminder={reminder} />
            <div className="mt-2"><AnimalCell reminder={reminder} /></div>
          </div>
        </div>
        <StatusBadge status={reminder.status} />
      </div>
      <dl className="mt-4 space-y-2 border-t border-[#e5eeeb] pt-4 text-sm">
        <InfoLine label="Dernière consultation" value={reminder.lastConsultation} />
        <InfoLine label="Délai prévu" value={reminder.delay} />
        <InfoLine label="Date du rappel" value={formatDate(reminder.dueDate)} />
      </dl>
      <div className="mt-4 flex justify-end">
        <RowActions reminder={reminder} onRemind={onRemind} onEdit={onEdit} onIgnore={onIgnore} />
      </div>
    </article>
  );
}

function ClientCell({ reminder }: { reminder: Reminder }) {
  const initials = reminder.clientName.split(" ").map((part) => part[0]).join("").slice(0, 2);

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-animeo-soft text-xs font-black text-animeo-dark">{initials}</span>
      <span className="truncate text-sm font-extrabold text-animeo-dark">{reminder.clientName}</span>
    </div>
  );
}

function AnimalCell({ reminder }: { reminder: Reminder }) {
  return (
    <div>
      <p className="text-sm font-extrabold text-animeo-dark">{reminder.animalName}</p>
      <p className="mt-0.5 text-[10px] font-semibold text-animeo-muted">{reminder.animalSpecies}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: ReminderStatus }) {
  return <span className={`inline-flex w-fit rounded-full px-2.5 py-1.5 text-[10px] font-black ${statusStyles[status]}`}>{status}</span>;
}

function RowActions({ reminder, onRemind, onEdit, onIgnore }: Pick<RemindersTableProps, "onRemind" | "onEdit" | "onIgnore"> & { reminder: Reminder }) {
  const [open, setOpen] = useState(false);
  const profileHref = `/dashboard/clients/${reminder.clientId}`;

  return (
    <div className="relative flex items-center justify-end gap-2">
      {reminder.status === "À relancer" ? (
        <button type="button" onClick={() => onRemind(reminder)} className="rounded-xl bg-animeo px-3 py-2 text-xs font-extrabold text-white transition hover:bg-[#459e90]">Relancer</button>
      ) : null}
      <button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-label={`Plus d’actions pour ${reminder.animalName}`} className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#d9e5e2] bg-white font-black text-animeo-muted transition hover:border-animeo hover:text-animeo-dark">•••</button>
      {open ? (
        <div className="absolute right-0 top-10 z-40 w-48 rounded-2xl border border-[#dfe9e6] bg-white p-2 text-left shadow-[0_12px_30px_rgba(24,59,69,0.16)]">
          <MenuButton label="Modifier la date" onClick={() => { setOpen(false); onEdit(reminder); }} />
          <MenuButton label="Ignorer" disabled={reminder.status === "Ignoré"} onClick={() => { setOpen(false); onIgnore(reminder); }} />
          <Link href={profileHref} className="block rounded-xl px-3 py-2 text-xs font-extrabold text-animeo-dark transition hover:bg-animeo-soft" onClick={() => setOpen(false)}>Voir la fiche animal</Link>
        </div>
      ) : null}
    </div>
  );
}

function MenuButton({ label, onClick, disabled = false }: { label: string; onClick: () => void; disabled?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} className="block w-full rounded-xl px-3 py-2 text-left text-xs font-extrabold text-animeo-dark transition hover:bg-animeo-soft disabled:cursor-not-allowed disabled:opacity-40">{label}</button>;
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-3"><dt className="text-animeo-muted">{label}</dt><dd className="text-right font-bold text-animeo-dark">{value}</dd></div>;
}
