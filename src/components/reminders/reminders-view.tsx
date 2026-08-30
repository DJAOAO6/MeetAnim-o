"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ReminderModal } from "@/components/reminders/reminder-modal";
import { ReminderScheduleModal, type ReminderFormValue } from "@/components/reminders/reminder-schedule-modal";
import { RemindersTable } from "@/components/reminders/reminders-table";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
import { notify } from "@/lib/notify";
import { ignoreReminderAction, saveReminderAction, sendReminderAction, sendRemindersBulkAction } from "@/lib/reminders-actions";
import type { Reminder, ReminderClientOption, ReminderStatus } from "@/data/reminders";

type PeriodFilter = "current" | "next" | "all";
type StatusFilter = "all" | Exclude<ReminderStatus, "À venir">;

type RemindersViewProps = {
  initialReminders: Reminder[];
  initialStats: {
    due: number;
    sent: number;
    booked: number;
    upcoming: number;
  };
  clientOptions: ReminderClientOption[];
  professionalSlug: string;
  messageTemplate: string;
};

function referenceDate() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
}

const statsConfig: Array<{
  key: keyof RemindersViewProps["initialStats"];
  label: string;
  icon: IconName;
  color: string;
  background: string;
}> = [
  { key: "due", label: "À relancer", icon: "bell", color: "text-[#b7791f]", background: "bg-[#fff4dd]" },
  { key: "sent", label: "Rappels envoyés", icon: "calendar", color: "text-animeo-dark", background: "bg-animeo-soft" },
  { key: "booked", label: "RDV repris", icon: "agenda", color: "text-[#267668]", background: "bg-[#e4f5ef]" },
  { key: "upcoming", label: "À venir", icon: "calendar", color: "text-[#8067b0]", background: "bg-[#eeeaf8]" },
];

const periodFilters: Array<{ value: PeriodFilter; label: string }> = [
  { value: "current", label: "Ce mois-ci" },
  { value: "next", label: "Mois prochain" },
  { value: "all", label: "Tous" },
];

const statusFilters: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "Tous" },
  { value: "À relancer", label: "À relancer" },
  { value: "Rappel envoyé", label: "Rappel envoyé" },
  { value: "RDV repris", label: "RDV repris" },
  { value: "Ignoré", label: "Ignoré" },
];

