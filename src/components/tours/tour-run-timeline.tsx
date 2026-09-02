"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { useHasMounted } from "@/components/ui/use-has-mounted";
import { formatDistanceMeters, formatDurationSeconds } from "@/lib/maps/map-utils";
import { formatEuros } from "@/lib/format";
import { toTelHref } from "@/lib/phone";
import { buildNavUrl, navProviderLabels, type NavProvider } from "@/lib/tour-maps";
import type { TourStopView } from "@/lib/tour-runs";

const speciesEmoji: Record<string, string> = { Chien: "🐶", Chat: "🐱", Cheval: "🐴", NAC: "🐹" };

function GripIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><circle cx="7" cy="5" r="1.4" /><circle cx="13" cy="5" r="1.4" /><circle cx="7" cy="10" r="1.4" /><circle cx="13" cy="10" r="1.4" /><circle cx="7" cy="15" r="1.4" /><circle cx="13" cy="15" r="1.4" /></svg>
  );
}

function CrossIcon() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4"><path d="M5 5l10 10M15 5 5 15" /></svg>;
}

function LockIcon({ locked }: { locked: boolean }) {
  return locked ? (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5"><path d="M10 2a4 4 0 0 0-4 4v2H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1V6a4 4 0 0 0-4-4Zm-2 6V6a2 2 0 1 1 4 0v2Z" /></svg>
  ) : (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 opacity-50"><path d="M14 8V6a4 4 0 1 0-8 0h2a2 2 0 1 1 4 0v2H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1Z" /></svg>
  );
}

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
};

/**
 * Réordonnancement par insertion (pas un échange 2 à 2, contrairement au
 * mode tournée existant de tour-execution.tsx) : déplacer un arrêt décale
 * tous les autres, conformément à l'exemple du prompt. Même choix Pointer
 * Events que l'existant (souris/tactile/stylet unifiés, sans dépendance).
 */
