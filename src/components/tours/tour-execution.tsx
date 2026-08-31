"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Icon } from "@/components/ui/icon";
import { completeAppointmentAction, swapAppointmentTimesAction, type SuggestedReminder } from "@/lib/appointments-actions";
import { saveReminderAction } from "@/lib/reminders-actions";
import { notify } from "@/lib/notify";
import { formatEuros } from "@/lib/format";
import { toTelHref } from "@/lib/phone";
import { buildSingleStopMapsUrl, buildTourMapsLinks } from "@/lib/tour-maps";
import { formatTourEstimate, ROAD_DETOUR_FACTOR } from "@/lib/tour-estimate";
import { haversineDistanceKm } from "@/lib/geo";
import { timeToMinutes } from "@/lib/booking-validation";
import type { Coordinates, Tour, TourAppointment, Zone } from "@/data/tours";

type TourExecutionProps = {
  tour: Tour;
  zone?: Zone;
  appointments: TourAppointment[];
  cabinetCoordinates: Coordinates | null;
  onBack: () => void;
  onDelete: () => void;
};

// Signal, pas un meuble : un léger retard ne mérite pas une alerte.
const LATE_THRESHOLD_MINUTES = 10;

function distanceFromPrevious(appointments: TourAppointment[], index: number): string | null {
  if (index === 0) return null;
  const previous = appointments[index - 1].coordinates;
  const current = appointments[index].coordinates;
  if (!previous || !current) return null;
  return `≈ ${Math.round(haversineDistanceKm(previous, current) * ROAD_DETOUR_FACTOR)} km`;
}

/**
 * Écran d'exécution d'une tournée — remplace l'ancien détail purement
 * descriptif (refonte tournées, phase 2). L'ordre des arrêts n'est jamais
 * une donnée indépendante : il dérive de l'heure de début des rendez-vous,
 * déjà la source de vérité de l'agenda (`appointments` arrive triée par
 * `start`, voir computeTourOccurrence).
 */
