"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { initialAppointments, type Appointment } from "@/data/appointments";
import { bookingProfessionals, type PublicBookingRequest } from "@/data/public-booking";

type AppointmentsContextValue = {
  appointments: Appointment[];
  managerOpen: boolean;
  selectedAppointmentId: string | null;
  creatingAppointment: boolean;
  openManager: (appointmentId?: string) => void;
  openNewAppointment: () => void;
  closeManager: () => void;
  saveAppointment: (appointment: Appointment) => void;
  updateAppointment: (appointmentId: string, changes: Partial<Appointment>) => void;
};

const AppointmentsContext = createContext<AppointmentsContextValue | null>(null);
const STORAGE_KEY = "animeo-appointments";

export function AppointmentsProvider({ children }: { children: ReactNode }) {
  const [appointments, setAppointments] = useState<Appointment[]>(initialAppointments);
  const [storageReady, setStorageReady] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [creatingAppointment, setCreatingAppointment] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        const current = stored ? JSON.parse(stored) as Appointment[] : initialAppointments;
        const publicRequests = JSON.parse(localStorage.getItem("animeo-pending-bookings") ?? "[]") as PublicBookingRequest[];
        const knownIds = new Set(current.map((appointment) => appointment.id));
        const importedRequests = publicRequests.filter((request) => !knownIds.has(request.id)).map(publicRequestToAppointment);
        setAppointments([...current, ...importedRequests]);
      } catch {
        // Les données fictives restent disponibles si le stockage local est bloqué.
      }
      setStorageReady(true);
    });
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(appointments));
    } catch {
      // La gestion reste utilisable pendant la session sans stockage persistant.
    }
  }, [appointments, storageReady]);

  function openManager(appointmentId?: string) {
    setSelectedAppointmentId(appointmentId ?? null);
    setCreatingAppointment(false);
    setManagerOpen(true);
  }

  function openNewAppointment() {
    setSelectedAppointmentId(null);
    setCreatingAppointment(true);
    setManagerOpen(true);
  }

  function closeManager() {
    setManagerOpen(false);
    setSelectedAppointmentId(null);
    setCreatingAppointment(false);
  }

  function saveAppointment(appointment: Appointment) {
    setAppointments((current) => current.some((item) => item.id === appointment.id)
      ? current.map((item) => item.id === appointment.id ? appointment : item)
      : [...current, appointment]);
    setSelectedAppointmentId(appointment.id);
    setCreatingAppointment(false);
  }

  function updateAppointment(appointmentId: string, changes: Partial<Appointment>) {
    setAppointments((current) => current.map((appointment) => appointment.id === appointmentId ? { ...appointment, ...changes } : appointment));
    setSelectedAppointmentId(null);
  }

  const value: AppointmentsContextValue = {
    appointments,
    managerOpen,
    selectedAppointmentId,
    creatingAppointment,
    openManager,
    openNewAppointment,
    closeManager,
    saveAppointment,
    updateAppointment,
  };

  return <AppointmentsContext.Provider value={value}>{children}</AppointmentsContext.Provider>;
}

function publicRequestToAppointment(request: PublicBookingRequest): Appointment {
  const professional = bookingProfessionals.find((item) => item.slug === request.professionalSlug);
  const service = professional?.services.find((item) => item.id === request.serviceId);
  return {
    id: request.id,
    date: request.date,
    start: request.time,
    duration: service?.duration ?? 60,
    clientName: `${request.owner.firstName} ${request.owner.lastName}`.trim(),
    animalName: request.animal.name,
    serviceName: service?.name ?? request.serviceId,
    mode: request.mode === "CABINET" ? "cabinet" : "home",
    location: request.mode === "CABINET" ? "Cabinet" : request.address?.city ?? "Domicile",
    price: request.totalPrice,
    status: "pending",
    notes: "Demande reçue depuis la page publique de réservation.",
  };
}

export function useAppointments() {
  const context = useContext(AppointmentsContext);
  if (!context) throw new Error("useAppointments doit être utilisé dans AppointmentsProvider");
  return context;
}
