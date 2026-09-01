"use client";

import { useRef, useState } from "react";
import { formatDistanceMeters, formatDurationSeconds } from "@/lib/maps/map-utils";
import { formatEuros } from "@/lib/format";
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
};

/**
 * Réordonnancement par insertion (pas un échange 2 à 2, contrairement au
 * mode tournée existant de tour-execution.tsx) : déplacer un arrêt décale
 * tous les autres, conformément à l'exemple du prompt. Même choix Pointer
 * Events que l'existant (souris/tactile/stylet unifiés, sans dépendance).
 */
export function TourRunTimeline({ stops, selectedId, onSelect, onReorder, onMove, onRemove, onToggleFlexible, onFindSolution }: TourRunTimelineProps) {
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
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-animeo-dark text-[11px] font-black text-white">{index + 1}</span>
                <p className="truncate text-sm font-black text-animeo-dark">
                  {stop.arrivalTime ? `${stop.arrivalTime} · ` : ""}
                  {stop.animalSpecies ? `${speciesEmoji[stop.animalSpecies] ?? ""} ` : ""}
                  {stop.label}
                </p>
                {stop.appointmentId ? <span title={stop.locked ? "Horaire fixe" : "Horaire flexible"}><LockIcon locked={stop.locked} /></span> : null}
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
        </li>
      ))}
    </ol>
  );
}
