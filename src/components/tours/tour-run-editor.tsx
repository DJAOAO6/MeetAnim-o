"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { notify } from "@/lib/notify";
import { formatEuros, formatFrenchDate } from "@/lib/format";
import { formatDistanceMeters, formatDurationSeconds } from "@/lib/maps/map-utils";
import { TourRunTimeline } from "@/components/tours/tour-run-timeline";
import { TourRunEndpointPicker, type EndpointValue } from "@/components/tours/tour-run-endpoint-picker";
import { TourRunAddStopModal } from "@/components/tours/tour-run-add-stop-modal";
import { TourRunOptimizeModal } from "@/components/tours/tour-run-optimize-modal";
import {
  addAppointmentStopsAction,
  addManualStopAction,
  applyOptimizationProposalAction,
  createTourRunAction,
  deleteTourRunAction,
  dismissOptimizationProposalAction,
  moveStopAction,
  optimizeTourRunAction,
  recomputeRouteAction,
  removeStopAction,
  reorderStopsAction,
  updateStopAction,
  updateTourRunEndpointsAction,
  updateTourRunOptionsAction,
  type OptimizationComparison,
} from "@/lib/tour-runs-actions";
import type { AvailableAppointmentView, SavedPlaceView, TourPreferencesView, TourRunView } from "@/lib/tour-runs";
import type { TourRunMapPoint } from "@/components/tours/tour-run-map";

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
  onClose: () => void;
};

function endpointFrom(value: TourRunView["start"]): EndpointValue {
  return { type: value.type as EndpointValue["type"], savedPlaceId: value.savedPlaceId, address: value.address, latitude: value.latitude, longitude: value.longitude, label: value.label };
}

function defaultEndpoint(type: string, savedPlaceId: string | null): EndpointValue {
  return { type: type as EndpointValue["type"], savedPlaceId, address: null, latitude: null, longitude: null, label: null };
}

export function TourRunEditor({ dateId, tourRun, savedPlaces, preferences, availableAppointments, cabinet, onClose }: TourRunEditorProps) {
  const router = useRouter();
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"map" | "list">("list");
  const [addStopOpen, setAddStopOpen] = useState(false);
  const [optimizeComparison, setOptimizeComparison] = useState<OptimizationComparison | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [applyingOptimization, setApplyingOptimization] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

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

  const mapPoints = useMemo<TourRunMapPoint[]>(() => {
    if (!tourRun) return [];
    const points: TourRunMapPoint[] = [];
    if (tourRun.resolvedStart.coordinates) points.push({ id: "start", lat: tourRun.resolvedStart.coordinates.lat, lng: tourRun.resolvedStart.coordinates.lng, label: "D", title: `Départ · ${tourRun.resolvedStart.label}`, color: "#183b45", kind: "start" });
    tourRun.stops.forEach((stop, index) => {
      if (stop.latitude != null && stop.longitude != null) {
        points.push({ id: stop.id, lat: stop.latitude, lng: stop.longitude, label: String(index + 1), title: stop.label, color: stop.id === selectedStopId ? "#e08a3e" : "#4FAF9F", kind: "stop" });
      }
    });
    if (tourRun.resolvedEnd.coordinates) points.push({ id: "end", lat: tourRun.resolvedEnd.coordinates.lat, lng: tourRun.resolvedEnd.coordinates.lng, label: "A", title: `Arrivée · ${tourRun.resolvedEnd.label}`, color: "#183b45", kind: "end" });
    return points;
  }, [tourRun, selectedStopId]);

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
      onReorder={(orderedStopIds) => runAction(() => reorderStopsAction({ tourRunId: tourRun.id, orderedStopIds }))}
      onMove={(stopId, direction) => runAction(() => moveStopAction({ tourRunId: tourRun.id, stopId, direction }))}
      onRemove={(stopId) => runAction(() => removeStopAction({ tourRunId: tourRun.id, stopId }))}
      onToggleFlexible={(stopId, flexible) => runAction(() => updateStopAction({ tourRunId: tourRun.id, stopId, flexible, locked: !flexible }))}
      onFindSolution={canOptimize ? handleOptimize : undefined}
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
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setAddStopOpen(true)} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-animeo-soft px-4 text-sm font-extrabold text-animeo-dark transition hover:bg-[#dceee9]">+ Ajouter un arrêt</button>
            {canOptimize ? (
              <button type="button" onClick={handleOptimize} disabled={optimizing} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-animeo px-4 text-sm font-extrabold text-white transition hover:bg-[#459e90] disabled:opacity-60">
                {optimizing ? "Calcul…" : "✨ Optimiser"}
              </button>
            ) : null}
            <button type="button" onClick={() => runAction(() => recomputeRouteAction(tourRun.id))} disabled={busy} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[#d4e2df] px-4 text-sm font-extrabold text-animeo-dark transition hover:bg-animeo-bg disabled:opacity-60">Recalculer</button>
            <button type="button" onClick={() => setDeleteConfirmOpen(true)} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-4 text-sm font-extrabold text-[#a9573b] transition hover:bg-[#fff1ec]">Supprimer</button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
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

      <div className="grid gap-6 lg:grid-cols-[60%_40%]">
        <div className={mobileView === "map" ? "block" : "hidden lg:block"}>
          <TourRunMap points={mapPoints} routeGeometry={tourRun.routeGeometry} selectedId={selectedStopId} onSelect={setSelectedStopId} heightClassName="h-[420px] lg:h-[620px]" />
        </div>
        <Card className={`${mobileView === "list" ? "block" : "hidden lg:block"} overflow-hidden`}>
          <div className="border-b border-[#e5eeeb] p-4">
            <h3 className="text-sm font-black uppercase tracking-[0.08em] text-animeo-dark">Ma tournée</h3>
          </div>
          <div className="max-h-[620px] overflow-y-auto p-2">{timeline}</div>
        </Card>
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
