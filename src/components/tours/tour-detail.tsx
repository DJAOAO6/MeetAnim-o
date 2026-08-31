import Link from "next/link";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Icon } from "@/components/ui/icon";
import { SimulatedMap } from "@/components/tours/simulated-map";
import { toTelHref } from "@/lib/phone";
import { buildSingleStopMapsUrl, buildTourMapsLinks } from "@/lib/tour-maps";
import { formatTourEstimate } from "@/lib/tour-estimate";
import type { Coordinates, Tour, TourAppointment, Zone } from "@/data/tours";

type TourDetailProps = {
  tour: Tour;
  zone?: Zone;
  appointments: TourAppointment[];
  cabinetCoordinates: Coordinates | null;
  onBack: () => void;
  onDelete: () => void;
};

export function TourDetail({ tour, zone, appointments, cabinetCoordinates, onBack, onDelete }: TourDetailProps) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  // Un arrêt sans position réelle n'apparaît pas sur la carte (simulée) —
  // jamais de position devinée — mais reste listé dans le détail ci-dessous.
  const points = appointments
    .map((appointment, index) => ({ appointment, index }))
    .filter((entry): entry is { appointment: TourAppointment & { position: { x: number; y: number } }; index: number } => entry.appointment.position !== null)
    .map(({ appointment, index }) => ({
      id: appointment.id,
      x: appointment.position.x,
      y: appointment.position.y,
      label: `${index + 1}`,
      title: `${appointment.time} · ${appointment.animalName} · ${appointment.city}`,
      accent: "purple" as const,
    }));

  const mapsResult = buildTourMapsLinks(cabinetCoordinates, appointments);
  const estimateLabel = formatTourEstimate({ distanceKm: tour.estimatedDistanceKm, durationMinutes: tour.estimatedDurationMinutes, unlocatedStopCount: tour.unlocatedStopCount });

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
            <p className="mt-2 font-bold text-animeo-muted">{tour.dateLabel} · {tour.startTime} - {tour.endTime}</p>
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
        <div className="grid divide-y divide-[#e5eeeb] sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <TourMetric value={`${tour.appointmentCount}`} label="rendez-vous" />
          <TourMetric value={tour.consultationHours} label="de consultations" />
        </div>
        <p className="border-t border-[#e5eeeb] px-5 py-3 text-center text-sm font-bold text-animeo-muted sm:px-6">{estimateLabel}</p>
      </Card>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(340px,0.75fr)_minmax(0,1.25fr)]">
        <Card className="overflow-hidden">
          <div className="border-b border-[#e5eeeb] px-5 py-4">
            <h3 className="font-extrabold text-animeo-dark">Rendez-vous de la journée</h3>
            <p className="mt-0.5 text-xs text-animeo-muted">Ordre prévu, sans calcul de trajet réel</p>
          </div>
          {appointments.length > 0 ? (
            <div className="divide-y divide-[#edf2f0]">
              {appointments.map((appointment, index) => (
                <TourStopCard key={appointment.id} appointment={appointment} index={index} />
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-sm font-semibold text-animeo-muted">Aucun rendez-vous prévu dans cette tournée.</div>
          )}
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-extrabold text-animeo-dark">Aperçu de la journée</h3>
              <p className="mt-0.5 text-xs text-animeo-muted">Positions fictives des rendez-vous</p>
            </div>
            <span className="rounded-full bg-[#eeeaf8] px-3 py-1 text-[10px] font-black text-[#6c5598]">Simulation</span>
          </div>
          <SimulatedMap points={points} heightClassName="h-[520px]" />
        </Card>
      </div>

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
    </div>
  );
}

function TourStopCard({ appointment, index }: { appointment: TourAppointment; index: number }) {
  const telHref = appointment.phone ? toTelHref(appointment.phone) : null;
  const goHref = appointment.coordinates ? buildSingleStopMapsUrl(appointment.coordinates) : null;
  const recordHref = appointment.clientId && appointment.animalId ? `/dashboard/clients/${appointment.clientId}?animal=${appointment.animalId}` : null;

  return (
    <article className="flex gap-4 p-5">
      <div className="flex flex-col items-center">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#eeeaf8] text-xs font-black text-[#6c5598]">{index + 1}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-black text-animeo-dark">{appointment.time}</p>
            <h4 className="mt-1 font-extrabold text-animeo-dark">{appointment.animalName}</h4>
          </div>
          <span className="rounded-full bg-animeo-soft px-2.5 py-1 text-[10px] font-black text-animeo-dark">Domicile</span>
        </div>
        <p className="mt-1 text-sm font-bold text-animeo-muted">{appointment.service}</p>
        <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-animeo-muted">
          <Icon name="map" className="h-3.5 w-3.5 text-animeo" />
          {appointment.city} · {appointment.clientName}
          {!appointment.coordinates ? <span className="font-bold text-[#a9573b]">· Position inconnue</span> : null}
        </p>

        {telHref || goHref || recordHref ? (
          <div className="mt-3 flex flex-wrap gap-2">
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
    </article>
  );
}

function TourMetric({ value, label }: { value: string; label: string }) {
  return <div className="p-5 text-center"><p className="text-2xl font-black text-animeo-dark">{value}</p><p className="mt-1 text-xs font-bold text-animeo-muted">{label}</p></div>;
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
