"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { saveAppointmentAction, updateAppointmentStatusAction, type SaveAppointmentInput } from "@/lib/appointments-actions";
import type { Appointment, AppointmentStatus } from "@/data/appointments";

type ActionOutcome = { ok: boolean; error?: string };

type AppointmentsContextValue = {
  appointments: Appointment[];
  managerOpen: boolean;
  selectedAppointmentId: string | null;
  creatingAppointment: boolean;
  // Pré-remplit la date du formulaire de création avec le jour pertinent
  // pour la vue d'où le clic est parti (jour affiché, jour sélectionné dans
  // le calendrier mois, aujourd'hui/1er janvier en année) — voir
  // AgendaView.smartDefaultDateId. Absent (undefined) quand la création est
  // ouverte sans contexte de date (ex. depuis le gestionnaire global).
  newAppointmentDefaultDate: string | undefined;
  openManager: (appointmentId?: string) => void;
  openNewAppointment: (defaultDate?: string) => void;
  closeManager: () => void;
  saveAppointment: (input: SaveAppointmentInput) => Promise<ActionOutcome>;
  updateAppointmentStatus: (appointmentId: string, status: AppointmentStatus) => Promise<ActionOutcome>;
};

const AppointmentsContext = createContext<AppointmentsContextValue | null>(null);

export function AppointmentsProvider({ children, initialAppointments }: { children: ReactNode; initialAppointments: Appointment[] }) {
  const [appointments, setAppointments] = useState<Appointment[]>(initialAppointments);
  // Ajustement pendant le rendu plutôt que dans un effet (pattern React
  // recommandé pour resynchroniser un état sur une prop qui change) : c'est
  // ce qui permet à une demande de rendez-vous arrivée par la page publique
  // d'apparaître dans la cloche de notifications dès le prochain
  // router.refresh() périodique (voir DashboardRealtimeRefresh), sans
  // rechargement manuel.
  const [syncedInitialAppointments, setSyncedInitialAppointments] = useState(initialAppointments);
  if (initialAppointments !== syncedInitialAppointments) {
    setSyncedInitialAppointments(initialAppointments);
    setAppointments(initialAppointments);
  }
  const [managerOpen, setManagerOpen] = useState(false);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [creatingAppointment, setCreatingAppointment] = useState(false);
  const [newAppointmentDefaultDate, setNewAppointmentDefaultDate] = useState<string | undefined>(undefined);

  function openManager(appointmentId?: string) {
    setSelectedAppointmentId(appointmentId ?? null);
    setCreatingAppointment(false);
    setManagerOpen(true);
  }

  function openNewAppointment(defaultDate?: string) {
    setSelectedAppointmentId(null);
    setCreatingAppointment(true);
    setNewAppointmentDefaultDate(defaultDate);
    setManagerOpen(true);
  }

  function closeManager() {
    setManagerOpen(false);
    setSelectedAppointmentId(null);
    setCreatingAppointment(false);
    setNewAppointmentDefaultDate(undefined);
  }

  // Ne notifie jamais elle-même (ni succès ni erreur) : partagée par des
  // appelants aux besoins différents — la modale (GlobalAppointmentsManager)
  // affiche déjà son erreur en ligne (role="alert", un conflit de créneau
  // doit rester dans le formulaire pour en choisir un autre) et toaste son
  // propre succès générique ; le glisser-déposer (week-planner.tsx) toaste
  // un message plus précis (jour/heure exacts). Router la notification ici
  // empêcherait ces deux appelants de personnaliser leur message.
  async function saveAppointment(input: SaveAppointmentInput): Promise<ActionOutcome> {
    const result = await saveAppointmentAction(input);
    if (!result.ok) return { ok: false, error: result.error };

    setAppointments((current) => current.some((item) => item.id === result.appointment.id)
      ? current.map((item) => item.id === result.appointment.id ? result.appointment : item)
      : [...current, result.appointment]);
    setSelectedAppointmentId(result.appointment.id);
    setCreatingAppointment(false);
    return { ok: true };
  }

  async function updateAppointmentStatus(appointmentId: string, status: AppointmentStatus): Promise<ActionOutcome> {
    const result = await updateAppointmentStatusAction(appointmentId, status);
    if (!result.ok) return { ok: false, error: result.error };

    setAppointments((current) => current.map((item) => item.id === appointmentId ? result.appointment : item));
    return { ok: true };
  }

  const value: AppointmentsContextValue = {
    appointments,
    managerOpen,
    selectedAppointmentId,
    creatingAppointment,
    newAppointmentDefaultDate,
    openManager,
    openNewAppointment,
    closeManager,
    saveAppointment,
    updateAppointmentStatus,
  };

  return <AppointmentsContext.Provider value={value}>{children}</AppointmentsContext.Provider>;
}

export function useAppointments() {
  const context = useContext(AppointmentsContext);
  if (!context) throw new Error("useAppointments doit être utilisé dans AppointmentsProvider");
  return context;
}
