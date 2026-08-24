"use client";

import { useEffect, useState } from "react";

export type ManualAvailability = {
  cabinet: ModeAvailability;
  home: ModeAvailability;
};

export type ClosureDuration = "1 heure" | "2 heures" | "Demi-journée" | "Journée entière" | "Plusieurs jours" | "Horaire personnalisé" | "Jusqu’à réouverture manuelle";
export type AvailabilityMode = "cabinet" | "home";

export type ModeAvailability = {
  open: boolean;
  date: string;
  endDate: string;
  duration: ClosureDuration;
  startTime: string;
  endTime: string;
};

const STORAGE_KEY = "animeo-manual-availability";
const defaultAvailability: ManualAvailability = {
  cabinet: { open: true, date: "2026-08-24", endDate: "2026-08-25", duration: "Journée entière", startTime: "09:00", endTime: "18:00" },
  home: { open: true, date: "2026-08-24", endDate: "2026-08-25", duration: "Journée entière", startTime: "09:00", endTime: "18:00" },
};

export function useManualAvailability() {
  const [availability, setAvailabilityState] = useState<ManualAvailability>(defaultAvailability);

  useEffect(() => {
    function readStoredAvailability() {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) setAvailabilityState(normalizeAvailability(JSON.parse(stored) as Record<string, unknown>));
      } catch {
        // Les deux modes restent ouverts si le stockage local est indisponible.
      }
    }

    queueMicrotask(readStoredAvailability);
    window.addEventListener("storage", readStoredAvailability);
    return () => window.removeEventListener("storage", readStoredAvailability);
  }, []);

  function setModeAvailability(mode: AvailabilityMode, value: ModeAvailability) {
    saveAvailability({ ...availability, [mode]: value });
  }

  function saveAvailability(next: ManualAvailability) {
    setAvailabilityState(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Le réglage reste actif pendant la session si le stockage est bloqué.
    }
  }

  return { availability, setModeAvailability };
}

function normalizeAvailability(stored: Record<string, unknown>): ManualAvailability {
  const legacyDate = typeof stored.date === "string" ? stored.date : "2026-08-24";
  const legacyDuration = isClosureDuration(stored.duration) ? stored.duration : "Journée entière";

  return {
    cabinet: normalizeMode(stored.cabinet, legacyDate, legacyDuration),
    home: normalizeMode(stored.home, legacyDate, legacyDuration),
  };
}

function normalizeMode(value: unknown, date: string, duration: ClosureDuration): ModeAvailability {
  if (typeof value === "boolean") return { open: value, date, endDate: date, duration, startTime: "09:00", endTime: "18:00" };
  if (value && typeof value === "object") {
    const mode = value as Partial<ModeAvailability>;
    return {
      open: typeof mode.open === "boolean" ? mode.open : true,
      date: typeof mode.date === "string" ? mode.date : date,
      endDate: typeof mode.endDate === "string" ? mode.endDate : typeof mode.date === "string" ? mode.date : date,
      duration: isClosureDuration(mode.duration) ? mode.duration : duration,
      startTime: typeof mode.startTime === "string" ? mode.startTime : "09:00",
      endTime: typeof mode.endTime === "string" ? mode.endTime : "18:00",
    };
  }
  return { open: true, date, endDate: date, duration, startTime: "09:00", endTime: "18:00" };
}

function isClosureDuration(value: unknown): value is ClosureDuration {
  return ["1 heure", "2 heures", "Demi-journée", "Journée entière", "Plusieurs jours", "Horaire personnalisé", "Jusqu’à réouverture manuelle"].includes(String(value));
}
