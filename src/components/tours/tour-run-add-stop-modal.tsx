"use client";

import { useState } from "react";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { useModalFocusTrap } from "@/components/ui/use-modal-focus-trap";
import { formatEuros } from "@/lib/format";
import type { AvailableAppointmentView } from "@/lib/tour-runs";
import type { GeocodedAddress } from "@/data/geocoding";

const speciesEmoji: Record<string, string> = { Chien: "🐶", Chat: "🐱", Cheval: "🐴", NAC: "🐹" };

const manualStopTypes: { value: string; label: string }[] = [
  { value: "OTHER", label: "Adresse" },
  { value: "BREAK", label: "Pause" },
  { value: "MEAL", label: "Repas" },
  { value: "CLINIC", label: "Clinique" },
  { value: "STABLE", label: "Écurie" },
  { value: "SUPPLIER", label: "Fournisseur" },
];

type TourRunAddStopModalProps = {
  availableAppointments: AvailableAppointmentView[];
  onAddAppointments: (appointmentIds: string[]) => Promise<void>;
  onAddManual: (input: { type: string; label: string; address: string | null; latitude: number | null; longitude: number | null }) => Promise<void>;
  onClose: () => void;
};

export function TourRunAddStopModal({ availableAppointments, onAddAppointments, onAddManual, onClose }: TourRunAddStopModalProps) {
  const dialogRef = useModalFocusTrap<HTMLElement>(onClose);
  const [tab, setTab] = useState<"appointments" | "manual">(availableAppointments.length > 0 ? "appointments" : "manual");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const [manualType, setManualType] = useState("OTHER");
  const [manualLabel, setManualLabel] = useState("");
  const [manualQuery, setManualQuery] = useState("");
  const [manualAddress, setManualAddress] = useState<GeocodedAddress | null>(null);

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submitAppointments() {
    if (selected.size === 0) return;
    setSubmitting(true);
    await onAddAppointments([...selected]);
    setSubmitting(false);
  }

  async function submitManual() {
    if (!manualLabel.trim()) return;
    setSubmitting(true);
    await onAddManual({
      type: manualType,
      label: manualLabel.trim(),
      address: manualAddress?.label ?? (manualQuery.trim() || null),
      latitude: manualAddress?.latitude ?? null,
      longitude: manualAddress?.longitude ?? null,
    });
    setSubmitting(false);
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#102f37]/60 p-4 backdrop-blur-sm" role="presentation">
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="add-stop-title" className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-[18px] bg-white shadow-[0_24px_70px_rgba(12,39,47,0.3)] outline-none">
        <div className="flex items-center justify-between border-b border-[#e5eeeb] p-5">
          <h2 id="add-stop-title" className="text-lg font-black text-animeo-dark">Ajouter un arrêt</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="flex h-9 w-9 items-center justify-center rounded-lg text-animeo-muted hover:bg-animeo-bg">✕</button>
        </div>

        <div className="flex gap-1 border-b border-[#e5eeeb] px-5 pt-3">
          <button type="button" onClick={() => setTab("appointments")} className={`rounded-t-lg px-4 py-2 text-sm font-extrabold ${tab === "appointments" ? "border-b-2 border-animeo text-animeo-dark" : "text-animeo-muted"}`}>Rendez-vous du jour</button>
          <button type="button" onClick={() => setTab("manual")} className={`rounded-t-lg px-4 py-2 text-sm font-extrabold ${tab === "manual" ? "border-b-2 border-animeo text-animeo-dark" : "text-animeo-muted"}`}>Adresse manuelle</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {tab === "appointments" ? (
            availableAppointments.length === 0 ? (
              <p className="text-sm font-semibold text-animeo-muted">Tous les rendez-vous de ce jour sont déjà dans la tournée.</p>
            ) : (
              <ul className="space-y-2">
                {availableAppointments.map((appointment) => (
                  <li key={appointment.id}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-[#e5eeeb] px-3 py-2.5 hover:bg-animeo-bg">
                      <input type="checkbox" checked={selected.has(appointment.id)} onChange={() => toggleSelected(appointment.id)} className="h-5 w-5 accent-animeo" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black text-animeo-dark">{appointment.start} — {appointment.animalSpecies ? `${speciesEmoji[appointment.animalSpecies] ?? ""} ` : ""}{appointment.animalName}</p>
                        <p className="truncate text-xs font-semibold text-animeo-muted">{appointment.clientName}{appointment.city ? ` · ${appointment.city}` : ""} · {formatEuros(appointment.price)}</p>
                      </div>
                    </label>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <div className="space-y-4">
              <div>
                <label htmlFor="manual-stop-type" className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.08em] text-animeo-muted">Type</label>
                <select id="manual-stop-type" value={manualType} onChange={(event) => setManualType(event.target.value)} className="min-h-11 w-full rounded-xl border border-[#d7e4e1] bg-white px-3 text-sm font-bold text-animeo-dark">
                  {manualStopTypes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="manual-stop-label" className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.08em] text-animeo-muted">Nom de l’arrêt</label>
                <input id="manual-stop-label" type="text" value={manualLabel} onChange={(event) => setManualLabel(event.target.value)} placeholder="Ex. Clinique vétérinaire de Barentin" className="min-h-11 w-full rounded-xl border border-[#d7e4e1] bg-white px-3 text-sm font-semibold text-animeo-dark" />
              </div>
              {manualType !== "BREAK" && manualType !== "MEAL" ? (
                <div>
                  <label className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.08em] text-animeo-muted">Adresse</label>
                  <AddressAutocomplete
                    value={manualQuery}
                    onQueryChange={(value) => { setManualQuery(value); setManualAddress(null); }}
                    onSelect={setManualAddress}
                    placeholder="Rechercher une adresse ou un lieu"
                    inputClassName="min-h-11 w-full rounded-xl border border-[#d7e4e1] bg-white px-3 text-sm font-semibold text-animeo-dark"
                  />
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-[#e5eeeb] p-5">
          <button type="button" onClick={onClose} className="rounded-xl border border-[#d4e2df] px-5 py-2.5 text-sm font-extrabold text-animeo-dark transition hover:bg-animeo-bg">Annuler</button>
          {tab === "appointments" ? (
            <button type="button" onClick={submitAppointments} disabled={selected.size === 0 || submitting} className="rounded-xl bg-animeo px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-[#459e90] disabled:cursor-not-allowed disabled:opacity-60">
              {submitting ? "Ajout…" : `Ajouter (${selected.size})`}
            </button>
          ) : (
            <button type="button" onClick={submitManual} disabled={!manualLabel.trim() || submitting} className="rounded-xl bg-animeo px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-[#459e90] disabled:cursor-not-allowed disabled:opacity-60">
              {submitting ? "Ajout…" : "Ajouter comme étape"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
