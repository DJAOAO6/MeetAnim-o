"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, CalendarX } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import {
  AppointmentFilters,
  defaultFilters,
  type AppointmentFilterState,
  type DateFilter,
} from "@/components/appointments/appointment-filters";
import { AppointmentDayGroup, AppointmentList } from "@/components/appointments/appointment-list";
import { AppointmentDetailsPanel, AppointmentDetailsPlaceholder } from "@/components/appointments/appointment-details-panel";
import { useAppointmentActions } from "@/components/appointments/use-appointment-actions";
import type { AppointmentAction } from "@/components/appointments/appointment-actions-menu";
import { dateId, referenceDate, startOfWeek, weekDatesFrom } from "@/components/dashboard/dashboard-date";
import type { Appointment, AppointmentStatus } from "@/data/appointments";

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("fr-FR");
}

/**
 * Bornes de chaque filtre de date, calculées à l'ouverture de la fenêtre.
 *
 * « Cette semaine » est la semaine du lundi au dimanche déjà utilisée partout
 * ailleurs (agenda, chiffres clés) — pas les sept prochains jours : les deux
 * donnent des résultats différents un vendredi, et c'est la semaine
 * calendaire que lit un professionnel sur son planning.
 */
function matchesDateFilter(appointment: Appointment, filter: DateFilter): boolean {
  if (filter === "all") return true;

  const today = referenceDate();
  const todayId = dateId(today);

  if (filter === "today") return appointment.date === todayId;
  if (filter === "past") return appointment.date < todayId;

  if (filter === "tomorrow") {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return appointment.date === dateId(tomorrow);
  }

  if (filter === "week") {
    const ids = new Set(weekDatesFrom(startOfWeek(today)).map(dateId));
    return ids.has(appointment.date);
  }

  return appointment.date.slice(0, 7) === todayId.slice(0, 7);
}

/**
 * Centre de gestion des rendez-vous.
 *
 * Deux colonnes sur grand écran : la liste à gauche, la fiche du rendez-vous
 * sélectionné à droite. C'est ce qui permet de passer en revue une journée
 * sans ouvrir et refermer une fenêtre par rendez-vous. Sous 1024 px la fiche
 * passe au-dessus de la liste, et sous 640 px la fenêtre occupe tout l'écran.
 */