export function TourRunTimeline({ stops, selectedId, onSelect, onReorder, onMove, onRemove, onToggleFlexible, onFindSolution, onComplete, completingId }: TourRunTimelineProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const rowElements = useRef(new Map<string, HTMLElement>());

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
    <ol className="divide-y divide-[#edf2f0]">
      {stops.map((stop, index) => (
        <li
          key={stop.id}
          ref={(element) => {
            if (element) rowElements.current.set(stop.id, element);
            else rowElements.current.delete(stop.id);
          }}
          className={`transition-colors ${draggedId === stop.id ? "opacity-50" : ""} ${overId === stop.id ? "bg-animeo-soft" : ""}`}
        >
          {index > 0 && (stop.legDistanceMeters != null || stop.legDurationSeconds != null) ? (
            <p className="pl-14 pt-2 text-xs font-bold text-animeo-muted">
              ↓ {stop.legDurationSeconds != null ? formatDurationSeconds(stop.legDurationSeconds) : "—"}
              {stop.legDistanceMeters != null ? ` · ${formatDistanceMeters(stop.legDistanceMeters)}` : ""}
            </p>
          ) : null}
          {stop.lateWarningMinutes != null && stop.lateWarningMinutes > 0 ? (
            <div className="mx-2 mt-2 rounded-xl border border-[#f3c9b3] bg-[#fff1ec] p-3">
              <p className="text-xs font-black text-[#a9573b]">⚠️ Trajet impossible</p>
              <p className="mt-1 text-xs font-semibold text-[#8c4a33]">
                Arrivée prévue vers {stop.arrivalTime} pour un rendez-vous à {stop.appointmentId ? stop.label.split(" — ")[0] : stop.label}
                {" "}— {stop.lateWarningMinutes} minute{stop.lateWarningMinutes > 1 ? "s" : ""} manquante{stop.lateWarningMinutes > 1 ? "s" : ""}.
              </p>
              {onFindSolution ? (
                <button type="button" onClick={onFindSolution} className="mt-2 rounded-lg bg-white px-3 py-1.5 text-xs font-extrabold text-[#a9573b] shadow-sm transition hover:bg-[#fff7f3]">
                  Trouver une solution
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="flex items-start gap-1 py-2">
            <div className="flex shrink-0 flex-col items-center gap-1 pt-2">
              <button
                type="button"
                aria-label={`Glisser pour déplacer ${stop.label}`}
                onPointerDown={(event) => handlePointerDown(event, stop.id)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="flex h-9 w-8 cursor-grab touch-none items-center justify-center text-animeo-muted active:cursor-grabbing"
              >
                <GripIcon />
              </button>
              <div className="flex flex-col gap-0.5">
                <button type="button" onClick={() => onMove(stop.id, "up")} disabled={index === 0} aria-label={`Monter ${stop.label}`} className="flex h-5 w-5 items-center justify-center rounded text-animeo-muted hover:bg-animeo-bg disabled:opacity-30">▲</button>
                <button type="button" onClick={() => onMove(stop.id, "down")} disabled={index === stops.length - 1} aria-label={`Descendre ${stop.label}`} className="flex h-5 w-5 items-center justify-center rounded text-animeo-muted hover:bg-animeo-bg disabled:opacity-30">▼</button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onSelect(stop.id)}
              aria-pressed={selectedId === stop.id}
              className={`min-h-11 flex-1 rounded-xl px-3 py-2 text-left transition ${selectedId === stop.id ? "bg-animeo-soft" : "hover:bg-animeo-bg"}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-animeo-dark text-[11px] font-black text-white">{index + 1}</span>
                <p className="truncate text-sm font-black text-animeo-dark">
                  {stop.arrivalTime ? `${stop.arrivalTime} · ` : ""}
                  {stop.animalSpecies ? `${speciesEmoji[stop.animalSpecies] ?? ""} ` : ""}
                  {stop.label}
                </p>
                {stop.appointmentId ? <span title={stop.locked ? "Horaire fixe" : "Horaire flexible"}><LockIcon locked={stop.locked} /></span> : null}
                {stop.outOfZone ? <span className="rounded-full bg-[#fff3e0] px-2 py-0.5 text-[10px] font-extrabold text-[#a9573b]">Hors zone</span> : null}
                {stop.completedAt ? <span className="rounded-full bg-animeo-soft px-2 py-0.5 text-[10px] font-extrabold text-[#278064]">Terminé à {stop.completedAt}</span> : null}
              </div>
              {stop.address ? <p className="mt-0.5 truncate pl-8 text-xs font-semibold text-animeo-muted">{stop.address}</p> : null}
              {stop.price != null ? <p className="mt-0.5 pl-8 text-xs font-bold text-animeo-muted">{formatEuros(stop.price)}</p> : null}
            </button>

            <div className="flex shrink-0 flex-col items-center gap-1 pt-2">
              {stop.appointmentId ? (
                <button
                  type="button"
                  onClick={() => onToggleFlexible(stop.id, !stop.flexible)}
                  className={`rounded-lg px-2 py-1 text-[10px] font-extrabold ${stop.flexible ? "bg-[#fff4dd] text-[#8c6118]" : "bg-animeo-bg text-animeo-muted"}`}
                  title={stop.flexible ? "Rendre fixe" : "Rendre flexible"}
                >
                  {stop.flexible ? "Flexible" : "Fixe"}
                </button>
              ) : null}
              <button type="button" onClick={() => onRemove(stop.id)} aria-label={`Retirer ${stop.label} de la tournée`} className="flex h-8 w-8 items-center justify-center rounded-lg text-animeo-muted hover:bg-[#fff1ec] hover:text-[#a9573b]">
                <CrossIcon />
              </button>
            </div>
          </div>

          {stop.appointmentId ? (
            <div className="flex flex-wrap gap-1.5 pb-3 pl-14">
              {stop.phone ? (
                <a href={toTelHref(stop.phone) ?? undefined} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-animeo-bg px-2.5 text-xs font-extrabold text-animeo-dark transition hover:bg-animeo-soft">
                  <PhoneIcon /> Appeler
                </a>
              ) : null}
              {stop.latitude != null && stop.longitude != null ? <GoButton coordinates={{ lat: stop.latitude, lng: stop.longitude }} /> : null}
              {!stop.completedAt ? (
                <button
                  type="button"
                  onClick={() => onComplete(stop.id, stop.appointmentId!)}
                  disabled={completingId === stop.id}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-animeo px-2.5 text-xs font-extrabold text-white transition hover:bg-[#459e90] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {completingId === stop.id ? "Enregistrement…" : "Terminé"}
                </button>
              ) : null}
            </div>
          ) : null}
        </li>
      ))}
    </ol>
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
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function choose(next: NavProvider) {
    setProvider(next);
    persistNavProvider(next);
    setOpen(false);
  }

  return (
    <div ref={menuRef} className="relative inline-flex">
      <a
        href={buildNavUrl(provider, coordinates)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-8 items-center gap-1.5 rounded-l-lg bg-animeo-bg pl-2.5 pr-1.5 text-xs font-extrabold text-animeo-dark transition hover:bg-animeo-soft"
      >
        <Icon name="car" className="h-3.5 w-3.5" /> Y aller
      </a>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Choisir l’application de navigation"
        className="inline-flex min-h-8 items-center rounded-r-lg border-l border-white bg-animeo-bg px-1 text-animeo-dark transition hover:bg-animeo-soft"
      >
        <Icon name="arrow" className="h-3 w-3 rotate-90" />
      </button>
      {open ? (
        <div role="menu" className="absolute left-0 top-[calc(100%+4px)] z-10 w-40 rounded-lg border border-[#e5eeeb] bg-white p-1 shadow-[0_12px_28px_rgba(21,63,71,0.16)]">
          {navProviders.map((option) => (
            <a
              key={option}
              role="menuitem"
              href={buildNavUrl(option, coordinates)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => choose(option)}
              className={`block rounded-md px-2.5 py-1.5 text-left text-xs font-bold ${option === provider ? "bg-animeo-soft text-animeo-dark" : "text-animeo-dark hover:bg-animeo-bg"}`}
            >
              {navProviderLabels[option]}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PhoneIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  );
}
