"use client";

import { useState, type FormEvent } from "react";
import { BookingActions, StepHeading } from "@/components/booking/booking-ui";
import {
  bookingDates,
  bookingLimitDate,
  bookingStartDate,
  occupiedAgendaSlots,
  type BookingAddress,
  type BookingMode,
  type PublicProfessional,
  type PublicService,
} from "@/data/public-booking";
import { initialTours, mapClients, tourAppointments } from "@/data/tours";

type ScheduleStepProps = {
  professional: PublicProfessional;
  mode: BookingMode;
  service: PublicService;
  clientAddress: BookingAddress;
  zoneId: string | null;
  dateId: string | null;
  time: string | null;
  onDateChange: (dateId: string | null) => void;
  onTimeChange: (time: string | null) => void;
  onBack: () => void;
  onNext: () => void;
};

function normalizeLocation(value: string) {
  return value.trim().toLocaleLowerCase("fr-FR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[’']/g, "'");
}

export function ScheduleStep({ professional, mode, service, clientAddress, zoneId, dateId, time, onDateChange, onTimeChange, onBack, onNext }: ScheduleStepProps) {
  const zone = professional.zones.find((item) => item.id === zoneId);
  const activeTours = mode === "HOME"
    ? initialTours.filter((tour) => tour.zoneId === zoneId && tour.status === "Active")
    : [];
  const activeTourDays = new Set(activeTours.map((tour) => tour.day));
  const dates = mode === "HOME"
    ? bookingDates.filter((date) => date.zoneId === zoneId && activeTourDays.has(date.weekday))
    : bookingDates;
  const monthIds = [...new Set(dates.map((date) => date.id.slice(0, 7)))];
  const [selectedMonth, setSelectedMonth] = useState(monthIds[0] ?? "");
  const visibleDates = dates.filter((date) => date.id.startsWith(selectedMonth));
  const selectedDate = dates.find((date) => date.id === dateId);
  const availableSlots = selectedDate?.slots.filter((slot) => !(occupiedAgendaSlots[selectedDate.id] ?? []).includes(slot)) ?? [];
  const recommendedDates = mode === "HOME" ? dates.slice(0, 3) : [];
  const normalizedCity = normalizeLocation(clientAddress.city);
  const scheduledInCity = activeTours.flatMap((tour) => tourAppointments[tour.id] ?? []).filter((appointment) => normalizeLocation(appointment.city) === normalizedCity).length;
  const mappedInCity = mapClients.filter((client) => normalizeLocation(client.city) === normalizedCity).length;
  const nearbyLocationCount = scheduledInCity + mappedInCity;

  function selectDate(nextDateId: string) {
    setSelectedMonth(nextDateId.slice(0, 7));
    onDateChange(nextDateId);
    onTimeChange(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (dateId && time) onNext();
  }

  return (
    <form onSubmit={submit}>
      <StepHeading
        eyebrow="Étape 4 · Créneaux"
        title={mode === "HOME" ? "Les meilleurs créneaux pour votre secteur" : "Choisissez une date et une heure"}
        description={mode === "HOME" && zone
          ? `Les propositions sont calculées à partir de votre adresse à ${clientAddress.city}, des tournées actives et des lieux déjà présents sur la carte.`
          : "Les créneaux tiennent compte de l’agenda unique du professionnel."}
      />
      <div className="rounded-2xl bg-animeo-soft p-4 text-sm text-animeo-dark"><strong>{service.name}</strong> · {service.duration} minutes · {mode === "CABINET" ? "Au cabinet" : "À domicile"}</div>

      {mode === "HOME" && zone ? (
        <div className="mt-4 rounded-2xl border border-[#bfe1d8] bg-[#edf9f5] p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-animeo text-lg font-black text-white">⌖</span>
            <div>
              <p className="font-black text-[#24755f]">{zone.name} détectée</p>
              <p className="mt-1 text-sm leading-6 text-animeo-dark">
                {activeTours.length > 0
                  ? `${activeTours.map((tour) => tour.name).join(", ")} · passage le${activeTourDays.size > 1 ? "s" : ""} ${[...activeTourDays].join(" et ").toLocaleLowerCase("fr-FR")}.`
                  : "Aucune tournée n’est actuellement active dans cette zone."}
              </p>
              {nearbyLocationCount > 0 ? <p className="mt-2 text-sm font-extrabold text-animeo-dark">{nearbyLocationCount} passage{nearbyLocationCount > 1 ? "s" : ""} ou lieu{nearbyLocationCount > 1 ? "x" : ""} déjà identifié{nearbyLocationCount > 1 ? "s" : ""} à {clientAddress.city} : ces dates facilitent le regroupement des visites.</p> : null}
            </div>
          </div>
        </div>
      ) : null}

      {recommendedDates.length > 0 ? (
        <div className="mt-6">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-sm font-black text-animeo-dark">Dates recommandées</p>
              <p className="mt-1 text-xs text-animeo-muted">Les prochains passages dans votre secteur.</p>
            </div>
            <span className="rounded-full bg-animeo-soft px-3 py-1 text-xs font-black text-animeo">Trajet optimisé</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {recommendedDates.map((date) => (
              <button key={date.id} type="button" onClick={() => selectDate(date.id)} aria-pressed={dateId === date.id} className={`rounded-2xl border-2 p-4 text-left transition ${dateId === date.id ? "border-animeo bg-animeo-soft" : "border-[#bfe1d8] bg-[#f7fcfa] hover:border-animeo"}`}>
                <span className="block text-xs font-extrabold uppercase tracking-wide text-animeo">Tournée · {date.weekday}</span>
                <span className="mt-1 block text-lg font-black capitalize text-animeo-dark">{date.shortLabel}</span>
                <span className="mt-2 block text-xs font-bold text-animeo-muted">{nearbyLocationCount > 0 ? `Regroupement à ${clientAddress.city}` : zone?.name}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex items-start gap-3 rounded-2xl border border-[#dbe9e5] bg-white p-4 text-sm text-animeo-dark">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-animeo-soft text-xs font-black text-animeo">3M</span>
        <p><strong>Réservation jusqu’à 3 mois à l’avance :</strong><br /><span className="text-animeo-muted">créneaux disponibles du {formatRangeDate(bookingStartDate)} au {formatRangeDate(bookingLimitDate)}.</span></p>
      </div>

      {dates.length > 0 ? (
        <div className="mt-6">
          <p className="mb-3 text-sm font-black text-animeo-dark">1. Choisissez une date</p>
          <div className="mb-4 overflow-x-auto pb-1">
            <div className="flex min-w-max gap-2" aria-label="Choisir le mois">
              {monthIds.map((monthId) => (
                <button
                  key={monthId}
                  type="button"
                  aria-pressed={selectedMonth === monthId}
                  onClick={() => { setSelectedMonth(monthId); onDateChange(null); onTimeChange(null); }}
                  className={`rounded-xl px-4 py-2.5 text-sm font-extrabold capitalize transition ${selectedMonth === monthId ? "bg-animeo text-white" : "bg-animeo-bg text-animeo-dark hover:bg-animeo-soft"}`}
                >
                  {formatMonth(monthId)}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
            {visibleDates.map((date) => (
              <button key={date.id} type="button" onClick={() => selectDate(date.id)} aria-pressed={dateId === date.id} className={`min-h-24 rounded-2xl border-2 px-3 py-3 text-center transition ${dateId === date.id ? "border-animeo bg-animeo-soft" : "border-[#dfe9e6] hover:border-[#aad5cd]"}`}>
                {mode === "HOME" ? <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-animeo">Tournée</span> : null}
                <span className="block text-xs font-extrabold uppercase text-animeo-muted">{date.weekday}</span>
                <span className="mt-1 block font-black text-animeo-dark">{date.shortLabel}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {selectedDate ? (
        <div className="mt-6">
          <p className="mb-3 text-sm font-black text-animeo-dark">2. Choisissez une heure</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {availableSlots.map((slot) => <button key={slot} type="button" onClick={() => onTimeChange(slot)} aria-pressed={time === slot} className={`min-h-12 rounded-2xl border-2 px-4 py-3 font-black transition ${time === slot ? "border-animeo bg-animeo text-white" : "border-[#dfe9e6] text-animeo-dark hover:border-[#aad5cd]"}`}>{slot}</button>)}
          </div>
          <p className="mt-3 text-xs leading-5 text-animeo-muted">Les heures déjà occupées sont retirées : les rendez-vous au cabinet et à domicile partagent un seul agenda.</p>
        </div>
      ) : null}

      {dates.length === 0 ? <p className="mt-5 rounded-2xl bg-[#fff7f0] p-4 text-sm font-bold text-[#a85d32]">Aucune tournée active n’est disponible pour ce secteur. Revenez à l’étape précédente ou choisissez une consultation au cabinet.</p> : null}
      <BookingActions onBack={onBack} nextDisabled={!dateId || !time} />
    </form>
  );
}

function formatMonth(monthId: string) {
  const [year, month] = monthId.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1, 12));
}

function formatRangeDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(date);
}