export function TourExecution({ tour, zone, appointments, cabinetCoordinates, onBack, onDelete }: TourExecutionProps) {
  const router = useRouter();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [reminderPrompt, setReminderPrompt] = useState<{ animalName: string; reminder: SuggestedReminder } | null>(null);
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [swapConfirm, setSwapConfirm] = useState<{ source: TourAppointment; target: TourAppointment } | null>(null);
  const [swapping, setSwapping] = useState(false);

  const completedStops = appointments.filter((appointment) => appointment.completedAt !== null);
  const pendingStops = appointments.filter((appointment) => appointment.completedAt === null);
  const currentStop = pendingStops[0];
  const upcomingStops = pendingStops.slice(1);

  const mapsResult = buildTourMapsLinks(cabinetCoordinates, appointments);
  const estimateLabel = formatTourEstimate({ distanceKm: tour.estimatedDistanceKm, durationMinutes: tour.estimatedDurationMinutes, unlocatedStopCount: tour.unlocatedStopCount });

  const lastCompletedStop = completedStops[completedStops.length - 1];
  const delayMinutes = lastCompletedStop?.completedAt ? timeToMinutes(lastCompletedStop.completedAt) - timeToMinutes(lastCompletedStop.endTime) : 0;

  async function handleComplete(appointment: TourAppointment) {
    setCompletingId(appointment.id);
    const result = await completeAppointmentAction(appointment.id);
    setCompletingId(null);
    if (!result.ok) {
      notify.error(result.error);
      return;
    }
    notify.success(`${appointment.animalName} — consultation marquée comme réalisée.`);
    if (result.suggestedReminder) {
      setReminderPrompt({ animalName: appointment.animalName, reminder: result.suggestedReminder });
      return;
    }
    router.refresh();
  }

  async function confirmReminder() {
    if (!reminderPrompt) return;
    const { reminder } = reminderPrompt;
    setReminderPrompt(null);
    const result = await saveReminderAction({ clientId: reminder.clientId, animalId: reminder.animalId, dueDate: reminder.dueDate, delay: reminder.delay, note: "" });
    if (!result.ok) notify.error(result.error);
    else notify.success(`Rappel programmé dans ${reminder.delay}.`);
    router.refresh();
  }

  function declineReminder() {
    setReminderPrompt(null);
    router.refresh();
  }

  async function confirmSwap() {
    if (!swapConfirm) return;
    const { source, target } = swapConfirm;
    setSwapping(true);
    const result = await swapAppointmentTimesAction(source.id, target.id);
    setSwapping(false);
    if (!result.ok) {
      notify.error(result.error);
      return;
    }
    setSwapConfirm(null);
    notify.success("Rendez-vous échangés.");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm font-extrabold text-animeo-muted transition hover:text-animeo">
          <Icon name="arrow" className="h-4 w-4 rotate-180" />
          Retour aux tournées
        </button>
        <button type="button" onClick={() => setDeleteConfirmOpen(true)} className="inline-flex items-center gap-1.5 rounded-xl bg-red-500/10 px-3.5 py-2 text-sm font-extrabold text-red-500 transition hover:bg-red-500/20">
          <TrashIcon />
          Supprimer la tournée
        </button>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-5 bg-gradient-to-r from-animeo-soft to-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-animeo">Journée à domicile</p>
            <h2 className="mt-1 text-3xl font-black text-animeo-dark">{tour.name}</h2>
            <p className="mt-2 font-bold text-animeo-muted">{tour.dateLabel} · {completedStops.length}/{appointments.length} arrêts</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {zone?.cities.map((city) => <span key={city.id} className="rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-animeo-dark shadow-sm">{city.name}</span>)}
            </div>
          </div>
          {mapsResult.links.length > 0 ? (
            <div className="flex flex-col items-stretch gap-2 sm:items-end">
              <div className="flex flex-wrap justify-end gap-2">
                {mapsResult.links.map((link) => (
                  <a
                    key={link.label}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center justify-center rounded-xl bg-animeo px-5 py-3 text-sm font-extrabold text-white transition hover:bg-[#459e90]"
                  >
                    <Icon name="tournees" className="mr-2 h-5 w-5" />
                    {mapsResult.links.length > 1 ? link.label : "Ouvrir l’itinéraire complet"}
                  </a>
                ))}
              </div>
              {mapsResult.excludedStopCount > 0 ? (
                <p className="text-right text-xs font-semibold text-[#a9573b]">
                  {mapsResult.excludedStopCount > 1
                    ? `${mapsResult.excludedStopCount} arrêts sans adresse localisée ne sont pas dans l’itinéraire.`
                    : "1 arrêt sans adresse localisée n’est pas dans l’itinéraire."}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 border-t border-[#e5eeeb] px-5 py-3 text-center text-sm font-bold text-animeo-muted sm:px-6">
          <span>{estimateLabel}</span>
          {tour.expectedReturnTime ? <span>Retour prévu vers {tour.expectedReturnTime}</span> : null}
        </div>
      </Card>

      {delayMinutes > LATE_THRESHOLD_MINUTES ? (
        <div className="flex items-center gap-2 rounded-2xl bg-[#fff3e0] px-4 py-3 text-sm font-extrabold text-[#a9573b]">
          <Icon name="agenda" className="h-4 w-4 shrink-0" />
          En retard d’environ {delayMinutes} min sur l’horaire prévu.
        </div>
      ) : null}

      {currentStop ? (
        <div>
          <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.11em] text-animeo">Arrêt en cours</p>
          <CurrentStopCard appointment={currentStop} completing={completingId === currentStop.id} onComplete={() => handleComplete(currentStop)} />
        </div>
      ) : (
        <Card className="p-6 text-center text-sm font-bold text-animeo-dark">Tous les arrêts de cette tournée sont terminés.</Card>
      )}

      {upcomingStops.length > 0 ? (
        <Card className="overflow-hidden">
          <div className="border-b border-[#e5eeeb] px-5 py-4">
            <h3 className="font-extrabold text-animeo-dark">{upcomingStops.length} arrêt{upcomingStops.length > 1 ? "s" : ""} à venir</h3>
            {upcomingStops.length > 1 ? <p className="mt-0.5 text-xs text-animeo-muted">Glissez la poignée pour échanger l’heure de deux arrêts</p> : null}
          </div>
          <UpcomingStopsList
            upcomingStops={upcomingStops}
            allAppointments={appointments}
            onSwapRequested={(source, target) => setSwapConfirm({ source, target })}
          />
        </Card>
      ) : null}

      {completedStops.length > 0 ? (
        <Card className="overflow-hidden">
          <button
            type="button"
            onClick={() => setCompletedExpanded((current) => !current)}
            aria-expanded={completedExpanded}
            className="flex w-full items-center justify-between px-5 py-4 text-left"
          >
            <h3 className="font-extrabold text-animeo-dark">{completedStops.length} arrêt{completedStops.length > 1 ? "s" : ""} terminé{completedStops.length > 1 ? "s" : ""}</h3>
            <Icon name="arrow" className={`h-4 w-4 text-animeo-muted transition-transform ${completedExpanded ? "rotate-90" : "-rotate-90"}`} />
          </button>
          {completedExpanded ? (
            <div className="divide-y divide-[#edf2f0] border-t border-[#e5eeeb]">
              {completedStops.map((appointment) => (
                <div key={appointment.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold text-animeo-dark">{appointment.animalName} <span className="font-semibold text-animeo-muted">· {appointment.clientName}</span></p>
                    <p className="text-xs text-animeo-muted">Prévu à {appointment.time}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-animeo-soft px-2.5 py-1 text-[10px] font-black text-[#278064]">Terminé à {appointment.completedAt}</span>
                </div>
              ))}
            </div>
          ) : null}
        </Card>
      ) : null}

      {deleteConfirmOpen ? (
        <ConfirmModal
          title="Supprimer cette tournée ?"
          message={
            tour.appointmentCount > 0
              ? `« ${tour.name} » contient ${tour.appointmentCount} rendez-vous à sa prochaine occurrence. Ils resteront dans votre agenda mais ne seront plus rattachés à une tournée. Cette action est irréversible.`
              : `« ${tour.name} » sera définitivement supprimée. Cette action est irréversible.`
          }
          confirmLabel="Supprimer la tournée"
          onConfirm={onDelete}
          onClose={() => setDeleteConfirmOpen(false)}
        />
      ) : null}

      {reminderPrompt ? (
        <ConfirmModal
          title="Programmer un rappel ?"
          message={`Proposer un nouveau rendez-vous pour ${reminderPrompt.animalName} dans ${reminderPrompt.reminder.delay}, à partir de la prestation d’aujourd’hui.`}
          confirmLabel={`Programmer dans ${reminderPrompt.reminder.delay}`}
          cancelLabel="Non merci"
          destructive={false}
          onConfirm={confirmReminder}
          onClose={declineReminder}
        />
      ) : null}

      {swapConfirm ? (
        <ConfirmModal
          title="Échanger ces deux arrêts ?"
          message={`Échanger ${swapConfirm.source.time} ${swapConfirm.source.animalName} (${swapConfirm.source.city}) et ${swapConfirm.target.time} ${swapConfirm.target.animalName} (${swapConfirm.target.city}) ?`}
          confirmLabel={swapping ? "Échange…" : "Échanger"}
          cancelLabel="Annuler"
          destructive={false}
          onConfirm={confirmSwap}
          onClose={() => setSwapConfirm(null)}
        />
      ) : null}
    </div>
  );
}

function CurrentStopCard({ appointment, completing, onComplete }: { appointment: TourAppointment; completing: boolean; onComplete: () => void }) {
  const telHref = appointment.phone ? toTelHref(appointment.phone) : null;
  const goHref = appointment.coordinates ? buildSingleStopMapsUrl(appointment.coordinates) : null;

  return (
    <Card className="overflow-hidden border-2 border-animeo bg-animeo-soft/40">
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-2xl font-black text-animeo-dark">{appointment.time}</p>
            <h3 className="mt-1 text-lg font-extrabold text-animeo-dark">{appointment.animalName}{appointment.species ? <span className="font-bold text-animeo-muted"> · {appointment.species}</span> : null}</h3>
            <p className="text-sm font-bold text-animeo-muted">{appointment.clientName}</p>
          </div>
          <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-animeo-dark shadow-sm">Domicile</span>
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-sm font-semibold text-animeo-dark">
          <Icon name="map" className="mt-0.5 h-4 w-4 shrink-0 text-animeo" />
          {appointment.address}
          {!appointment.coordinates ? <span className="font-bold text-[#a9573b]"> · Position inconnue</span> : null}
        </p>
        <p className="mt-2 text-sm text-animeo-muted">{appointment.service} · {appointment.duration} min · {formatEuros(appointment.price)}</p>

        <div className="mt-5 flex flex-wrap gap-2">
          {telHref ? (
            <a href={telHref} className="inline-flex min-h-11 flex-1 basis-[140px] items-center justify-center gap-1.5 rounded-xl bg-white px-3 text-sm font-extrabold text-animeo-dark shadow-sm transition hover:bg-animeo-bg">
              <PhoneIcon />
              Appeler
            </a>
          ) : null}
          {goHref ? (
            <a href={goHref} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 flex-1 basis-[140px] items-center justify-center gap-1.5 rounded-xl bg-white px-3 text-sm font-extrabold text-animeo-dark shadow-sm transition hover:bg-animeo-bg">
              <Icon name="car" className="h-4 w-4" />
              Y aller
            </a>
          ) : null}
          <button
            type="button"
            onClick={onComplete}
            disabled={completing}
            className="inline-flex min-h-11 flex-1 basis-[140px] items-center justify-center gap-1.5 rounded-xl bg-animeo px-3 text-sm font-extrabold text-white transition hover:bg-[#459e90] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {completing ? "Enregistrement…" : "Terminé"}
          </button>
        </div>
      </div>
    </Card>
  );
}

/**
 * Glisser-déposer via Pointer Events plutôt que l'API HTML5 Drag and Drop :
 * un seul chemin de code pour souris, tactile et stylet (le mode tournée est
 * d'abord pensé pour un téléphone), sans dépendance supplémentaire pour un
 * geste aussi ciblé (mode tournée, phase 2b). La poignée capture le
 * pointeur ; la ligne survolée est retrouvée par comparaison de
 * getBoundingClientRect(), pas par élément sous le curseur.
 */
function UpcomingStopsList({ upcomingStops, allAppointments, onSwapRequested }: {
  upcomingStops: TourAppointment[];
  allAppointments: TourAppointment[];
  onSwapRequested: (source: TourAppointment, target: TourAppointment) => void;
}) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const rowElements = useRef(new Map<string, HTMLElement>());

  function rowIdAtY(clientY: number): string | null {
    for (const [id, element] of rowElements.current) {
      const rect = element.getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) return id;
    }
    return null;
  }

  function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>, id: string) {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggedId(id);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    if (!draggedId) return;
    const hoveredId = rowIdAtY(event.clientY);
    setDropTargetId(hoveredId && hoveredId !== draggedId ? hoveredId : null);
  }

  function handlePointerUp() {
    if (draggedId && dropTargetId) {
      const source = upcomingStops.find((item) => item.id === draggedId);
      const target = upcomingStops.find((item) => item.id === dropTargetId);
      if (source && target) onSwapRequested(source, target);
    }
    setDraggedId(null);
    setDropTargetId(null);
  }

  return (
    <div className="divide-y divide-[#edf2f0]">
      {upcomingStops.map((appointment) => {
        const index = allAppointments.findIndex((item) => item.id === appointment.id);
        return (
          <UpcomingStopRow
            key={appointment.id}
            appointment={appointment}
            distance={distanceFromPrevious(allAppointments, index)}
            dragging={draggedId === appointment.id}
            dropTarget={dropTargetId === appointment.id}
            rowRef={(element) => {
              if (element) rowElements.current.set(appointment.id, element);
              else rowElements.current.delete(appointment.id);
            }}
            onHandlePointerDown={(event) => handlePointerDown(event, appointment.id)}
            onHandlePointerMove={handlePointerMove}
            onHandlePointerUp={handlePointerUp}
          />
        );
      })}
    </div>
  );
}

function UpcomingStopRow({ appointment, distance, dragging, dropTarget, rowRef, onHandlePointerDown, onHandlePointerMove, onHandlePointerUp }: {
  appointment: TourAppointment;
  distance: string | null;
  dragging: boolean;
  dropTarget: boolean;
  rowRef: (element: HTMLDivElement | null) => void;
  onHandlePointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onHandlePointerMove: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onHandlePointerUp: (event: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const telHref = appointment.phone ? toTelHref(appointment.phone) : null;
  const goHref = appointment.coordinates ? buildSingleStopMapsUrl(appointment.coordinates) : null;
  const recordHref = appointment.clientId && appointment.animalId ? `/dashboard/clients/${appointment.clientId}?animal=${appointment.animalId}` : null;

  return (
    <div ref={rowRef} className={`transition-colors ${dragging ? "opacity-50" : ""} ${dropTarget ? "bg-animeo-soft" : ""}`}>
      <div className="flex items-center gap-1 pl-2">
        <button
          type="button"
          aria-label={`Glisser pour échanger l’heure de ${appointment.animalName} avec un autre arrêt`}
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerUp}
          className="flex h-11 w-8 shrink-0 cursor-grab touch-none items-center justify-center text-animeo-muted active:cursor-grabbing"
        >
          <GripIcon />
        </button>
        <button type="button" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded} className="flex min-h-11 flex-1 items-center justify-between gap-3 py-3 pr-5 text-left transition hover:bg-animeo-bg">
          <div className="min-w-0">
            <p className="text-sm font-black text-animeo-dark">{appointment.time} · {appointment.animalName}</p>
            <p className="truncate text-xs font-semibold text-animeo-muted">{appointment.clientName} · {appointment.city}{!appointment.coordinates ? " · Position inconnue" : ""}</p>
          </div>
          {distance ? <span className="shrink-0 text-xs font-bold text-animeo-muted">{distance}</span> : null}
        </button>
      </div>
      {expanded && (telHref || goHref || recordHref) ? (
        <div className="flex flex-wrap gap-2 px-5 pb-4 pl-10">
          {telHref ? (
            <a href={telHref} className="inline-flex min-h-11 flex-1 basis-[110px] items-center justify-center gap-1.5 rounded-xl bg-animeo-bg px-3 text-xs font-extrabold text-animeo-dark transition hover:bg-animeo-soft">
              <PhoneIcon />
              Appeler
            </a>
          ) : null}
          {goHref ? (
            <a href={goHref} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 flex-1 basis-[110px] items-center justify-center gap-1.5 rounded-xl bg-animeo-bg px-3 text-xs font-extrabold text-animeo-dark transition hover:bg-animeo-soft">
              <Icon name="car" className="h-4 w-4" />
              Y aller
            </a>
          ) : null}
          {recordHref ? (
            <Link href={recordHref} className="inline-flex min-h-11 flex-1 basis-[110px] items-center justify-center gap-1.5 rounded-xl bg-animeo-bg px-3 text-xs font-extrabold text-animeo-dark transition hover:bg-animeo-soft">
              <Icon name="paw" className="h-4 w-4" />
              Voir la fiche
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function GripIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}
