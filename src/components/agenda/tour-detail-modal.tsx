"use client";

import { useEffect } from "react";
import { TourDetail } from "@/components/tours/tour-detail";
import type { Tour, TourAppointment, Zone } from "@/data/tours";

type TourDetailModalProps = {
  tour: Tour;
  zone?: Zone;
  appointments: TourAppointment[];
  onClose: () => void;
  onRoute: () => void;
  onDelete: () => void;
};

export function TourDetailModal({ tour, zone, appointments, onClose, onRoute, onDelete }: TourDetailModalProps) {
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
        <TourDetail tour={tour} zone={zone} appointments={appointments} onBack={onClose} onRoute={onRoute} onDelete={onDelete} />
      </div>
    </div>
  );
}
