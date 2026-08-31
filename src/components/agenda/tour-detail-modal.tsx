"use client";

import { useEffect } from "react";
import { TourDetail } from "@/components/tours/tour-detail";
import type { Coordinates, Tour, TourAppointment, Zone } from "@/data/tours";

type TourDetailModalProps = {
  tour: Tour;
  zone?: Zone;
  appointments: TourAppointment[];
  cabinetCoordinates: Coordinates | null;
  onClose: () => void;
  onDelete: () => void;
};

export function TourDetailModal({ tour, zone, appointments, cabinetCoordinates, onClose, onDelete }: TourDetailModalProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#102f37]/55 p-4 backdrop-blur-sm" role="presentation">
      <div className="mx-auto max-w-5xl py-6">
        <TourDetail tour={tour} zone={zone} appointments={appointments} cabinetCoordinates={cabinetCoordinates} onBack={onClose} onDelete={onDelete} />
      </div>
    </div>
  );
}
