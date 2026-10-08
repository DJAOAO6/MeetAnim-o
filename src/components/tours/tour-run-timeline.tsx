"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, GripVertical, Lock, LockOpen, Phone, X } from "lucide-react";
import { Toggle } from "@/components/settings/settings-fields";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button, buttonBaseClassName, buttonSizeClassName, buttonVariantClassName } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { useHasMounted } from "@/components/ui/use-has-mounted";
import { formatDistanceMeters, formatDurationSeconds } from "@/lib/maps/map-utils";
import { formatEuros } from "@/lib/format";
import { toTelHref } from "@/lib/phone";
import { buildNavUrl, navProviderLabels, type NavProvider } from "@/lib/tour-maps";
import type { TourStopView } from "@/lib/tour-runs";

const speciesEmoji: Record<string, string> = { Chien: "🐶", Chat: "🐱", Cheval: "🐴", NAC: "🐹" };

// Le même habillage que les boutons secondaires, pour les liens de la ligne
// d'actions (« Appeler », « Y aller ») : ils s'alignent sur leurs voisins.
const secondaryLink = `${buttonBaseClassName} ${buttonVariantClassName.secondary} ${buttonSizeClassName.md}`;

type TourRunTimelineProps = {
  stops: TourStopView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (orderedStopIds: string[]) => void;
  onMove: (stopId: string, direction: "up" | "down") => void;
  onRemove: (stopId: string) => void;
  onToggleFlexible: (stopId: string, flexible: boolean) => void;
  onFindSolution?: () => void;
  // Unification des tournées, phase 3 : marque le rendez-vous lié comme
  // réalisé (COMPLETED) — seuls les arrêts liés à un rendez-vous réel sont
  // "terminables" (voir TourStop.appointmentId, TourStopView.completedAt).
  onComplete: (stopId: string, appointmentId: string) => void;
  completingId: string | null;
  // Phase 3 bis : survoler un arrêt met en avant son marqueur sur la carte
  // (voir tour-run-editor.tsx, qui fusionne hoveredStopId et selectedStopId
  // avant de les transmettre à TourRunMap) — état purement transitoire,
  // jamais confondu avec la vraie sélection.
  onHoverStop?: (stopId: string | null) => void;
  // Phase 3 ter : heure/durée d'un arrêt lié à un rendez-vous repassent par
  // updateStopScheduleAction côté serveur (agenda source de vérité) ; le
  // créneau imposé (optimisation seulement) reste un simple champ TourStop.
  onEditSchedule: (stopId: string, patch: { start?: string; durationMinutes?: number }) => void;
  onEditTimeWindow: (stopId: string, patch: { timeWindowStart: string | null; timeWindowEnd: string | null }) => void;
};

/**
 * Réordonnancement par insertion (pas un échange 2 à 2, contrairement au
 * mode tournée existant de tour-execution.tsx) : déplacer un arrêt décale
 * tous les autres, conformément à l'exemple du prompt. Même choix Pointer
 * Events que l'existant (souris/tactile/stylet unifiés, sans dépendance).
 */
