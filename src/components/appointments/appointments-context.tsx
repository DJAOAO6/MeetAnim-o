"use client";

import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { getAppointmentsInRangeAction, saveAppointmentAction, updateAppointmentStatusAction, type SaveAppointmentInput } from "@/lib/appointments-actions";
import type { Appointment, AppointmentMode, AppointmentStatus } from "@/data/appointments";

/**
  * `appointment` n'est présent qu'en cas de succès : il sert aux appelants
  * qui enchaînent sur le rendez-vous tout juste enregistré — le rattachement
  * à une tournée a besoin de son identifiant, qui n'existe pas avant.
  */
type ActionOutcome = { ok: boolean; error?: string; appointment?: Appointment };

/** Période de rendez-vous, bornes incluses (YYYY-MM-DD). */
export type AppointmentRange = { from: string; to: string };

type AppointmentsContextValue = {
  /**
   * Rendez-vous chargés — une fenêtre autour d'aujourd'hui, plus ce qui a
   * été demandé depuis (ensureRange). Pas tout l'historique.
   */
  appointments: Appointment[];
  /** Période couverte par `appointments`. */
  loadedRange: AppointmentRange;
  /**
   * S'assure que les rendez-vous de cette période sont chargés, en ne
   * demandant au serveur que ce qui manque. À appeler par tout écran qui
   * sort de la fenêtre de départ.
   */
  ensureRange: (from: string, to: string) => Promise<void>;
  managerOpen: boolean;
  selectedAppointmentId: string | null;
  creatingAppointment: boolean;
  // Pré-remplit la date du formulaire de création avec le jour pertinent
  // pour la vue d'où le clic est parti (jour affiché, jour sélectionné dans
  // le calendrier mois, aujourd'hui/1er janvier en année) — voir
  // AgendaView.smartDefaultDateId. Absent (undefined) quand la création est
  // ouverte sans contexte de date (ex. depuis le gestionnaire global).
  newAppointmentDefaultDate: string | undefined;
  /** Créneau choisi dans la grille de l'agenda — voir AppointmentPrefill. */
  newAppointmentPrefill: AppointmentPrefill | undefined;
  openManager: (appointmentId?: string) => void;
  openNewAppointment: (defaultDate?: string, prefill?: AppointmentPrefill) => void;
  closeManager: () => void;
  saveAppointment: (input: SaveAppointmentInput) => Promise<ActionOutcome>;
  updateAppointmentStatus: (appointmentId: string, status: AppointmentStatus) => Promise<ActionOutcome>;
};

/**
 * Créneau déjà choisi avant d'ouvrir le formulaire.
 *
 * Sert à la sélection dans la grille de l'agenda : une plage tracée à la
 * souris ne doit pas être ressaisie dans le formulaire. Tous les champs sont
 * facultatifs — ouvrir « Nouveau rendez-vous » depuis un bouton n'en fournit
 * aucun, et le formulaire garde alors ses valeurs par défaut.
 */
export type AppointmentPrefill = {
  date?: string;
  start?: string;
  duration?: number;
  mode?: AppointmentMode;
};

const AppointmentsContext = createContext<AppointmentsContextValue | null>(null);

export function AppointmentsProvider({ children, initialAppointments, initialRange }: { children: ReactNode; initialAppointments: Appointment[]; initialRange: AppointmentRange }) {
  const [appointments, setAppointments] = useState<Appointment[]>(initialAppointments);
  const [loadedRange, setLoadedRange] = useState<AppointmentRange>(initialRange);
  // Ajustement pendant le rendu plutôt que dans un effet (pattern React
  // recommandé pour resynchroniser un état sur une prop qui change) : c'est
  // ce qui permet à une demande de rendez-vous arrivée par la page publique
  // d'apparaître dans la cloche de notifications dès le prochain
  // router.refresh() périodique (voir DashboardRealtimeRefresh), sans
  // rechargement manuel.
  const [syncedInitialAppointments, setSyncedInitialAppointments] = useState(initialAppointments);
  if (initialAppointments !== syncedInitialAppointments) {
    setSyncedInitialAppointments(initialAppointments);
    // Le serveur ne renvoie que la fenêtre de départ : on la remplace, et on
    // garde ce qui a été chargé à la demande en dehors — sinon l'agenda
    // ouvert sur l'an dernier se viderait à chaque rafraîchissement.
    setAppointments((current) => [
      ...current.filter((item) => item.date < initialRange.from || item.date > initialRange.to),
      ...initialAppointments,
    ]);
  }
  const pendingRanges = useRef(new Set<string>());

  async function fetchRange(from: string, to: string) {
    const key = `${from}:${to}`;
    if (pendingRanges.current.has(key)) return;
    pendingRanges.current.add(key);
    try {
      const fetched = await getAppointmentsInRangeAction(from, to);
      setAppointments((current) => {
        const known = new Set(current.map((item) => item.id));
        return [...current, ...fetched.filter((item) => !known.has(item.id))];
      });
    } finally {
      pendingRanges.current.delete(key);
    }
  }

  async function ensureRange(from: string, to: string) {
    const missing: Array<[string, string]> = [];
    if (from < loadedRange.from) missing.push([from, shiftDay(loadedRange.from, -1)]);
    if (to > loadedRange.to) missing.push([shiftDay(loadedRange.to, 1), to]);
    if (missing.length === 0) return;
    // La période couverte reste d'un seul tenant, étendue avant le
    // chargement : un second appel pendant ce temps ne redemande rien.
    setLoadedRange((current) => ({ from: from < current.from ? from : current.from, to: to > current.to ? to : current.to }));
    await Promise.all(missing.map(([start, end]) => fetchRange(start, end)));
  }
  const [managerOpen, setManagerOpen] = useState(false);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [creatingAppointment, setCreatingAppointment] = useState(false);
  const [newAppointmentDefaultDate, setNewAppointmentDefaultDate] = useState<string | undefined>(undefined);
  const [newAppointmentPrefill, setNewAppointmentPrefill] = useState<AppointmentPrefill | undefined>(undefined);

  function openManager(appointmentId?: string) {
    setSelectedAppointmentId(appointmentId ?? null);
    setCreatingAppointment(false);
    setManagerOpen(true);
  }

  function openNewAppointment(defaultDate?: string, prefill?: AppointmentPrefill) {
    setSelectedAppointmentId(null);
    setCreatingAppointment(true);
    setNewAppointmentDefaultDate(prefill?.date ?? defaultDate);
    setNewAppointmentPrefill(prefill);
    setManagerOpen(true);
  }

  function closeManager() {
    setManagerOpen(false);
    setSelectedAppointmentId(null);
    setCreatingAppointment(false);
    setNewAppointmentDefaultDate(undefined);
    setNewAppointmentPrefill(undefined);
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
    return { ok: true, appointment: result.appointment };
  }

  async function updateAppointmentStatus(appointmentId: string, status: AppointmentStatus): Promise<ActionOutcome> {
    const result = await updateAppointmentStatusAction(appointmentId, status);
    if (!result.ok) return { ok: false, error: result.error };

    setAppointments((current) => current.map((item) => item.id === appointmentId ? result.appointment : item));
    return { ok: true };
  }

  const value: AppointmentsContextValue = {
    loadedRange,
    ensureRange,
    appointments,
    managerOpen,
    selectedAppointmentId,
    creatingAppointment,
    newAppointmentDefaultDate,
    newAppointmentPrefill,
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

function shiftDay(dateId: string, days: number): string {
  const date = new Date(`${dateId}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
