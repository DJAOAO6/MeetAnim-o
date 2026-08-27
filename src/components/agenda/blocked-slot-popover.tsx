"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { BlockedSlot } from "@/lib/blocked-slots-actions";

type BlockedSlotPopoverProps = {
  slot: BlockedSlot;
  anchorRect: DOMRect;
  onDelete: (id: string) => Promise<{ ok: boolean; error?: string }>;
  onClose: () => void;
};

const POPOVER_WIDTH = 320;
const MARGIN = 14;

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const label = dateFormatter.format(new Date(year, month - 1, day, 12));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function BlockedSlotPopover({ slot, anchorRect, onDelete, onClose }: BlockedSlotPopoverProps) {
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const placement = useMemo(() => {
    const width = Math.min(POPOVER_WIDTH, window.innerWidth - MARGIN * 2);
    const left = Math.min(Math.max(anchorRect.left, MARGIN), window.innerWidth - width - MARGIN);
    const top = Math.max(MARGIN, Math.min(anchorRect.bottom + 8, window.innerHeight - 220 - MARGIN));
    return { top, left, width };
  }, [anchorRect]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) onClose();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  async function handleDelete() {
    setPending(true);
    setError(null);
    const result = await onDelete(slot.id);
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? "Une erreur est survenue.");
      return;
    }
    onClose();
  }

  return createPortal(
    <div className="fixed inset-0 z-[70]" role="presentation">
      <div
        ref={popoverRef}
        role="dialog"
        aria-modal="true"
        aria-label="Créneau bloqué"
        style={{ top: placement.top, left: placement.left, width: placement.width }}
        className={`absolute origin-top overflow-hidden rounded-2xl border border-[#dce8e5] bg-white shadow-[0_24px_55px_rgba(12,39,47,0.28)] transition duration-200 ease-out ${
          visible ? "translate-y-0 scale-100 opacity-100" : "-translate-y-2 scale-95 opacity-0"
        }`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#e5eae9] p-4">
          <div className="min-w-0">
            <span className="inline-flex rounded-full bg-[#F1F3F3] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.06em] text-[#59666B]">Créneau bloqué</span>
            <h3 className="mt-2 truncate text-sm font-black text-animeo-dark">{formatDate(slot.date)}</h3>
            <p className="text-sm font-bold text-animeo-muted">{slot.startTime} – {slot.endTime}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-animeo-bg text-lg text-animeo-muted">×</button>
        </div>

        <div className="p-4">
          {slot.reason ? <p className="mb-3 rounded-xl bg-animeo-bg px-3 py-2.5 text-sm font-semibold text-animeo-dark">{slot.reason}</p> : null}
          {error ? <p className="mb-3 rounded-xl bg-[#fff0eb] px-3 py-2.5 text-sm font-bold text-[#a9573b]">{error}</p> : null}
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            className="w-full rounded-xl border border-[#e6a08c] px-4 py-2.5 text-sm font-extrabold text-[#a9573b] transition hover:bg-[#fff0eb] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Déblocage…" : "Débloquer ce créneau"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
