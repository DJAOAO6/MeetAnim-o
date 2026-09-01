"use client";

import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import type { Tour, Zone } from "@/data/tours";

type TourListProps = {
  tours: Tour[];
  zones: Zone[];
  selectedTourId: string | null;
  onSelectTour: (id: string) => void;
  onNewTour: () => void;
  onOpenZonesPanel: () => void;
};

export function TourList({ tours, zones, selectedTourId, onSelectTour, onNewTour, onOpenZonesPanel }: TourListProps) {
  return (
    <div className="flex flex-col gap-4 lg:w-[220px] lg:shrink-0 xl:w-[240px]">
      <button
        type="button"
        onClick={onNewTour}
        className="inline-flex min-h-11 items-center justify-center self-start rounded-xl border border-animeo px-4 text-sm font-medium text-animeo transition hover:bg-animeo-soft"
      >
        + Nouvelle tournée
      </button>

      <Card className="overflow-hidden p-0">
        {tours.length === 0 ? (
          <p className="p-4 text-sm text-animeo-muted">Aucune tournée pour l’instant.</p>
        ) : (
          <ul>
            {tours.map((tour) => {
              const selected = tour.id === selectedTourId;
              const inactive = tour.status === "Inactive";
              return (
                <li key={tour.id} className="border-b border-[#edf2f0] last:border-b-0">
                  <button
                    type="button"
                    onClick={() => onSelectTour(tour.id)}
                    aria-current={selected ? "true" : undefined}
                    // border-left seul impose de repartir de border-radius: 0
                    // sur cette entrée précise (sinon le rendu du coin cassait).
                    className={`block min-h-11 w-full rounded-none px-4 py-2.5 text-left transition ${
                      selected ? "border-l-[3px] border-l-animeo bg-animeo-soft/70 pl-[13px]" : "border-l-[3px] border-l-transparent hover:bg-animeo-bg"
                    } ${inactive ? "opacity-55" : ""}`}
                  >
                    <p className="truncate text-[13px] font-medium text-animeo-dark">{tour.name}</p>
                    <p className="mt-0.5 text-xs text-animeo-muted">
                      {inactive ? "Inactive" : tour.day} · {tour.appointmentCount} arrêt{tour.appointmentCount > 1 ? "s" : ""}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <button
        type="button"
        onClick={onOpenZonesPanel}
        className="flex min-h-11 items-center justify-between rounded-xl border border-dashed border-[#c9dbd6] px-4 text-sm text-animeo-muted transition hover:border-animeo hover:text-animeo-dark"
      >
        <span>Zones ({zones.length})</span>
        <Icon name="settings" className="h-4 w-4" />
      </button>
    </div>
  );
}
