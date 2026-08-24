"use client";

import { useState, type FormEvent } from "react";
import { BookingActions, StepHeading } from "@/components/booking/booking-ui";
import { bookingDates, bookingLimitDate, bookingStartDate, occupiedAgendaSlots, type BookingMode, type PublicProfessional, type PublicService } from "@/data/public-booking";

type ScheduleStepProps = {
  professional: PublicProfessional;
  mode: BookingMode;
  service: PublicService;
  zoneId: string | null;
  dateId: string | null;
  time: string | null;
  onDateChange: (dateId: string | null) => void;
  onTimeChange: (time: string | null) => void;
  onBack: () => void;
  onNext: () => void;
};

export function ScheduleStep({ professional, mode, service, zoneId, dateId, time, onDateChange, onTimeChange, onBack, onNext }: ScheduleStepProps) {
  const zone = professional.zones.find((item) => item.id === zoneId);
  const dates = mode === "HOME" ? bookingDates.filter((date) => date.zoneId === zoneId) : bookingDates;
  const monthIds = [...new Set(dates.map((date) => date.id.slice(0, 7)))];
  const [selectedMonth, setSelectedMonth] = useState(monthIds[0] ?? "");
  const visibleDates = dates.filter((date) => date.id.startsWith(selectedMonth));
  const selectedDate = dates.find((date) => date.id === dateId);
  const availableSlots = selectedDate?.slots.filter((slot) => !(occupiedAgendaSlots[selectedDate.id] ?? []).includes(slot)) ?? [];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (dateId && time) onNext();
  }

  return (
    <form onSubmit={submit}>
      <StepHeading eyebrow="Étape 3 · Créneau" title="Choisissez une date et une heure" description={mode === "HOME" && zone ? `Les créneaux correspondent aux tournées de la ${zone.name}.` : "Les créneaux tiennent compte de l’agenda unique du professionnel."} />
      <div className="rounded-2xl bg-animeo-soft p-4 text-sm text-animeo-dark"><strong>{service.name}</strong> · {service.duration} minutes · {mode === "CABINET" ? "Au cabinet" : "À domicile"}</div>

      <div className="mt-4 flex items-start gap-3 rounded-2xl border border-[#dbe9e5] bg-white p-4 text-sm text-animeo-dark">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-animeo-soft font-black text-animeo">3</span>
        <p><strong>Réservation jusqu’à 3 mois à l’avance :</strong><br /><span className="text-animeo-muted">créneaux disponibles du {formatRangeDate(bookingStartDate)} au {formatRangeDate(bookingLimitDate)}.</span></p>
      </div>

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
            <button key={date.id} type="button" onClick={() => onDateChange(date.id)} aria-pressed={dateId === date.id} className={`min-h-20 rounded-2xl border-2 px-3 py-3 text-center transition ${dateId === date.id ? "border-animeo bg-animeo-soft" : "border-[#dfe9e6] hover:border-[#aad5cd]"}`}>
              <span className="block text-xs font-extrabold uppercase text-animeo-muted">{date.weekday}</span><span className="mt-1 block font-black text-animeo-dark">{date.shortLabel}</span>
            </button>
          ))}
        </div>
      </div>

      {selectedDate ? (
        <div className="mt-6">
          <p className="mb-3 text-sm font-black text-animeo-dark">2. Choisissez une heure</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {availableSlots.map((slot) => <button key={slot} type="button" onClick={() => onTimeChange(slot)} aria-pressed={time === slot} className={`min-h-12 rounded-2xl border-2 px-4 py-3 font-black transition ${time === slot ? "border-animeo bg-animeo text-white" : "border-[#dfe9e6] text-animeo-dark hover:border-[#aad5cd]"}`}>{slot}</button>)}
          </div>
          <p className="mt-3 text-xs leading-5 text-animeo-muted">Les heures déjà occupées sont retirées dans les deux modes : Cabinet et Domicile partagent un seul agenda.</p>
        </div>
      ) : null}

      {dates.length === 0 ? <p className="mt-5 rounded-2xl bg-[#fff7f0] p-4 text-sm font-bold text-[#a85d32]">Aucune tournée fictive n’est disponible pour cette zone.</p> : null}
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