export function RemindersView({ initialReminders, initialStats, clientOptions, professionalSlug, messageTemplate }: RemindersViewProps) {
  const router = useRouter();
  // saveReminderAction/sendReminderAction/... recalculent le statut et
  // (à la création) l'antériorité réelle côté serveur — plutôt que de
  // dupliquer cette logique côté client dans un état local, on affiche
  // directement les props (fraîches après chaque router.refresh() suivant
  // une mutation réussie, qui ré-exécute RappelsPage).
  const reminders = initialReminders;
  const stats = initialStats;
  const [query, setQuery] = useState("");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("current");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeReminder, setActiveReminder] = useState<Reminder | null>(null);
  const [scheduleReminder, setScheduleReminder] = useState<Reminder | "new" | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isBulkSending, setIsBulkSending] = useState(false);

  const filteredReminders = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("fr-FR");

    return reminders.filter((reminder) => {
      const dueDate = new Date(`${reminder.dueDate}T12:00:00`);
      const today = referenceDate();
      const matchesCurrentMonth = dueDate.getFullYear() === today.getFullYear()
        && dueDate.getMonth() === today.getMonth();
      const nextMonthDate = new Date(today.getFullYear(), today.getMonth() + 1, 1, 12);
      const matchesNextMonth = dueDate.getFullYear() === nextMonthDate.getFullYear()
        && dueDate.getMonth() === nextMonthDate.getMonth();
      const matchesPeriod = periodFilter === "all"
        || (periodFilter === "current" && matchesCurrentMonth)
        || (periodFilter === "next" && matchesNextMonth);
      const matchesStatus = statusFilter === "all" || reminder.status === statusFilter;
      const matchesQuery = !normalizedQuery
        || `${reminder.clientName} ${reminder.animalName}`.toLocaleLowerCase("fr-FR").includes(normalizedQuery);

      return matchesPeriod && matchesStatus && matchesQuery;
    });
  }, [periodFilter, query, reminders, statusFilter]);

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    const visibleIds = filteredReminders.map((reminder) => reminder.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

    setSelectedIds((current) => {
      const next = new Set(current);
      visibleIds.forEach((id) => {
        if (allVisibleSelected) next.delete(id);
        else next.add(id);
      });
      return next;
    });
  }

  async function markAsSent(ids: string[]) {
    const dueIds = reminders.filter((reminder) => ids.includes(reminder.id) && reminder.status === "À relancer").map((reminder) => reminder.id);

    if (dueIds.length === 0) {
      notify.info("Aucun rappel arrivé à échéance parmi la sélection.");
      setSelectedIds(new Set());
      return;
    }

    setIsBulkSending(true);
    const result = await sendRemindersBulkAction(dueIds);
    setIsBulkSending(false);
    setSelectedIds(new Set());

    if (result.sentIds.length > 0) {
      notify.success(`${result.sentIds.length} rappel${result.sentIds.length > 1 ? "s ont" : " a"} été envoyé${result.sentIds.length > 1 ? "s" : ""}.`);
    }
    if (result.failedNames.length > 0) {
      notify.error(`Échec de l'envoi pour : ${result.failedNames.join(", ")}.`);
    }
    if (result.sentIds.length > 0) router.refresh();
  }

  async function sendSingleReminder(reminder: Reminder, message: string) {
    setIsSending(true);
    const result = await sendReminderAction(reminder.id, message);
    setIsSending(false);

    if (!result.ok) {
      notify.error(result.error);
      return;
    }

    notify.success(`Le rappel de ${reminder.animalName} a été envoyé à ${reminder.clientName}.`);
    setActiveReminder(null);
    router.refresh();
  }

  async function ignoreReminder(reminder: Reminder) {
    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(reminder.id);
      return next;
    });

    const result = await ignoreReminderAction(reminder.id);
    if (!result.ok) {
      notify.error(result.error);
      return;
    }

    notify.success(`Le rappel de ${reminder.animalName} a été ignoré.`);
    router.refresh();
  }

  async function saveScheduledReminder(value: ReminderFormValue) {
    setIsSaving(true);
    const result = await saveReminderAction(value);
    setIsSaving(false);

    if (!result.ok) {
      notify.error(result.error);
      return;
    }

    const animal = clientOptions.find((option) => option.id === value.clientId)?.animals.find((option) => option.id === value.animalId);
    notify.success(value.id ? `Le rappel de ${animal?.name ?? "l'animal"} a été modifié.` : `Le rappel de ${animal?.name ?? "l'animal"} a été programmé.`);
    setScheduleReminder(null);
    router.refresh();
  }

  // Pas de toast ici : le filtre et la sélection changent visiblement à
  // l'écran (liste filtrée sur "À relancer", cases cochées), un message
  // supplémentaire ferait doublon.
  function launchDueReminders() {
    const dueIds = reminders.filter((reminder) => reminder.status === "À relancer").map((reminder) => reminder.id);
    setPeriodFilter("all");
    setStatusFilter("À relancer");
    setSelectedIds(new Set(dueIds));
  }

  return (
    <>
      <PageHeader
        title="Rappels clients"
        description="Suivez les animaux à relancer et gardez le contact avec vos clients."
        action={
          <button
            type="button"
            onClick={launchDueReminders}
            className="inline-flex items-center rounded-2xl bg-animeo px-5 py-3 font-extrabold text-white shadow-[0_8px_20px_rgba(79,175,159,0.2)] transition hover:-translate-y-0.5 hover:bg-[#459e90]"
          >
            <Icon name="bell" className="mr-2 h-5 w-5" />
            Lancer les rappels
          </button>
        }
      />

      <section aria-label="Statistiques des rappels" className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statsConfig.map((item) => (
          <Card key={item.key} className="flex items-center gap-4 p-5">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${item.background} ${item.color}`}>
              <Icon name={item.icon} className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-animeo-muted">{item.label}</p>
              <p className={`mt-1 text-3xl font-black ${item.color}`}>{stats[item.key]}</p>
            </div>
          </Card>
        ))}
      </section>

      <Card className="mb-6 p-4 sm:p-5">
        <div className="grid gap-5 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)] xl:items-end">
          <label className="relative block">
            <span className="mb-2 block text-xs font-extrabold uppercase tracking-[0.11em] text-animeo-muted">Recherche</span>
            <SearchIcon />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher un client ou un animal"
              className="h-11 w-full rounded-xl border border-[#d9e5e2] bg-animeo-bg pl-10 pr-4 text-sm font-semibold text-animeo-dark outline-none transition placeholder:text-[#9aa6aa] focus:border-animeo focus:bg-white"
            />
          </label>

          <div className="space-y-3">
            <FilterGroup label="Période" filters={periodFilters} value={periodFilter} onChange={setPeriodFilter} />
            <FilterGroup label="Statut" filters={statusFilters} value={statusFilter} onChange={setStatusFilter} />
          </div>
        </div>
      </Card>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-animeo-dark">Liste des rappels</h2>
          <p className="mt-1 text-sm text-animeo-muted">{filteredReminders.length} rappel{filteredReminders.length > 1 ? "s" : ""} affiché{filteredReminders.length > 1 ? "s" : ""}</p>
        </div>
        <button
          type="button"
          onClick={() => setScheduleReminder("new")}
          className="inline-flex items-center justify-center rounded-xl border border-animeo px-4 py-2.5 text-sm font-extrabold text-animeo transition hover:bg-animeo-soft"
        >
          + Programmer un rappel
        </button>
      </div>

      {selectedIds.size > 0 ? (
        <div className="sticky top-4 z-30 mb-4 flex flex-col gap-3 rounded-2xl bg-animeo-dark px-5 py-4 text-white shadow-[0_12px_32px_rgba(24,59,69,0.22)] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-9 min-w-9 items-center justify-center rounded-xl bg-white/10 px-2 font-black">{selectedIds.size}</span>
            <p className="font-extrabold">{selectedIds.size} rappel{selectedIds.size > 1 ? "s" : ""} sélectionné{selectedIds.size > 1 ? "s" : ""}</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setSelectedIds(new Set())} className="rounded-xl px-4 py-2 text-sm font-extrabold text-white/75 transition hover:bg-white/10 hover:text-white">Annuler</button>
            <button type="button" onClick={() => markAsSent(Array.from(selectedIds))} disabled={isBulkSending} className="rounded-xl bg-animeo px-4 py-2 text-sm font-extrabold text-white transition hover:bg-[#459e90] disabled:cursor-not-allowed disabled:opacity-60">
              {isBulkSending ? "Envoi…" : "Envoyer les rappels"}
            </button>
          </div>
        </div>
      ) : null}

      <RemindersTable
        reminders={filteredReminders}
        selectedIds={selectedIds}
        onToggleSelected={toggleSelected}
        onToggleAll={toggleAllVisible}
        onRemind={setActiveReminder}
        onEdit={setScheduleReminder}
        onIgnore={ignoreReminder}
      />

      {activeReminder ? (
        <ReminderModal reminder={activeReminder} professionalSlug={professionalSlug} messageTemplate={messageTemplate} sending={isSending} onClose={() => setActiveReminder(null)} onSend={sendSingleReminder} />
      ) : null}

      {scheduleReminder ? (
        <ReminderScheduleModal
          reminder={scheduleReminder === "new" ? undefined : scheduleReminder}
          clients={clientOptions}
          saving={isSaving}
          onClose={() => setScheduleReminder(null)}
          onSave={saveScheduledReminder}
        />
      ) : null}
    </>
  );
}

function FilterGroup<T extends string>({ label, filters, value, onChange }: {
  label: string;
  filters: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <span className="w-14 shrink-0 text-xs font-extrabold text-animeo-muted">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {filters.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => onChange(filter.value)}
            aria-pressed={value === filter.value}
            className={`rounded-xl px-3 py-2 text-xs font-extrabold transition ${
              value === filter.value
                ? "bg-animeo text-white shadow-sm"
                : "bg-animeo-bg text-animeo-muted hover:bg-animeo-soft hover:text-animeo-dark"
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="absolute bottom-3 left-3.5 h-5 w-5 text-animeo-muted">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  );
}