export function TourRunTimeline({ stops, selectedId, onSelect, onReorder, onMove, onRemove, onToggleFlexible, onFindSolution, onComplete, completingId, onHoverStop, onEditSchedule, onEditTimeWindow }: TourRunTimelineProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const rowElements = useRef(new Map<string, HTMLElement>());

  // Phase 3 bis : cliquer un marqueur sur la carte sélectionne l'arrêt (déjà
  // câblé via selectedId/onSelect) — fait aussi défiler la timeline jusqu'à
  // lui, ici plutôt que dans tour-run-editor.tsx puisque c'est cette liste
  // qui connaît la position de chaque ligne.
  useEffect(() => {
    if (!selectedId) return;
    rowElements.current.get(selectedId)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedId]);

  function rowIdAtY(clientY: number): string | null {
    for (const [id, element] of rowElements.current) {
      const rect = element.getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) return id;
    }
    return null;
  }

  function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>, id: string) {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggedId(id);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    if (!draggedId) return;
    const hovered = rowIdAtY(event.clientY);
    setOverId(hovered && hovered !== draggedId ? hovered : null);
  }

  function handlePointerUp() {
    if (draggedId && overId) {
      const fromIndex = stops.findIndex((stop) => stop.id === draggedId);
      const toIndex = stops.findIndex((stop) => stop.id === overId);
      if (fromIndex !== -1 && toIndex !== -1) {
        const next = [...stops];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        onReorder(next.map((stop) => stop.id));
      }
    }
    setDraggedId(null);
    setOverId(null);
  }

  if (stops.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#c9dbd6] bg-animeo-bg/60 p-6 text-center text-sm font-semibold text-animeo-muted">
        Aucun arrêt pour l’instant — ajoutez un rendez-vous ou une adresse pour commencer.
      </div>
    );
  }

  return (
    <ol className="divide-y divide-animeo-border-soft">
      {stops.map((stop, index) => (
        <li
          key={stop.id}
          ref={(element) => {
            if (element) rowElements.current.set(stop.id, element);
            else rowElements.current.delete(stop.id);
          }}
          onMouseEnter={() => onHoverStop?.(stop.id)}
          onMouseLeave={() => onHoverStop?.(null)}
          className={`transition-colors ${draggedId === stop.id ? "opacity-50" : ""} ${overId === stop.id ? "bg-animeo-soft" : ""}`}
        >
          {index > 0 && (stop.legDistanceMeters != null || stop.legDurationSeconds != null) ? (
            <p className="pl-14 pt-2 text-xs font-bold text-animeo-muted">
              ↓ {stop.legDurationSeconds != null ? formatDurationSeconds(stop.legDurationSeconds) : "—"}
              {stop.legDistanceMeters != null ? ` · ${formatDistanceMeters(stop.legDistanceMeters)}` : ""}
            </p>
          ) : null}
          {stop.lateWarningMinutes != null && stop.lateWarningMinutes > 0 ? (
            <div className="mx-2 mt-2 rounded-xl border border-[#f3c9b3] bg-animeo-danger-soft p-3">
              <p className="text-xs font-black text-animeo-danger">⚠️ Trajet impossible</p>
              <p className="mt-1 text-xs font-semibold text-[#8c4a33]">
                Arrivée prévue vers {stop.arrivalTime} pour un rendez-vous à {stop.appointmentId ? stop.label.split(" — ")[0] : stop.label}
                {" "}— {stop.lateWarningMinutes} minute{stop.lateWarningMinutes > 1 ? "s" : ""} manquante{stop.lateWarningMinutes > 1 ? "s" : ""}.
              </p>
              {onFindSolution ? (
                <Button type="button" variant="secondary" onClick={onFindSolution} className="mt-2">Trouver une solution</Button>
              ) : null}
            </div>
          ) : null}
          <div className="flex items-start gap-1 py-2">
            {/* Poignée de glisser : exception du plan, elle garde sa forme. */}
            <button
              type="button"
              aria-label={`Glisser pour déplacer ${stop.label}`}
              onPointerDown={(event) => handlePointerDown(event, stop.id)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className="flex h-11 w-8 shrink-0 cursor-grab touch-none items-center justify-center text-animeo-muted active:cursor-grabbing"
            >
              <GripVertical aria-hidden="true" className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={() => onSelect(stop.id)}
              aria-pressed={selectedId === stop.id}
              className={`min-h-11 min-w-0 flex-1 rounded-xl px-3 py-2 text-left transition ${selectedId === stop.id ? "bg-animeo-soft" : "hover:bg-animeo-bg"}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-animeo-dark text-[11px] font-black text-white">{index + 1}</span>
                <p className="truncate text-sm font-black text-animeo-dark">
                  {stop.arrivalTime ? `${stop.arrivalTime} · ` : ""}
                  {stop.animalSpecies ? `${speciesEmoji[stop.animalSpecies] ?? ""} ` : ""}
                  {stop.label}
                </p>
                {stop.appointmentId ? (
                  <span title={stop.locked ? "Horaire fixe" : "Horaire flexible"}>
                    {stop.locked ? <Lock aria-hidden="true" className="h-3.5 w-3.5" /> : <LockOpen aria-hidden="true" className="h-3.5 w-3.5 opacity-50" />}
                  </span>
                ) : null}
                {stop.outOfZone ? <span className="rounded-full bg-animeo-warning-soft px-2 py-0.5 text-xs font-extrabold text-animeo-danger">Hors zone</span> : null}
                {stop.completedAt ? <span className="rounded-full bg-animeo-soft px-2 py-0.5 text-xs font-extrabold text-animeo-positive">Terminé à {stop.completedAt}</span> : null}
              </div>
              {stop.address ? <p className="mt-0.5 truncate pl-8 text-xs font-semibold text-animeo-muted">{stop.address}</p> : null}
              {stop.price != null ? <p className="mt-0.5 pl-8 text-xs font-bold text-animeo-muted">{formatEuros(stop.price)}</p> : null}
            </button>

            <IconButton variant="danger" label={`Retirer ${stop.label} de la tournée`} tooltip="Retirer de la tournée" onClick={() => onRemove(stop.id)} tooltipAlign="end">
              <X aria-hidden="true" className="h-5 w-5" />
            </IconButton>
          </div>

          <div className="flex flex-wrap items-center gap-2 pb-3 pl-9">
            <IconButton label={`Monter ${stop.label}`} tooltip="Monter" onClick={() => onMove(stop.id, "up")} disabled={index === 0} tooltipAlign="start">
              <ChevronUp aria-hidden="true" className="h-5 w-5" />
            </IconButton>
            <IconButton label={`Descendre ${stop.label}`} tooltip="Descendre" onClick={() => onMove(stop.id, "down")} disabled={index === stops.length - 1} tooltipAlign="start">
              <ChevronDown aria-hidden="true" className="h-5 w-5" />
            </IconButton>
            {stop.appointmentId ? (
              <>
                <Toggle compact checked={stop.flexible} onChange={(flexible) => onToggleFlexible(stop.id, flexible)} label={stop.flexible ? "Flexible" : "Fixe"} ariaLabel={`Horaire flexible pour ${stop.label}`} />
                {stop.phone ? (
                  <a href={toTelHref(stop.phone) ?? undefined} className={secondaryLink}>
                    <Phone aria-hidden="true" className="h-4 w-4" /> Appeler
                  </a>
                ) : null}
                {stop.latitude != null && stop.longitude != null ? <GoButton coordinates={{ lat: stop.latitude, lng: stop.longitude }} /> : null}
                {!stop.completedAt ? (
                  <Button type="button" onClick={() => onComplete(stop.id, stop.appointmentId!)} disabled={completingId === stop.id}>
                    {completingId === stop.id ? "Enregistrement…" : "Terminé"}
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>

          {stop.id === selectedId ? (
            <StopDetailPanel stop={stop} onEditSchedule={onEditSchedule} onEditTimeWindow={onEditTimeWindow} />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/**
 * Phase 3 ter : champs heure/durée/créneau imposé de l'arrêt sélectionné.
 * Enregistrement immédiat au blur (pas de bouton "enregistrer", conforme
 * au prompt) — état local resynchronisé depuis les props à chaque
 * changement (succès comme échec serveur) pour que l'arrêt revienne
 * visiblement à sa valeur précédente si le serveur refuse.
 */
function StopDetailPanel({ stop, onEditSchedule, onEditTimeWindow }: {
  stop: TourStopView;
  onEditSchedule: (stopId: string, patch: { start?: string; durationMinutes?: number }) => void;
  onEditTimeWindow: (stopId: string, patch: { timeWindowStart: string | null; timeWindowEnd: string | null }) => void;
}) {
  const durationText = stop.serviceDurationMinutes != null ? String(stop.serviceDurationMinutes) : "";

  const [start, setStart] = useState(stop.arrivalTime ?? "");
  const [duration, setDuration] = useState(durationText);
  const [windowStart, setWindowStart] = useState(stop.timeWindowStart ?? "");
  const [windowEnd, setWindowEnd] = useState(stop.timeWindowEnd ?? "");

  // Resynchronisé depuis la vraie valeur (succès comme échec serveur) à
  // chaque changement — un champ à la fois (pas une signature combinée) :
  // valider "heure" déclenche un aller-retour serveur qui rafraîchit les
  // props de TOUS les champs de ce panneau, un signature combinée aurait
  // donc écrasé une saisie de "durée" encore en cours ailleurs dans le
  // panneau. Ajustement pendant le rendu plutôt que dans un effet (même
  // motif qu'ailleurs dans l'app, pas de cascade de rendus).
  const [lastArrivalTime, setLastArrivalTime] = useState(stop.arrivalTime ?? "");
  if ((stop.arrivalTime ?? "") !== lastArrivalTime) {
    setLastArrivalTime(stop.arrivalTime ?? "");
    setStart(stop.arrivalTime ?? "");
  }
  const [lastDurationText, setLastDurationText] = useState(durationText);
  if (durationText !== lastDurationText) {
    setLastDurationText(durationText);
    setDuration(durationText);
  }
  const [lastWindowStart, setLastWindowStart] = useState(stop.timeWindowStart ?? "");
  if ((stop.timeWindowStart ?? "") !== lastWindowStart) {
    setLastWindowStart(stop.timeWindowStart ?? "");
    setWindowStart(stop.timeWindowStart ?? "");
  }
  const [lastWindowEnd, setLastWindowEnd] = useState(stop.timeWindowEnd ?? "");
  if ((stop.timeWindowEnd ?? "") !== lastWindowEnd) {
    setLastWindowEnd(stop.timeWindowEnd ?? "");
    setWindowEnd(stop.timeWindowEnd ?? "");
  }

  function commitStart() {
    if (start && start !== stop.arrivalTime) onEditSchedule(stop.id, { start });
  }
  function commitDuration() {
    const parsed = Number(duration);
    if (duration.trim() && Number.isFinite(parsed) && parsed !== stop.serviceDurationMinutes) onEditSchedule(stop.id, { durationMinutes: parsed });
  }
  function commitWindow() {
    const nextStart = windowStart || null;
    const nextEnd = windowEnd || null;
    if (nextStart !== stop.timeWindowStart || nextEnd !== stop.timeWindowEnd) onEditTimeWindow(stop.id, { timeWindowStart: nextStart, timeWindowEnd: nextEnd });
  }

  return (
    <div className="mx-2 mb-3 space-y-2 rounded-xl bg-animeo-bg p-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor={`stop-start-${stop.id}`} className="mb-1 block text-xs font-extrabold uppercase tracking-[0.06em] text-animeo-muted">Heure</label>
          <input id={`stop-start-${stop.id}`} type="time" value={start} onChange={(event) => setStart(event.target.value)} onBlur={commitStart} className="min-h-9 w-full rounded-lg border border-animeo-border bg-white px-2 text-xs font-bold text-animeo-dark" />
        </div>
        <div>
          <label htmlFor={`stop-duration-${stop.id}`} className="mb-1 block text-xs font-extrabold uppercase tracking-[0.06em] text-animeo-muted">Durée (min)</label>
          <input id={`stop-duration-${stop.id}`} type="number" min={5} step={5} value={duration} onChange={(event) => setDuration(event.target.value)} onBlur={commitDuration} className="min-h-9 w-full rounded-lg border border-animeo-border bg-white px-2 text-xs font-bold text-animeo-dark" />
        </div>
      </div>
      <div>
        <p className="mb-1 text-xs font-extrabold uppercase tracking-[0.06em] text-animeo-muted">Créneau imposé (optionnel — utilisé par « Optimiser »)</p>
        <div className="grid grid-cols-2 gap-2">
          <input aria-label={`Créneau imposé, début, ${stop.label}`} type="time" value={windowStart} onChange={(event) => setWindowStart(event.target.value)} onBlur={commitWindow} className="min-h-9 w-full rounded-lg border border-animeo-border bg-white px-2 text-xs font-bold text-animeo-dark" />
          <input aria-label={`Créneau imposé, fin, ${stop.label}`} type="time" value={windowEnd} onChange={(event) => setWindowEnd(event.target.value)} onBlur={commitWindow} className="min-h-9 w-full rounded-lg border border-animeo-border bg-white px-2 text-xs font-bold text-animeo-dark" />
        </div>
      </div>
    </div>
  );
}

const NAV_PROVIDER_STORAGE_KEY = "animeo:nav-provider";
const navProviders: NavProvider[] = ["google", "waze", "apple"];

function readStoredNavProvider(): NavProvider {
  if (typeof window === "undefined") return "google";
  try {
    const raw = window.localStorage.getItem(NAV_PROVIDER_STORAGE_KEY);
    return raw === "google" || raw === "waze" || raw === "apple" ? raw : "google";
  } catch {
    return "google";
  }
}

function persistNavProvider(provider: NavProvider) {
  try {
    window.localStorage.setItem(NAV_PROVIDER_STORAGE_KEY, provider);
  } catch {
    // best-effort : une préférence d'affichage locale, jamais bloquant
  }
}

function GoButton({ coordinates }: { coordinates: { lat: number; lng: number } }) {
  // Préférence lue après l'hydratation, ajustée pendant le rendu plutôt que
  // dans un effet (même motif qu'ailleurs dans l'app — notifications-bell.tsx) :
  // le serveur et le premier rendu client valent toujours "google", jamais de
  // désaccord d'hydratation malgré la vraie préférence lue en localStorage.
  const hasMounted = useHasMounted();
  const [provider, setProvider] = useState<NavProvider>("google");
  const [providerLoaded, setProviderLoaded] = useState(false);
  if (hasMounted && !providerLoaded) {
    setProviderLoaded(true);
    setProvider(readStoredNavProvider());
  }
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function choose(next: NavProvider) {
    setProvider(next);
    persistNavProvider(next);
  }

  return (
    <div ref={containerRef} className="relative inline-flex">
      <a
        href={buildNavUrl(provider, coordinates)}
        target="_blank"
        rel="noopener noreferrer"
        className={`${secondaryLink} rounded-r-none`}
      >
        <Icon name="car" className="h-4 w-4" /> Y aller
      </a>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Choisir l’application de navigation"
        className={`${buttonBaseClassName} ${buttonVariantClassName.secondary} -ml-px min-h-11 w-11 shrink-0 rounded-l-none`}
      >
        <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {/* Chaque entrée ouvre l'itinéraire dans l'application choisie, qui
          devient celle de « Y aller ». */}
      <ActionMenu
        open={open}
        onClose={(returnFocus) => { setOpen(false); if (returnFocus) triggerRef.current?.focus(); }}
        label="Application de navigation"
        containerRef={containerRef}
        align="start"
        items={navProviders.map((option) => ({
          label: navProviderLabels[option],
          href: buildNavUrl(option, coordinates),
          external: true,
          checked: option === provider,
          onSelect: () => choose(option),
        }))}
      />
    </div>
  );
}