export function AppointmentsManagerModal({ appointments, initialSelectedId, onClose, onCreate, onEdit, onDuplicate, onStatusChange }: {
  appointments: Appointment[];
  initialSelectedId: string | null;
  onClose: () => void;
  onCreate: () => void;
  onEdit: (appointment: Appointment) => void;
  onDuplicate: (appointment: Appointment) => void;
  onStatusChange: (appointment: Appointment, status: AppointmentStatus) => Promise<void>;
}) {
  const router = useRouter();
  const [filters, setFilters] = useState<AppointmentFilterState>(() => ({
    ...defaultFilters,
    // Ouvrir sur un rendez-vous précis ne doit pas le faire filtrer hors de
    // la liste : dans ce cas, toutes les dates sont affichées.
    date: initialSelectedId ? "all" : defaultFilters.date,
  }));
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [confirming, setConfirming] = useState<Appointment | null>(null);
  // Une seule instance pour toute la fenêtre : le menu d'une ligne et la
  // fiche de droite déclenchent exactement le même geste, avec la même
  // proposition de rappel.
  const actions = useAppointmentActions(() => setSelectedId(null));

  const filtered = useMemo(() => {
    const query = normalize(filters.search.trim());
    return appointments
      .filter((appointment) => matchesDateFilter(appointment, filters.date))
      .filter((appointment) => filters.status === "all" || appointment.status === filters.status)
      .filter((appointment) => filters.place === "all" || appointment.mode === filters.place)
      .filter((appointment) => query === "" || normalize(`${appointment.clientName} ${appointment.animalName} ${appointment.serviceName} ${appointment.location}`).includes(query))
      .sort((first, second) => `${first.date} ${first.start}`.localeCompare(`${second.date} ${second.start}`));
  }, [appointments, filters]);

  const grouped = useMemo(() => {
    const groups = new Map<string, Appointment[]>();
    for (const appointment of filtered) {
      groups.set(appointment.date, [...(groups.get(appointment.date) ?? []), appointment]);
    }
    return [...groups.entries()];
  }, [filtered]);

  const selected = appointments.find((appointment) => appointment.id === selectedId) ?? null;

  async function handleAction(action: AppointmentAction, appointment: Appointment) {
    if (action === "edit") { onEdit(appointment); return; }
    if (action === "duplicate") { onDuplicate(appointment); return; }
    if (action === "confirm") { await onStatusChange(appointment, "confirmed"); return; }
    // « Terminé » n'est pas un simple statut : la consultation est écrite au
    // dossier de l'animal et un rappel est proposé. D'où la vraie action,
    // et non un changement de statut qui aurait l'air identique de l'extérieur
    // tout en perdant l'essentiel.
    if (action === "complete") { await actions.complete(appointment); return; }
    if (action === "cancel") { setConfirming(appointment); return; }

    // Quitter la fenêtre pour une fiche : la navigation ferme le centre de
    // gestion, sinon il resterait ouvert par-dessus la page d'arrivée.
    if (action === "openClient" && appointment.clientId) {
      onClose();
      router.push(`/dashboard/clients/${appointment.clientId}`);
    }
    if (action === "openAnimal" && appointment.clientId && appointment.animalId) {
      onClose();
      router.push(`/dashboard/clients/${appointment.clientId}?animal=${appointment.animalId}`);
    }
  }

  const searching = filters.search.trim() !== "" || filters.status !== "all" || filters.place !== "all";

  return (
    <>
      <Modal
        title="Gestion des rendez-vous"
        description="Consultez, filtrez et gérez tous vos rendez-vous."
        onClose={onClose}
        size="2xl"
        mobile="fullscreen"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button type="button" variant="secondary" onClick={onClose}>Fermer</Button>
            <Button type="button" onClick={onCreate}>
              <CalendarPlus aria-hidden="true" className="h-4 w-4" />
              Nouveau rendez-vous
            </Button>
          </div>
        }
      >
        <div className="grid gap-4">
          <AppointmentFilters
            value={filters}
            resultCount={filtered.length}
            onChange={(change) => setFilters((current) => ({ ...current, ...change }))}
            onReset={() => setFilters(defaultFilters)}
          />

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
            <div className="min-w-0">
              {filtered.length > 0 ? (
                <div className="grid gap-4">
                  {grouped.map(([day, dayAppointments]) => (
                    <AppointmentDayGroup key={day} dateId={day} count={dayAppointments.length}>
                      <AppointmentList
                        appointments={dayAppointments}
                        selectedId={selectedId}
                        onSelect={(appointment) => setSelectedId(appointment.id)}
                        onAction={handleAction}
                      />
                    </AppointmentDayGroup>
                  ))}
                </div>
              ) : (
                <EmptyState searching={searching} onCreate={onCreate} onReset={() => setFilters(defaultFilters)} />
              )}
            </div>

            {/* La fiche passe au-dessus de la liste sous lg : à cette largeur,
                deux colonnes donneraient deux colonnes illisibles. */}
            <div className="order-first min-h-[18rem] min-w-0 lg:order-none lg:sticky lg:top-0">
              {selected ? (
                <AppointmentDetailsPanel appointment={selected} onEdit={() => onEdit(selected)} actions={actions} />
              ) : <AppointmentDetailsPlaceholder />}
            </div>
          </div>
        </div>
      </Modal>

      {actions.reminderDialog}

      {confirming ? (
        <ConfirmModal
          title="Annuler ce rendez-vous ?"
          message={`Le rendez-vous de ${confirming.animalName} (${confirming.clientName}) du ${formatShortDate(confirming.date)} à ${confirming.start} passera en « Annulé ». Il restera dans l’historique, et le créneau redeviendra libre.`}
          confirmLabel="Annuler le rendez-vous"
          onConfirm={async () => {
            const appointment = confirming;
            setConfirming(null);
            await onStatusChange(appointment, "cancelled");
          }}
          onClose={() => setConfirming(null)}
        />
      ) : null}
    </>
  );
}

function EmptyState({ searching, onCreate, onReset }: { searching: boolean; onCreate: () => void; onReset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-animeo-border-strong bg-animeo-bg p-8 text-center">
      <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-animeo-muted">
        <CalendarX className="h-5 w-5" />
      </span>
      <p className="mt-3 text-sm font-extrabold text-animeo-dark">
        {searching ? "Aucun rendez-vous ne correspond à votre recherche" : "Aucun rendez-vous sur cette période"}
      </p>
      <p className="mt-1 max-w-sm text-xs text-animeo-muted">
        {searching ? "Élargissez la période ou retirez un filtre." : "Votre planning est libre — c’est peut-être le bon moment pour relancer un client."}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {searching ? (
          <Button type="button" variant="secondary" size="sm" onClick={onReset}>Réinitialiser les filtres</Button>
        ) : null}
        <Button type="button" size="sm" onClick={onCreate}>
          <CalendarPlus aria-hidden="true" className="h-4 w-4" />
          Ajouter un rendez-vous
        </Button>
      </div>
    </div>
  );
}

function formatShortDate(dateId: string): string {
  const [year, month, day] = dateId.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" }).format(new Date(year, month - 1, day, 12));
}
