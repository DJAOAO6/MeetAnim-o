"use client";

import { useState } from "react";
import { useModalFocusTrap } from "@/components/ui/use-modal-focus-trap";
import { formatEuros } from "@/lib/format";
import type { MapClient } from "@/data/tours";
import type { ServiceSettings } from "@/data/settings";

const speciesEmoji: Record<string, string> = { Chien: "🐶", Chat: "🐱", Cheval: "🐴", NAC: "🐹" };

export type ClientAppointmentInput = {
  serviceId: string;
  serviceName: string;
  start: string;
  duration: number;
  price: number;
  notes: string;
};

type TourRunAddClientAppointmentModalProps = {
  client: MapClient;
  services: ServiceSettings[];
  // Première heure libre estimée après le dernier arrêt (départ si aucun
  // arrêt) — une proposition, jamais imposée : la vraie validation du
  // créneau reste entièrement celle de saveAppointmentAction (conflit,
  // tampon de trajet), pas recalculée ici.
  suggestedStart: string | null;
  submitting: boolean;
  error: string | null;
  onSubmit: (input: ClientAppointmentInput) => void;
  onClose: () => void;
};

/**
 * Phase 3 bis (suite) : "ajouter à cette journée" depuis un client de la
 * carte crée un vrai rendez-vous à domicile — via l'action serveur de
 * création existante (mêmes contrôles de conflit/tampon), jamais un arrêt
 * manuel sans rendez-vous. Ce formulaire ne fait que rassembler les champs
 * qu'aucune autre source ne connaît déjà (prestation, heure, durée, prix).
 */
export function TourRunAddClientAppointmentModal({ client, services, suggestedStart, submitting, error, onSubmit, onClose }: TourRunAddClientAppointmentModalProps) {
  const dialogRef = useModalFocusTrap<HTMLElement>(onClose);
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const selectedService = services.find((service) => service.id === serviceId) ?? null;
  const [start, setStart] = useState(suggestedStart ?? "09:00");
  const [duration, setDuration] = useState(selectedService?.duration ?? 30);
  const [price, setPrice] = useState(selectedService?.homePrice ?? 0);
  const [notes, setNotes] = useState("");

  function selectService(id: string) {
    setServiceId(id);
    const service = services.find((candidate) => candidate.id === id);
    if (service) {
      setDuration(service.duration);
      setPrice(service.homePrice);
    }
  }

  function submit() {
    if (!selectedService || !start) return;
    onSubmit({ serviceId: selectedService.id, serviceName: selectedService.name, start, duration, price, notes });
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#102f37]/60 p-4 backdrop-blur-sm" role="presentation">
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="add-client-appointment-title" className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-[18px] bg-white shadow-[0_24px_70px_rgba(12,39,47,0.3)] outline-none">
        <div className="flex items-center justify-between border-b border-[#e5eeeb] p-5">
          <div>
            <h2 id="add-client-appointment-title" className="text-lg font-black text-animeo-dark">Ajouter à cette journée</h2>
            <p className="mt-0.5 text-xs font-semibold text-animeo-muted">
              {client.species ? `${speciesEmoji[client.species] ?? ""} ` : ""}{client.animalName} — {client.ownerName}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-animeo-muted hover:bg-animeo-bg">✕</button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {services.length === 0 ? (
            <p className="text-sm font-semibold text-animeo-muted">Aucune prestation à domicile n’est active pour l’instant — configurez-en une dans Paramètres &gt; Prestations.</p>
          ) : (
            <>
              <div>
                <label htmlFor="client-appointment-service" className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.08em] text-animeo-muted">Prestation</label>
                <select id="client-appointment-service" value={serviceId} onChange={(event) => selectService(event.target.value)} className="min-h-11 w-full rounded-xl border border-[#d7e4e1] bg-white px-3 text-sm font-bold text-animeo-dark">
                  {services.map((service) => <option key={service.id} value={service.id}>{service.name} — {formatEuros(service.homePrice)}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="client-appointment-start" className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.08em] text-animeo-muted">Heure</label>
                  <input id="client-appointment-start" type="time" value={start} onChange={(event) => setStart(event.target.value)} className="min-h-11 w-full rounded-xl border border-[#d7e4e1] bg-white px-3 text-sm font-bold text-animeo-dark" />
                </div>
                <div>
                  <label htmlFor="client-appointment-duration" className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.08em] text-animeo-muted">Durée (min)</label>
                  <input id="client-appointment-duration" type="number" min={5} step={5} value={duration} onChange={(event) => setDuration(Number(event.target.value))} className="min-h-11 w-full rounded-xl border border-[#d7e4e1] bg-white px-3 text-sm font-bold text-animeo-dark" />
                </div>
              </div>
              <div>
                <label htmlFor="client-appointment-price" className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.08em] text-animeo-muted">Prix (€)</label>
                <input id="client-appointment-price" type="number" min={0} step={1} value={price} onChange={(event) => setPrice(Number(event.target.value))} className="min-h-11 w-full rounded-xl border border-[#d7e4e1] bg-white px-3 text-sm font-bold text-animeo-dark" />
              </div>
              <div>
                <label htmlFor="client-appointment-notes" className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.08em] text-animeo-muted">Notes (facultatif)</label>
                <textarea id="client-appointment-notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} className="w-full rounded-xl border border-[#d7e4e1] bg-white px-3 py-2 text-sm font-semibold text-animeo-dark" />
              </div>
              {error ? <p className="text-xs font-bold text-[#a9573b]">{error}</p> : null}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-[#e5eeeb] p-5">
          <button type="button" onClick={onClose} className="rounded-xl border border-[#d4e2df] px-5 py-2.5 text-sm font-extrabold text-animeo-dark transition hover:bg-animeo-bg">Annuler</button>
          {services.length > 0 ? (
            <button type="button" onClick={submit} disabled={!selectedService || !start || submitting} className="rounded-xl bg-animeo px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-[#459e90] disabled:cursor-not-allowed disabled:opacity-60">
              {submitting ? "Ajout…" : "Ajouter à la tournée"}
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
