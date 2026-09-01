"use client";

import { Icon } from "@/components/ui/icon";
import type { Tour, Zone } from "@/data/tours";

type TourDetailProps = {
  tour: Tour | null;
  zones: Zone[];
  cabinetAddress: string | null;
  onEdit: () => void;
  onBack?: () => void;
};

export function TourDetail({ tour, zones, cabinetAddress, onEdit, onBack }: TourDetailProps) {
  if (!tour) {
    return (
      <div className="flex min-h-[320px] flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-[#c9dbd6] p-8 text-center">
        <Icon name="tournees" className="h-8 w-8 text-animeo-muted" />
        <p className="mt-3 text-sm text-animeo-muted">Sélectionnez une tournée à gauche, ou créez-en une nouvelle.</p>
      </div>
    );
  }

  const tourZones = zones.filter((zone) => tour.zoneIds.includes(zone.id));
  const departure = tour.startType === "Cabinet" ? (cabinetAddress ?? "Cabinet") : (tour.startAddress ?? "Adresse personnalisée");

  return (
    <div className="flex-1">
      {onBack ? (
        <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-animeo-muted hover:text-animeo-dark lg:hidden">← Retour</button>
      ) : null}

      <div className="flex items-start justify-between gap-3">
        <h1 className="text-[18px] font-medium text-animeo-dark">{tour.name}</h1>
        <button type="button" onClick={onEdit} className="shrink-0 text-xs font-medium text-animeo-muted underline-offset-2 hover:text-animeo hover:underline">Modifier</button>
      </div>

      <p className="mt-1 text-[13px] text-animeo-muted">
        {tour.status === "Inactive" ? (
          "Tournée inactive"
        ) : tour.nextOccurrenceLabel ? (
          `Prochaine occurrence : ${tour.nextOccurrenceLabel} · ${tour.startTime} → ${tour.endTime}`
        ) : (
          "Aucune occurrence à venir"
        )}
      </p>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-animeo-bg p-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-animeo-muted">Arrêts</p>
          <p className="mt-1 text-[20px] font-medium text-animeo-dark">{tour.appointmentCount}</p>
        </div>
        <div className="rounded-xl bg-animeo-bg p-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-animeo-muted">Zones</p>
          <p className="mt-1 truncate text-[13px] font-medium text-animeo-dark" title={tourZones.map((zone) => zone.name).join(", ")}>
            {tourZones.length > 0 ? tourZones.map((zone) => zone.name).join(", ") : "—"}
          </p>
        </div>
        <div className="rounded-xl bg-animeo-bg p-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-animeo-muted">Départ</p>
          <p className="mt-1 truncate text-[13px] font-medium text-animeo-dark" title={departure}>{departure}</p>
        </div>
      </div>

      {tour.note ? (
        <p className="mt-4 rounded-xl bg-[#fff9ec] border border-[#f1d89f] p-3 text-xs text-[#8c6118]">{tour.note}</p>
      ) : null}

      <div className="mt-6 rounded-2xl border border-dashed border-[#c9dbd6] p-6 text-center text-sm text-animeo-muted">
        Timeline des arrêts et itinéraire — étape suivante.
      </div>
    </div>
  );
}
