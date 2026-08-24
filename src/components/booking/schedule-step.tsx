"use client";

import type { FormEvent } from "react";
import { BookingActions, StepHeading } from "@/components/booking/booking-ui";
import { bookingDates, occupiedAgendaSlots, type BookingMode, type PublicProfessional, type PublicService } from "@/data/public-booking";

type ScheduleStepProps = {
  professional: PublicProfessional;
  mode: BookingMode;
  service: PublicService;
  zoneId: string | null;
  dateId: string | null;
  time: string | null;
  onDateChange: (dateId: string) => void;
  onTimeChange: (time: string) => void;
  onBack: () => void;
  onNext: () => void;
};

export function ScheduleStep({ professional, mode, service, zoneId, dateId, time, onDateChange, onTimeChange, onBack, onNext }: ScheduleStepProps) {
  const zone = professional.zones.find((item) => item.id === zoneId);
  const dates = mode === "HOME" ? bookingDates.filter((date) => date.zoneId === zoneId) : bookingDates;
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

      <div className="mt-6">
        <p className="mb-3 text-sm font-black text-animeo-dark">1. Choisissez une date</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
          {dates.map((date) => (
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
