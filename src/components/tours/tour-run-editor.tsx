"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Icon } from "@/components/ui/icon";
import { useHasMounted } from "@/components/ui/use-has-mounted";
import { notify } from "@/lib/notify";
import { completeAppointmentAction, saveAppointmentAction, updateAppointmentStatusAction } from "@/lib/appointments-actions";
import { findMatchingZone } from "@/lib/booking-validation";
import { geocodeClientAddressAction } from "@/lib/clients-actions";
import { formatEuros, formatFrenchDate } from "@/lib/format";
import { haversineDistanceKm } from "@/lib/geo";
import { formatDistanceMeters, formatDurationSeconds } from "@/lib/maps/map-utils";
import { buildTourMapsLinks } from "@/lib/tour-maps";
import { AVERAGE_SPEED_KMH, ROAD_DETOUR_FACTOR } from "@/lib/tour-estimate";
import { TourRunTimeline } from "@/components/tours/tour-run-timeline";
import { TourRunEndpointPicker, type EndpointValue } from "@/components/tours/tour-run-endpoint-picker";
import { TourRunAddStopModal } from "@/components/tours/tour-run-add-stop-modal";
import { TourRunAddClientAppointmentModal, type ClientAppointmentInput } from "@/components/tours/tour-run-add-client-appointment-modal";
import { TourRunOptimizeModal } from "@/components/tours/tour-run-optimize-modal";
import { TourRunRemoveStopModal } from "@/components/tours/tour-run-remove-stop-modal";
import {
  addAppointmentStopsAction,
  addManualStopAction,
  applyOptimizationProposalAction,
  cancelStopAppointmentAction,
  createTourRunAction,
  deleteTourRunAction,
  dismissOptimizationProposalAction,
  moveStopAction,
  optimizeTourRunAction,
  recomputeRouteAction,
  removeStopAction,
  reorderStopsAction,
  reverseGeocodeAction,
  updateStopAction,
  updateStopScheduleAction,
  updateTourRunEndpointsAction,
  updateTourRunOptionsAction,
  type OptimizationComparison,
} from "@/lib/tour-runs-actions";
import type { AvailableAppointmentView, SavedPlaceView, TourPreferencesView, TourRunView, TourStopView } from "@/lib/tour-runs";
import type { TourRunMapClientPoint, TourRunMapPoint } from "@/components/tours/tour-run-map";
import type { MapClient } from "@/data/tours";
import type { ServiceSettings } from "@/data/settings";

// MapLibre s'appuie sur canvas/WebGL — jamais rendu côté serveur (même
// convention que RealMap/Leaflet pour la carte clients).
const TourRunMap = dynamic(() => import("@/components/tours/tour-run-map").then((mod) => mod.TourRunMap), { ssr: false });

type TourRunEditorProps = {
  dateId: string;
  tourRun: TourRunView | null;
  savedPlaces: SavedPlaceView[];
  preferences: TourPreferencesView;
  availableAppointments: AvailableAppointmentView[];
  cabinet: { address: string | null; latitude: number | null; longitude: number | null };
  mapClients: MapClient[];
  homeServices: ServiceSettings[];
  onClose: () => void;
};

function endpointFrom(value: TourRunView["start"]): EndpointValue {
  return { type: value.type as EndpointValue["type"], savedPlaceId: value.savedPlaceId, address: value.address, latitude: value.latitude, longitude: value.longitude, label: value.label };
}

function defaultEndpoint(type: string, savedPlaceId: string | null): EndpointValue {
  return { type: type as EndpointValue["type"], savedPlaceId, address: null, latitude: null, longitude: null, label: null };
}

export function TourRunEditor({ dateId, tourRun, savedPlaces, preferences, availableAppointments, cabinet, mapClients, homeServices, onClose }: TourRunEditorProps) {
  const router = useRouter();
  // Avant tout retour anticipé (branche "pas encore de tournée" ci-dessous) :
  // les Hooks doivent s'exécuter dans le même ordre à chaque rendu.
  const hasMounted = useHasMounted();
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"map" | "list">("list");
  const [addStopOpen, setAddStopOpen] = useState(false);
  const [showNearbyClients, setShowNearbyClients] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [addingClientStop, setAddingClientStop] = useState(false);
  const [appointmentModalOpen, setAppointmentModalOpen] = useState(false);
  // Phase 3 bis : survol d'un arrêt (timeline → marqueur), rayon du secteur
  // affiché autour de la tournée (calque clients), client en cours de
  // géocodage ("localiser cette adresse" pour un client sans position).
  const [hoveredStopId, setHoveredStopId] = useState<string | null>(null);
  const [sectorRadiusKm, setSectorRadiusKm] = useState(15);
  const [geocodingClientId, setGeocodingClientId] = useState<string | null>(null);
  const [optimizeComparison, setOptimizeComparison] = useState<OptimizationComparison | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [applyingOptimization, setApplyingOptimization] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [completingStopId, setCompletingStopId] = useState<string | null>(null);
  // Phase 3 ter (2/2) : retirer un arrêt lié à un rendez-vous propose un
  // choix (garder le rendez-vous vs l'annuler) plutôt qu'un seul bouton.
  const [removeChoiceStopId, setRemoveChoiceStopId] = useState<string | null>(null);
  const [removingStop, setRemovingStop] = useState(false);
  // Phase 3 ter : heure de départ éditable en mode édition (déjà éditable
  // seulement à la création) — resynchronisée depuis la vraie valeur après
  // chaque router.refresh() (succès comme échec serveur). Ajustement pendant
  // le rendu plutôt que dans un effet (même motif qu'ailleurs dans l'app —
  // notifications-bell.tsx), pas de cascade de rendus supplémentaire.
  const [departureTimeDraft, setDepartureTimeDraft] = useState(tourRun?.departureTime ?? "");
  const [lastKnownDepartureTime, setLastKnownDepartureTime] = useState(tourRun?.departureTime ?? "");
  if ((tourRun?.departureTime ?? "") !== lastKnownDepartureTime) {
    setLastKnownDepartureTime(tourRun?.departureTime ?? "");
    setDepartureTimeDraft(tourRun?.departureTime ?? "");
  }

  const [createName, setCreateName] = useState(`Tournée du ${formatFrenchDate(new Date(`${dateId}T00:00:00.000Z`))}`);
  const [createDeparture, setCreateDeparture] = useState(preferences.workHoursStart);
  const [createStart, setCreateStart] = useState<EndpointValue>(defaultEndpoint(preferences.defaultStartType, preferences.defaultStartSavedPlaceId));
  const [createEnd, setCreateEnd] = useState<EndpointValue>(
    preferences.returnToStart ? { type: "SAME_AS_START", savedPlaceId: null, address: null, latitude: null, longitude: null, label: null } : defaultEndpoint(preferences.defaultEndType, preferences.defaultEndSavedPlaceId),
  );

  async function refresh() {
    router.refresh();
  }

  async function runAction<T extends { ok: boolean; error?: string }>(action: () => Promise<T>): Promise<T> {
    setBusy(true);
    const result = await action();
    setBusy(false);
    if (!result.ok && result.error) notify.error(result.error);
    await refresh();
    return result;
  }

  async function handleCreate() {
    if (!createName.trim()) return;
    setBusy(true);
    const result = await createTourRunAction({ name: createName.trim(), dateId, departureTime: createDeparture, start: createStart, end: createEnd });
    setBusy(false);
    if (!result.ok) {
      notify.error(result.error);
      return;
    }
    notify.success("Tournée créée.");
    router.refresh();
  }

  // Survol OU sélection met en avant le même marqueur (phase 3 bis) — le
  // survol est transitoire et prioritaire sur la sélection réelle pour ce
  // seul usage visuel, jamais l'inverse.
  const highlightedStopId = hoveredStopId ?? selectedStopId;

  const mapPoints = useMemo<TourRunMapPoint[]>(() => {
    if (!tourRun) return [];
    const points: TourRunMapPoint[] = [];
    if (tourRun.resolvedStart.coordinates) points.push({ id: "start", lat: tourRun.resolvedStart.coordinates.lat, lng: tourRun.resolvedStart.coordinates.lng, label: "D", title: `Départ · ${tourRun.resolvedStart.label}`, color: "#183b45", kind: "start", draggable: true });
    tourRun.stops.forEach((stop, index) => {
      if (stop.latitude != null && stop.longitude != null) {
        // Phase 3 ter : jamais déplaçable pour un arrêt lié à un rendez-vous
        // (sa position vient de l'adresse du client) — seul un arrêt manuel
        // (type OTHER, sans appointmentId) peut être repositionné.
        points.push({ id: stop.id, lat: stop.latitude, lng: stop.longitude, label: String(index + 1), title: stop.label, color: stop.id === highlightedStopId ? "#e08a3e" : "#4FAF9F", kind: "stop", legDurationSeconds: stop.legDurationSeconds, draggable: !stop.appointmentId });
      }
    });
    if (tourRun.resolvedEnd.coordinates) points.push({ id: "end", lat: tourRun.resolvedEnd.coordinates.lat, lng: tourRun.resolvedEnd.coordinates.lng, label: "A", title: `Arrivée · ${tourRun.resolvedEnd.label}`, color: "#183b45", kind: "end", draggable: true });
    return points;
  }, [tourRun, highlightedStopId]);

  // Phase 3 ter : glisser un marqueur déplaçable (départ, arrivée, arrêt
  // manuel — jamais un arrêt lié à un rendez-vous, voir mapPoints ci-
  // dessus) — géocodage inverse pour un libellé lisible (même action que
  // "Position actuelle" dans TourRunEndpointPicker), puis persistance via
  // l'action serveur déjà existante pour ce type de point.
  async function handlePointDrag(pointId: string, coordinates: { lat: number; lng: number }) {
    if (!tourRun) return;
    const reverse = await reverseGeocodeAction({ latitude: coordinates.lat, longitude: coordinates.lng });
    const label = reverse.ok ? reverse.label : "Position choisie sur la carte";

    if (pointId === "start" || pointId === "end") {
      const nextEndpoint: EndpointValue = { type: "CUSTOM", savedPlaceId: null, address: label, latitude: coordinates.lat, longitude: coordinates.lng, label };
      const result = await runAction(() =>
        updateTourRunEndpointsAction({
          tourRunId: tourRun.id,
          departureTime: tourRun.departureTime,
          start: pointId === "start" ? nextEndpoint : endpointFrom(tourRun.start),
          end: pointId === "end" ? nextEndpoint : endpointFrom(tourRun.end),
        }),
      );
      if (result.ok) notify.success(`${pointId === "start" ? "Départ" : "Arrivée"} déplacé.`);
      return;
    }

    const result = await runAction(() => updateStopAction({ tourRunId: tourRun.id, stopId: pointId, latitude: coordinates.lat, longitude: coordinates.lng, address: label }));
    if (result.ok) notify.success("Arrêt déplacé.");
  }

  // Un client est "du secteur" s'il est dans une zone du motif (par nom de
  // ville — Client n'a pas de code postal en base) ou à moins de
  // sectorRadiusKm de l'un des points de la tournée (départ, arrêts,
  // arrivée) — jamais tous les clients de la base (phase 3 bis).
  const sectorMatch = useMemo(() => {
    const referencePoints = mapPoints.map((point) => ({ lat: point.lat, lng: point.lng }));
    return (client: MapClient): boolean => {
      if (tourRun?.templateZones && findMatchingZone(tourRun.templateZones, undefined, client.city)) return true;
      if (!client.coordinates || referencePoints.length === 0) return false;
      return referencePoints.some((point) => haversineDistanceKm(point, client.coordinates!) <= sectorRadiusKm);
    };
  }, [mapPoints, tourRun, sectorRadiusKm]);

  const sectorClients = useMemo(() => mapClients.filter((client) => client.coordinates != null && sectorMatch(client)), [mapClients, sectorMatch]);

  // Listés à part sous la carte plutôt que devinés à une position : voir
  // getMapClients (plus de repli par ville) et geocodeClientAddressAction
  // (bouton "localiser"). Uniquement ceux du secteur par zone (la
  // comparaison par rayon est impossible sans coordonnées).
  const unlocatedSectorClients = useMemo(
    () => (tourRun?.templateZones ? mapClients.filter((client) => client.coordinates == null && findMatchingZone(tourRun.templateZones!, undefined, client.city)) : []),
    [mapClients, tourRun],
  );

  const clientPoints = useMemo<TourRunMapClientPoint[]>(() => {
    if (!showNearbyClients) return [];
    return sectorClients.map((client): TourRunMapClientPoint => ({
      id: client.id,
      lat: client.coordinates!.lat,
      lng: client.coordinates!.lng,
      label: `${client.animalName} — ${client.ownerName}`,
      title: `${client.animalName} — ${client.ownerName} (${client.city})${client.dueForReminder ? " · À relancer" : ""}`,
      dueForReminder: client.dueForReminder,
    }));
  }, [sectorClients, showNearbyClients]);

  async function handleGeocodeClient(clientId: string) {
    setGeocodingClientId(clientId);
    const result = await geocodeClientAddressAction(clientId);
    setGeocodingClientId(null);
    if (!result.ok) {
      notify.error(result.error);
      return;
    }
    notify.success("Adresse localisée.");
    router.refresh();
  }

  const selectedClient = selectedClientId ? mapClients.find((client) => client.id === selectedClientId) ?? null : null;

  // Première heure libre estimée après le dernier arrêt (ou le départ, si
  // la journée est encore vide) — simple proposition affichée dans le
  // formulaire, jamais imposée : la vraie validation reste entièrement
  // celle de saveAppointmentAction (conflit, tampon de trajet), pas
  // recalculée ici. Même formule à vol d'oiseau que checkGeographicWarningAction
  // (tour-estimate.ts), pas une nouvelle logique.
  function suggestedStartFor(clientCoordinates: { lat: number; lng: number } | null): string | null {
    if (!tourRun) return null;
    const lastStop = tourRun.stops[tourRun.stops.length - 1];
    const baseTime = lastStop?.departureTime ?? tourRun.departureTime;
    if (!baseTime) return null;
    const [hours, minutes] = baseTime.split(":").map(Number);
    let totalMinutes = hours * 60 + minutes;
    const fromCoordinates = lastStop?.latitude != null && lastStop?.longitude != null
      ? { lat: lastStop.latitude, lng: lastStop.longitude }
      : tourRun.resolvedStart.coordinates;
    if (fromCoordinates && clientCoordinates) {
      totalMinutes += Math.round((haversineDistanceKm(fromCoordinates, clientCoordinates) * ROAD_DETOUR_FACTOR / AVERAGE_SPEED_KMH) * 60);
    }
    totalMinutes += tourRun.safetyBufferMinutes;
    const wrapped = ((totalMinutes % 1440) + 1440) % 1440;
    return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
  }

  const [clientAppointmentError, setClientAppointmentError] = useState<string | null>(null);

  // Crée un vrai rendez-vous à domicile (saveAppointmentAction — mêmes
  // contrôles de conflit et de tampon de trajet que partout ailleurs dans
  // l'app), puis l'attache à la journée comme un arrêt normal
  // (addAppointmentStopsAction, déjà utilisée par "+ Ajouter un arrêt") —
  // jamais un TourStop manuel sans rendez-vous derrière.
  async function handleCreateClientAppointment(input: ClientAppointmentInput) {
    if (!tourRun || !selectedClient) return;
    setAddingClientStop(true);
    setClientAppointmentError(null);
    const result = await saveAppointmentAction({
      date: dateId,
      start: input.start,
      duration: input.duration,
      clientId: selectedClient.clientId,
      clientName: selectedClient.ownerName,
      animalId: selectedClient.id,
      animalName: selectedClient.animalName,
      animalSpecies: selectedClient.species,
      serviceName: input.serviceName,
      mode: "home",
      location: selectedClient.address,
      city: selectedClient.city,
      latitude: selectedClient.coordinates?.lat,
      longitude: selectedClient.coordinates?.lng,
      price: input.price,
      status: "confirmed",
      notes: input.notes,
    });
    if (!result.ok) {
      setAddingClientStop(false);
      setClientAppointmentError(result.error);
      return;
    }
    const stopResult = await addAppointmentStopsAction({ tourRunId: tourRun.id, appointmentIds: [result.appointment.id] });
    setAddingClientStop(false);
    if (!stopResult.ok) notify.error(stopResult.error);
    notify.success("Rendez-vous créé et ajouté à la tournée.");
    setAppointmentModalOpen(false);
    setSelectedClientId(null);
    router.refresh();
  }

  // Unification des tournées, phase 3 : marque le rendez-vous lié à l'arrêt
  // comme réalisé — même action serveur que l'agenda (completeAppointmentAction),
  // jamais un chemin parallèle propre aux tournées.
  async function handleCompleteStop(stopId: string, appointmentId: string) {
    setCompletingStopId(stopId);
    const result = await completeAppointmentAction(appointmentId);
    setCompletingStopId(null);
    if (!result.ok) {
      notify.error(result.error);
      return;
    }
    notify.success("Consultation marquée comme réalisée.");
    router.refresh();
  }

  // Phase 3 ter (2/2) : "retirer" (garde le rendez-vous) et "annuler le
  // rendez-vous" (le supprime) sont deux gestes distincts — un arrêt
  // manuel (sans rendez-vous) se retire directement, rien à distinguer.
  function requestRemoveStop(stopId: string) {
    const stop = tourRun?.stops.find((candidate) => candidate.id === stopId);
    if (!stop) return;
    if (stop.appointmentId) setRemoveChoiceStopId(stopId);
    else handleRemoveFromTour(stopId);
  }

  async function handleRemoveFromTour(stopId: string) {
    if (!tourRun) return;
    const stop = tourRun.stops.find((candidate) => candidate.id === stopId);
    if (!stop) return;
    setRemovingStop(true);
    const result = await removeStopAction({ tourRunId: tourRun.id, stopId });
    setRemovingStop(false);
    setRemoveChoiceStopId(null);
    if (!result.ok) {
      notify.error(result.error);
      return;
    }
    notify.success(`« ${stop.label} » retiré de la tournée.`, { action: { label: "Annuler", onClick: () => undoRemoveStop(stop) } });
    router.refresh();
  }

  async function undoRemoveStop(stop: TourStopView) {
    if (!tourRun) return;
    const result = stop.appointmentId
      ? await addAppointmentStopsAction({ tourRunId: tourRun.id, appointmentIds: [stop.appointmentId] })
      : await addManualStopAction({ tourRunId: tourRun.id, type: stop.type as "OTHER", label: stop.label, address: stop.address, latitude: stop.latitude, longitude: stop.longitude, serviceDurationMinutes: stop.serviceDurationMinutes });
    if (!result.ok) {
      notify.error(result.error);
      return;
    }
    notify.success("Arrêt restauré.");
    router.refresh();
  }

  async function handleCancelStopAppointment(stopId: string) {
    if (!tourRun) return;
    const stop = tourRun.stops.find((candidate) => candidate.id === stopId);
    if (!stop || !stop.appointmentId) return;
    setRemovingStop(true);
    const result = await cancelStopAppointmentAction({ tourRunId: tourRun.id, stopId });
    setRemovingStop(false);
    setRemoveChoiceStopId(null);
    if (!result.ok) {
      notify.error(result.error);
      return;
    }
    notify.success(`Rendez-vous de « ${stop.label} » annulé.`, { action: { label: "Annuler", onClick: () => undoCancelStopAppointment(stop) } });
    router.refresh();
  }

  async function undoCancelStopAppointment(stop: TourStopView) {
    if (!tourRun || !stop.appointmentId) return;
    const statusResult = await updateAppointmentStatusAction(stop.appointmentId, "confirmed");
    if (!statusResult.ok) {
      notify.error(statusResult.error);
      return;
    }
    const stopResult = await addAppointmentStopsAction({ tourRunId: tourRun.id, appointmentIds: [stop.appointmentId] });
    if (!stopResult.ok) {
      notify.error(stopResult.error);
      return;
    }
    notify.success("Rendez-vous restauré.");
    router.refresh();
  }

  if (!tourRun) {
    return (
      <div className="space-y-6">
        <EditorHeader dateId={dateId} onClose={onClose} onChangeDate={(next) => router.push(`/dashboard/tournees?date=${next}`)} />
        <Card className="mx-auto max-w-lg p-6">
          <h2 className="text-lg font-black text-animeo-dark">Nouvelle tournée</h2>
          <p className="mt-1 text-sm text-animeo-muted">Définissez le départ et l’arrivée, vous pourrez ajouter vos arrêts juste après.</p>

          <div className="mt-5 space-y-4">
            <div>
              <label htmlFor="tour-run-name" className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.08em] text-animeo-muted">Nom</label>
              <input id="tour-run-name" type="text" value={createName} onChange={(event) => setCreateName(event.target.value)} className="min-h-11 w-full rounded-xl border border-[#d7e4e1] bg-white px-3 text-sm font-semibold text-animeo-dark" />
            </div>
            <div>
              <label htmlFor="tour-run-departure-time" className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.08em] text-animeo-muted">Heure de départ</label>
              <input id="tour-run-departure-time" type="time" value={createDeparture} onChange={(event) => setCreateDeparture(event.target.value)} className="min-h-11 w-full rounded-xl border border-[#d7e4e1] bg-white px-3 text-sm font-semibold text-animeo-dark" />
            </div>
            <TourRunEndpointPicker label="Départ" value={createStart} onChange={setCreateStart} savedPlaces={savedPlaces} cabinetAvailable={cabinet.latitude != null} />
            <TourRunEndpointPicker label="Arrivée" value={createEnd} onChange={setCreateEnd} savedPlaces={savedPlaces} cabinetAvailable={cabinet.latitude != null} allowMirrorStart />
          </div>

          <button type="button" onClick={handleCreate} disabled={busy || !createName.trim()} className="mt-6 w-full rounded-xl bg-animeo px-5 py-3 text-sm font-extrabold text-white transition hover:bg-[#459e90] disabled:cursor-not-allowed disabled:opacity-60">
            {busy ? "Création…" : "Créer la tournée"}
          </button>
        </Card>
      </div>
    );
  }

  const appointmentStopCount = tourRun.stops.filter((stop) => stop.type === "APPOINTMENT").length;
  const consultationMinutes = tourRun.stops.reduce((sum, stop) => sum + (stop.serviceDurationMinutes ?? 0), 0);
  const revenue = tourRun.stops.reduce((sum, stop) => sum + (stop.price ?? 0), 0);
  const lastStop = tourRun.stops[tourRun.stops.length - 1];
  const estimatedEnd = lastStop?.departureTime ?? tourRun.departureTime;
  const canOptimize = tourRun.stops.filter((stop) => stop.latitude != null && stop.longitude != null).length >= 2 && tourRun.resolvedStart.coordinates != null && tourRun.resolvedEnd.coordinates != null;

  // Unification des tournées, phase 3 : quatre états distincts plutôt qu'un
  // message générique (une journée à zéro arrêt n'est pas "terminée") —
  // seuls les arrêts liés à un rendez-vous comptent, un arrêt "autre" (pause,
  // fournisseur…) n'a pas de notion de réalisé.
  const appointmentStops = tourRun.stops.filter((stop) => stop.appointmentId);
  const completedAppointmentStops = appointmentStops.filter((stop) => stop.completedAt);
  const pendingAppointmentStops = appointmentStops.filter((stop) => !stop.completedAt);
  // "En cours" dépend de l'heure murale du navigateur — jamais calculé au
  // premier rendu serveur (toujours "à venir" tant que hasMounted est faux),
  // pour ne jamais désaccorder le rendu serveur du premier rendu client. Et
  // seulement pour la journée d'aujourd'hui : comparer une heure à
  // l'horloge murale n'a aucun sens pour une journée passée ou future (un
  // arrêt à 10h d'une tournée du mois prochain ne peut pas être "en cours"
  // simplement parce qu'il est 10h30 aujourd'hui).
  const isToday = dateId === new Date().toISOString().slice(0, 10);
  const nowHHMM = hasMounted && isToday ? new Date().toTimeString().slice(0, 5) : null;
  const currentStop = nowHHMM ? pendingAppointmentStops.find((stop) => stop.arrivalTime != null && stop.arrivalTime <= nowHHMM) ?? null : null;
  const progressStatus: "empty" | "completed" | "inProgress" | "upcoming" =
    appointmentStops.length === 0 ? "empty" :
    completedAppointmentStops.length === appointmentStops.length ? "completed" :
    currentStop ? "inProgress" :
    "upcoming";
  const progressLabel = {
    empty: "Aucun arrêt pour l’instant.",
    completed: "Tous les arrêts sont terminés.",
    inProgress: `Arrêt en cours : ${currentStop?.label ?? ""}`,
    upcoming: `${pendingAppointmentStops.length} arrêt${pendingAppointmentStops.length > 1 ? "s" : ""} à venir.`,
  }[progressStatus];

  const mapsResult = buildTourMapsLinks(
    tourRun.resolvedStart.coordinates,
    tourRun.stops.map((stop) => ({ coordinates: stop.latitude != null && stop.longitude != null ? { lat: stop.latitude, lng: stop.longitude } : null })),
  );

  async function handleOptimize() {
    setOptimizing(true);
    const result = await optimizeTourRunAction(tourRun!.id);
    setOptimizing(false);
    if (!result.ok) {
      notify.error(result.error);
      return;
    }
    setOptimizeComparison(result.comparison);
  }

  async function handleApplyOptimization() {
    setApplyingOptimization(true);
    await applyOptimizationProposalAction(tourRun!.id);
    setApplyingOptimization(false);
    setOptimizeComparison(null);
    notify.success("Proposition appliquée.");
    router.refresh();
  }

  async function handleDismissOptimization() {
    await dismissOptimizationProposalAction(tourRun!.id);
    setOptimizeComparison(null);
    router.refresh();
  }

  const timeline = (
    <TourRunTimeline
      stops={tourRun.stops}
      selectedId={selectedStopId}
      onSelect={setSelectedStopId}
      onHoverStop={setHoveredStopId}
      onReorder={(orderedStopIds) => runAction(() => reorderStopsAction({ tourRunId: tourRun.id, orderedStopIds }))}
      onMove={(stopId, direction) => runAction(() => moveStopAction({ tourRunId: tourRun.id, stopId, direction }))}
      onRemove={requestRemoveStop}
      onToggleFlexible={(stopId, flexible) => runAction(() => updateStopAction({ tourRunId: tourRun.id, stopId, flexible, locked: !flexible }))}
      onFindSolution={canOptimize ? handleOptimize : undefined}
      onComplete={handleCompleteStop}
      completingId={completingStopId}
      onEditSchedule={(stopId, patch) => runAction(() => updateStopScheduleAction({ tourRunId: tourRun.id, stopId, ...patch }))}
      onEditTimeWindow={(stopId, patch) => runAction(() => updateStopAction({ tourRunId: tourRun.id, stopId, timeWindowStart: patch.timeWindowStart, timeWindowEnd: patch.timeWindowEnd }))}
    />
  );

  return (
    <div className="space-y-6">
      <EditorHeader dateId={dateId} onClose={onClose} onChangeDate={(next) => router.push(`/dashboard/tournees?date=${next}`)} />

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-animeo-dark">{tourRun.name}</h2>
            <p className="mt-1 text-sm font-bold text-animeo-muted">
              {appointmentStopCount} RDV · {tourRun.totalDistanceMeters != null ? formatDistanceMeters(tourRun.totalDistanceMeters) : "—"}
              {tourRun.totalDurationSeconds != null ? ` · ${formatDurationSeconds(tourRun.totalDurationSeconds)} de route` : ""}
              {estimatedEnd ? ` · fin estimée ${estimatedEnd}` : ""}
              {revenue > 0 ? ` · ${formatEuros(revenue)} prévus` : ""}
            </p>
            {consultationMinutes > 0 ? <p className="mt-0.5 text-xs font-semibold text-animeo-muted">{Math.floor(consultationMinutes / 60)}h{String(consultationMinutes % 60).padStart(2, "0")} de consultations</p> : null}
            {tourRun.isRouteEstimate ? <p className="mt-1 text-xs font-bold text-[#8c6118]">≈ Estimation à vol d’oiseau — itinéraire réel indisponible pour le moment.</p> : null}
            <p className="mt-1.5 text-xs font-extrabold text-animeo-dark">{progressLabel}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {mapsResult.links.map((link) => (
              <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-animeo px-4 text-sm font-extrabold text-white transition hover:bg-[#459e90]">
                <Icon name="car" className="h-4 w-4" />
                {mapsResult.links.length > 1 ? link.label : "Itinéraire complet"}
              </a>
            ))}
            <button type="button" onClick={() => setAddStopOpen(true)} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-animeo-soft px-4 text-sm font-extrabold text-animeo-dark transition hover:bg-[#dceee9]">+ Ajouter un arrêt</button>
            {canOptimize ? (
              <button type="button" onClick={handleOptimize} disabled={optimizing} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[#d4e2df] px-4 text-sm font-extrabold text-animeo-dark transition hover:bg-animeo-bg disabled:opacity-60">
                {optimizing ? "Calcul…" : "✨ Optimiser"}
              </button>
            ) : null}
            <button type="button" onClick={() => runAction(() => recomputeRouteAction(tourRun.id))} disabled={busy} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[#d4e2df] px-4 text-sm font-extrabold text-animeo-dark transition hover:bg-animeo-bg disabled:opacity-60">Recalculer</button>
          </div>
        </div>
        {mapsResult.excludedStopCount > 0 ? (
          <p className="mt-2 text-xs font-bold text-[#a9573b]">
            {mapsResult.excludedStopCount > 1 ? `${mapsResult.excludedStopCount} arrêts sans adresse localisée ne sont pas dans l’itinéraire.` : "1 arrêt sans adresse localisée n’est pas dans l’itinéraire."}
          </p>
        ) : null}

        <div className="mt-5">
          <label htmlFor="tour-run-departure-time-edit" className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.08em] text-animeo-muted">Heure de départ</label>
          <input
            id="tour-run-departure-time-edit"
            type="time"
            value={departureTimeDraft}
            onChange={(event) => setDepartureTimeDraft(event.target.value)}
            onBlur={() => {
              if (departureTimeDraft && departureTimeDraft !== tourRun.departureTime) {
                runAction(() => updateTourRunEndpointsAction({ tourRunId: tourRun.id, departureTime: departureTimeDraft, start: endpointFrom(tourRun.start), end: endpointFrom(tourRun.end) }));
              }
            }}
            className="min-h-11 w-full max-w-[160px] rounded-xl border border-[#d7e4e1] bg-white px-3 text-sm font-bold text-animeo-dark"
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <TourRunEndpointPicker
            label="Départ"
            value={endpointFrom(tourRun.start)}
            onChange={(next) => runAction(() => updateTourRunEndpointsAction({ tourRunId: tourRun.id, departureTime: tourRun.departureTime, start: next, end: endpointFrom(tourRun.end) }))}
            savedPlaces={savedPlaces}
            cabinetAvailable={cabinet.latitude != null}
          />
          <TourRunEndpointPicker
            label="Arrivée"
            value={endpointFrom(tourRun.end)}
            onChange={(next) => runAction(() => updateTourRunEndpointsAction({ tourRunId: tourRun.id, departureTime: tourRun.departureTime, start: endpointFrom(tourRun.start), end: next }))}
            savedPlaces={savedPlaces}
            cabinetAvailable={cabinet.latitude != null}
            allowMirrorStart
            allowLastAppointment
          />
        </div>

        <button type="button" onClick={() => setAdvancedOpen((current) => !current)} className="mt-4 text-xs font-extrabold uppercase tracking-[0.08em] text-animeo">
          {advancedOpen ? "− Masquer les options avancées" : "+ Options avancées"}
        </button>
        {advancedOpen ? (
          <AdvancedOptions
            tourRun={tourRun}
            busy={busy}
            onSave={(patch) => runAction(() => updateTourRunOptionsAction({ tourRunId: tourRun.id, safetyBufferMinutes: tourRun.safetyBufferMinutes, lunchBreakEnabled: tourRun.lunchBreakEnabled, lunchBreakStart: tourRun.lunchBreakStart, lunchBreakEnd: tourRun.lunchBreakEnd, optimizationPreference: tourRun.optimizationPreference as "TIME" | "DISTANCE" | "BALANCED", avoidTolls: tourRun.avoidTolls, avoidHighways: tourRun.avoidHighways, avoidFerries: tourRun.avoidFerries, ...patch }))}
          />
        ) : null}
      </Card>

      {/* Bascule mobile : la carte et la timeline occupent chacune tout l'écran sous 1024px plutôt que de s'écraser côte à côte. */}
      <div className="flex gap-1 lg:hidden">
        <button type="button" onClick={() => setMobileView("map")} className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-extrabold ${mobileView === "map" ? "bg-animeo text-white" : "bg-animeo-bg text-animeo-muted"}`}>Carte</button>
        <button type="button" onClick={() => setMobileView("list")} className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-extrabold ${mobileView === "list" ? "bg-animeo text-white" : "bg-animeo-bg text-animeo-muted"}`}>Tournée</button>
      </div>

      {/* Timeline à gauche (largeur fixe, comme une liste de travail), carte à
          droite en pleine hauteur collante — la carte n'est plus un bloc en
          bas de page, c'est la moitié de l'écran (phase 3 bis). */}
      <div className="grid gap-6 lg:grid-cols-[380px_1fr] lg:items-start">
        <Card className={`${mobileView === "list" ? "block" : "hidden lg:block"} overflow-hidden lg:sticky lg:top-6`}>
          <div className="flex items-center justify-between border-b border-[#e5eeeb] p-4">
            <h3 className="text-sm font-black uppercase tracking-[0.08em] text-animeo-dark">Ma tournée</h3>
            {busy ? <span className="text-[11px] font-bold text-animeo-muted">Recalcul…</span> : null}
          </div>
          {/* Reste utilisable pendant un recalcul (phase 3 ter) : les
              distances affichées sont les précédentes jusqu'au prochain
              router.refresh(), jamais un vide — seule l'interaction est
              coupée pour éviter d'empiler plusieurs recalculs concurrents. */}
          <div className={`max-h-[620px] overflow-y-auto p-2 transition-opacity ${busy ? "pointer-events-none opacity-60" : ""}`}>{timeline}</div>
        </Card>

        <div className={mobileView === "map" ? "block" : "hidden lg:block"}>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => { setShowNearbyClients((current) => !current); setSelectedClientId(null); }}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-extrabold transition ${showNearbyClients ? "bg-animeo-dark text-white" : "bg-animeo-bg text-animeo-muted hover:text-animeo-dark"}`}
            >
              👥 {showNearbyClients ? "Masquer" : "Afficher"} les clients du secteur ({sectorClients.length})
            </button>
            {showNearbyClients ? (
              <label className="inline-flex items-center gap-1.5 text-xs font-bold text-animeo-muted">
                Rayon
                <select value={sectorRadiusKm} onChange={(event) => setSectorRadiusKm(Number(event.target.value))} className="min-h-8 rounded-lg border border-[#d7e4e1] bg-white px-2 text-xs font-extrabold text-animeo-dark">
                  {[15, 30, 50].map((km) => <option key={km} value={km}>{km} km</option>)}
                </select>
              </label>
            ) : null}
          </div>
          <TourRunMap
            points={mapPoints}
            routeGeometry={tourRun.routeGeometry}
            selectedId={highlightedStopId}
            onSelect={setSelectedStopId}
            heightClassName="h-[420px] lg:h-[720px]"
            clientPoints={clientPoints}
            onClientSelect={setSelectedClientId}
            onPointDrag={handlePointDrag}
            overlay={selectedClient ? (
              <Card className="p-3">
                <p className="text-xs font-black text-animeo-dark">{selectedClient.animalName} — {selectedClient.ownerName}</p>
                <p className="mt-0.5 text-[11px] font-semibold text-animeo-muted">
                  {selectedClient.city} · {selectedClient.lastConsultation}
                  {selectedClient.dueForReminder ? " · À relancer" : ""}
                </p>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => { setClientAppointmentError(null); setAppointmentModalOpen(true); }} className="flex-1 rounded-lg bg-animeo px-3 py-1.5 text-xs font-extrabold text-white transition hover:bg-[#459e90]">
                    Ajouter à la tournée
                  </button>
                  <button type="button" onClick={() => setSelectedClientId(null)} className="rounded-lg bg-animeo-bg px-3 py-1.5 text-xs font-extrabold text-animeo-muted">✕</button>
                </div>
              </Card>
            ) : undefined}
          />
          {showNearbyClients && unlocatedSectorClients.length > 0 ? (
            <div className="mt-3 rounded-2xl border border-dashed border-[#d9c9a3] bg-[#fffaf0] p-3">
              <p className="text-xs font-extrabold text-[#8c6118]">Clients du secteur sans adresse localisée</p>
              <ul className="mt-2 space-y-1.5">
                {unlocatedSectorClients.map((client) => (
                  <li key={client.id} className="flex items-center justify-between gap-2 text-xs font-semibold text-animeo-dark">
                    <span className="truncate">{client.animalName} — {client.ownerName} ({client.city})</span>
                    <button
                      type="button"
                      onClick={() => handleGeocodeClient(client.clientId)}
                      disabled={geocodingClientId === client.clientId}
                      className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-[11px] font-extrabold text-[#8c6118] shadow-sm transition hover:bg-[#fff3d9] disabled:opacity-60"
                    >
                      {geocodingClientId === client.clientId ? "Localisation…" : "Localiser"}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      {addStopOpen ? (
        <TourRunAddStopModal
          availableAppointments={availableAppointments}
          onAddAppointments={async (appointmentIds) => {
            const result = await addAppointmentStopsAction({ tourRunId: tourRun.id, appointmentIds });
            if (!result.ok) notify.error(result.error);
            setAddStopOpen(false);
            await refresh();
          }}
          onAddManual={async (input) => {
            const result = await addManualStopAction({ tourRunId: tourRun.id, type: input.type as "OTHER", label: input.label, address: input.address, latitude: input.latitude, longitude: input.longitude });
            if (!result.ok) notify.error(result.error);
            setAddStopOpen(false);
            await refresh();
          }}
          onClose={() => setAddStopOpen(false)}
        />
      ) : null}

      {appointmentModalOpen && selectedClient ? (
        <TourRunAddClientAppointmentModal
          client={selectedClient}
          services={homeServices}
          suggestedStart={suggestedStartFor(selectedClient.coordinates)}
          submitting={addingClientStop}
          error={clientAppointmentError}
          onSubmit={handleCreateClientAppointment}
          onClose={() => setAppointmentModalOpen(false)}
        />
      ) : null}

      {removeChoiceStopId ? (
        <TourRunRemoveStopModal
          stopLabel={tourRun.stops.find((stop) => stop.id === removeChoiceStopId)?.label ?? ""}
          submitting={removingStop}
          onRemoveFromTour={() => handleRemoveFromTour(removeChoiceStopId)}
          onCancelAppointment={() => handleCancelStopAppointment(removeChoiceStopId)}
          onClose={() => setRemoveChoiceStopId(null)}
        />
      ) : null}

      {optimizeComparison ? (
        <TourRunOptimizeModal comparison={optimizeComparison} applying={applyingOptimization} onApply={handleApplyOptimization} onDismiss={handleDismissOptimization} />
      ) : null}

      {deleteConfirmOpen ? (
        <ConfirmModal
          title="Supprimer cette tournée ?"
          message="Les rendez-vous eux-mêmes ne sont pas supprimés, seule la tournée (l'itinéraire) l'est."
          confirmLabel="Supprimer"
          onConfirm={async () => {
            const result = await deleteTourRunAction(tourRun.id);
            if (!result.ok) notify.error(result.error);
            setDeleteConfirmOpen(false);
            onClose();
          }}
          onClose={() => setDeleteConfirmOpen(false)}
        />
      ) : null}

      {/* Unification des tournées, phase 3 : suppression en lien texte
          discret plutôt que dans la rangée d'actions primaires — la
          suppression d'une journée n'est pas un geste courant. */}
      <div className="text-center">
        <button type="button" onClick={() => setDeleteConfirmOpen(true)} className="text-xs font-semibold text-animeo-muted underline-offset-2 hover:text-[#a9573b] hover:underline">
          Supprimer cette journée
        </button>
      </div>
    </div>
  );
}

function EditorHeader({ dateId, onClose, onChangeDate }: { dateId: string; onClose: () => void; onChangeDate: (dateId: string) => void }) {
  const date = new Date(`${dateId}T00:00:00.000Z`);

  function shift(days: number) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    onChangeDate(next.toISOString().slice(0, 10));
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <button type="button" onClick={onClose} className="inline-flex items-center gap-1.5 text-sm font-extrabold text-animeo-muted hover:text-animeo-dark">← Retour</button>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => shift(-1)} aria-label="Jour précédent" className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#d4e2df] text-animeo-dark hover:bg-animeo-bg">‹</button>
        <span className="min-w-[220px] text-center text-sm font-extrabold text-animeo-dark">{formatFrenchDate(date)}</span>
        <button type="button" onClick={() => shift(1)} aria-label="Jour suivant" className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#d4e2df] text-animeo-dark hover:bg-animeo-bg">›</button>
        <button type="button" onClick={() => onChangeDate(new Date().toISOString().slice(0, 10))} className="ml-1 rounded-lg border border-[#d4e2df] px-3 py-2 text-xs font-extrabold text-animeo-dark hover:bg-animeo-bg">Aujourd’hui</button>
      </div>
    </div>
  );
}

function AdvancedOptions({ tourRun, busy, onSave }: { tourRun: TourRunView; busy: boolean; onSave: (patch: Partial<{ safetyBufferMinutes: number; avoidTolls: boolean; avoidHighways: boolean; avoidFerries: boolean; optimizationPreference: "TIME" | "DISTANCE" | "BALANCED" }>) => void }) {
  return (
    <div className="mt-4 grid gap-4 rounded-2xl bg-animeo-bg p-4 sm:grid-cols-2">
      <div>
        <label htmlFor="safety-buffer" className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.08em] text-animeo-muted">Temps de sécurité entre RDV</label>
        <select id="safety-buffer" value={tourRun.safetyBufferMinutes} disabled={busy} onChange={(event) => onSave({ safetyBufferMinutes: Number(event.target.value) })} className="min-h-11 w-full rounded-xl border border-[#d7e4e1] bg-white px-3 text-sm font-bold text-animeo-dark">
          {[0, 5, 10, 15, 20, 30].map((minutes) => <option key={minutes} value={minutes}>{minutes === 0 ? "Aucun" : `${minutes} min`}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="optimization-preference" className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.08em] text-animeo-muted">Optimisation préférée</label>
        <select id="optimization-preference" value={tourRun.optimizationPreference} disabled={busy} onChange={(event) => onSave({ optimizationPreference: event.target.value as "TIME" | "DISTANCE" | "BALANCED" })} className="min-h-11 w-full rounded-xl border border-[#d7e4e1] bg-white px-3 text-sm font-bold text-animeo-dark">
          <option value="BALANCED">Équilibrée</option>
          <option value="TIME">Temps</option>
          <option value="DISTANCE">Distance</option>
        </select>
      </div>
      <div className="flex flex-wrap gap-4 sm:col-span-2">
        <label className="flex items-center gap-2 text-sm font-bold text-animeo-dark">
          <input type="checkbox" checked={tourRun.avoidTolls} disabled={busy} onChange={(event) => onSave({ avoidTolls: event.target.checked })} className="h-5 w-5 accent-animeo" />
          Éviter les péages
        </label>
        <label className="flex items-center gap-2 text-sm font-bold text-animeo-dark">
          <input type="checkbox" checked={tourRun.avoidHighways} disabled={busy} onChange={(event) => onSave({ avoidHighways: event.target.checked })} className="h-5 w-5 accent-animeo" />
          Éviter les autoroutes
        </label>
        <label className="flex items-center gap-2 text-sm font-bold text-animeo-dark">
          <input type="checkbox" checked={tourRun.avoidFerries} disabled={busy} onChange={(event) => onSave({ avoidFerries: event.target.checked })} className="h-5 w-5 accent-animeo" />
          Éviter les ferries
        </label>
      </div>
    </div>
  );
}
