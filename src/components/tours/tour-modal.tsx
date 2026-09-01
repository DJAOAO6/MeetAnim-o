"use client";

import { useMemo, useState, type FormEvent } from "react";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Icon } from "@/components/ui/icon";
import { useModalFocusTrap } from "@/components/ui/use-modal-focus-trap";
import { useUnsavedChangesWarning } from "@/components/ui/use-unsaved-changes-warning";
import { Toggle } from "@/components/settings/settings-fields";
import { notify } from "@/lib/notify";
import { saveZoneAction } from "@/lib/tours-actions";
import type { GeocodedAddress } from "@/data/geocoding";
import type { Tour, Zone } from "@/data/tours";

export type TourFormValue = {
  id?: string;
  name: string;
  recurrence: Tour["recurrence"];
  day: string;
  dateId: string | null;
  startTime: string;
  endTime: string;
  zoneIds: string[];
  status: Tour["status"];
  startType: Tour["startType"];
  startAddress: string | null;
  startLatitude: number | null;
  startLongitude: number | null;
  maxStops: number | null;
  note: string;
};

type TourModalProps = {
  tour?: Tour;
  zones: Zone[];
  onClose: () => void;
  onSave: (value: TourFormValue) => void;
  onZoneCreated: (zone: Zone) => void;
  onDelete?: (tour: Tour) => void;
};

const frenchDays = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const days = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const inputClassName = "h-11 w-full rounded-xl border border-[#d9e5e2] bg-animeo-bg px-3.5 text-sm text-animeo-dark outline-none transition focus:border-animeo focus:bg-white";

function weekdayFromDateId(dateId: string): string {
  const [year, month, day] = dateId.split("-").map(Number);
  return frenchDays[new Date(year, month - 1, day).getDay()];
}

function todayDateId(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function TourModal({ tour, zones, onClose, onSave, onZoneCreated, onDelete }: TourModalProps) {
  const [name, setName] = useState(tour?.name ?? "");
  const [isRecurring, setIsRecurring] = useState(tour ? tour.recurrence !== "Une seule fois" : true);
  const [recurrence, setRecurrence] = useState<Tour["recurrence"]>(tour && tour.recurrence !== "Une seule fois" ? tour.recurrence : "Toutes les semaines");
  const [day, setDay] = useState(tour?.day ?? "Lundi");
  const [date, setDate] = useState(tour?.dateId ?? todayDateId());
  const [startTime, setStartTime] = useState(tour?.startTime ?? "09:00");
  const [endTime, setEndTime] = useState(tour?.endTime ?? "18:00");
  const [zoneIds, setZoneIds] = useState<string[]>(tour?.zoneIds ?? []);
  const [zoneQuery, setZoneQuery] = useState("");
  const [creatingZone, setCreatingZone] = useState(false);
  const [status, setStatus] = useState<Tour["status"]>(tour?.status ?? "Active");
  const [startType, setStartType] = useState<Tour["startType"]>(tour?.startType ?? "Cabinet");
  const [startAddressQuery, setStartAddressQuery] = useState(tour?.startAddress ?? "");
  const [startAddress, setStartAddress] = useState<GeocodedAddress | null>(
    tour?.startAddress && tour.startCoordinates
      ? { id: "existing", label: tour.startAddress, postcode: "", city: "", latitude: tour.startCoordinates.lat, longitude: tour.startCoordinates.lng }
      : null,
  );
  const [maxStops, setMaxStops] = useState(tour?.maxStops != null ? String(tour.maxStops) : "");
  const [note, setNote] = useState(tour?.note ?? "");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const needsAnchorDate = !isRecurring || recurrence === "Toutes les deux semaines" || recurrence === "Tous les mois";

  const [initialSnapshot] = useState(() => JSON.stringify({ name, isRecurring, recurrence, day, date, startTime, endTime, zoneIds, status, startType, startAddressQuery, maxStops, note }));
  const isDirty = JSON.stringify({ name, isRecurring, recurrence, day, date, startTime, endTime, zoneIds, status, startType, startAddressQuery, maxStops, note }) !== initialSnapshot;
  const { confirmDiscard } = useUnsavedChangesWarning(isDirty);
  function guardedClose() {
    if (confirmDiscard()) onClose();
  }
  const dialogRef = useModalFocusTrap<HTMLElement>(guardedClose);

  const filteredZones = useMemo(() => {
    const trimmed = zoneQuery.trim().toLocaleLowerCase("fr-FR");
    if (!trimmed) return zones;
    return zones.filter((zone) => zone.name.toLocaleLowerCase("fr-FR").includes(trimmed));
  }, [zones, zoneQuery]);
  const exactZoneMatch = zones.some((zone) => zone.name.toLocaleLowerCase("fr-FR") === zoneQuery.trim().toLocaleLowerCase("fr-FR"));

  function toggleZone(id: string) {
    setZoneIds((current) => current.includes(id) ? current.filter((zoneId) => zoneId !== id) : [...current, id]);
  }

  async function createZoneInline() {
    const trimmed = zoneQuery.trim();
    if (!trimmed || exactZoneMatch) return;
    setCreatingZone(true);
    const result = await saveZoneAction({ name: trimmed, cities: [] });
    setCreatingZone(false);
    if (!result.ok) {
      notify.error(result.error);
      return;
    }
    onZoneCreated(result.zone);
    setZoneIds((current) => [...current, result.zone.id]);
    setZoneQuery("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (zoneIds.length === 0) {
      notify.error("Sélectionnez au moins une zone.");
      return;
    }
    if (startType === "Adresse personnalisée" && !startAddress) {
      notify.error("Choisissez une adresse de départ dans les suggestions.");
      return;
    }

    setSaving(true);
    onSave({
      id: tour?.id,
      name: name.trim(),
      recurrence: isRecurring ? recurrence : "Une seule fois",
      day: isRecurring && recurrence !== "Tous les mois" ? day : weekdayFromDateId(date),
      dateId: needsAnchorDate ? date : null,
      startTime,
      endTime,
      zoneIds,
      status,
      startType,
      startAddress: startType === "Adresse personnalisée" ? (startAddress?.label ?? null) : null,
      startLatitude: startType === "Adresse personnalisée" ? (startAddress?.latitude ?? null) : null,
      startLongitude: startType === "Adresse personnalisée" ? (startAddress?.longitude ?? null) : null,
      maxStops: maxStops.trim() ? Number(maxStops) : null,
      note: note.trim(),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#102f37]/55 p-4 backdrop-blur-sm" role="presentation">
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="tour-dialog-title" className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[18px] bg-white shadow-[0_24px_70px_rgba(12,39,47,0.3)] outline-none">
        <div className="flex items-start justify-between border-b border-[#e5eeeb] bg-gradient-to-r from-animeo-soft to-white p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-animeo text-white"><Icon name="tournees" className="h-6 w-6" /></div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-animeo">Consultations à domicile</p>
              <h2 id="tour-dialog-title" className="mt-1 text-2xl font-medium text-animeo-dark">{tour ? "Modifier la tournée" : "Créer une tournée"}</h2>
              <p className="mt-1 text-sm text-animeo-muted">Une ou plusieurs zones, un rythme, un point de départ.</p>
            </div>
          </div>
          <button type="button" onClick={guardedClose} aria-label="Fermer la fenêtre" className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-xl text-animeo-muted shadow-sm">×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
            <Field label="Nom de la tournée" wide>
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex. Secteur Dieppe" className={inputClassName} required />
            </Field>

            <Field label="Zones" wide>
              <input
                value={zoneQuery}
                onChange={(event) => setZoneQuery(event.target.value)}
                placeholder="Rechercher ou créer une zone"
                className={inputClassName}
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {filteredZones.map((zone) => {
                  const selected = zoneIds.includes(zone.id);
                  return (
                    <button
                      key={zone.id}
                      type="button"
                      onClick={() => toggleZone(zone.id)}
                      aria-pressed={selected}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${selected ? "border-animeo bg-animeo-soft text-animeo-dark" : "border-transparent bg-animeo-bg text-animeo-muted hover:text-animeo-dark"}`}
                    >
                      {zone.name}
                    </button>
                  );
                })}
              </div>
              {zoneQuery.trim() && !exactZoneMatch ? (
                <button type="button" onClick={createZoneInline} disabled={creatingZone} className="mt-2 text-xs font-medium text-animeo hover:underline disabled:opacity-60">
                  {creatingZone ? "Création…" : `+ Créer la zone "${zoneQuery.trim()}"`}
                </button>
              ) : null}
              {zoneIds.length === 0 ? <p className="mt-1.5 text-xs font-semibold text-[#a9573b]">Sélectionnez au moins une zone.</p> : null}
            </Field>

            <Field label="Type" wide>
              <div className="inline-flex rounded-xl bg-animeo-soft p-1">
                <button type="button" onClick={() => setIsRecurring(true)} aria-pressed={isRecurring} className={`rounded-lg px-5 py-2 text-sm font-medium transition ${isRecurring ? "bg-white text-animeo-dark shadow-sm" : "text-animeo-muted"}`}>Récurrente</button>
                <button type="button" onClick={() => setIsRecurring(false)} aria-pressed={!isRecurring} className={`rounded-lg px-5 py-2 text-sm font-medium transition ${!isRecurring ? "bg-white text-animeo-dark shadow-sm" : "text-animeo-muted"}`}>Ponctuelle</button>
              </div>
            </Field>

            {isRecurring ? (
              <>
                <Field label="Récurrence">
                  <select value={recurrence} onChange={(event) => setRecurrence(event.target.value as Tour["recurrence"])} className={inputClassName}>
                    <option value="Toutes les semaines">Toutes les semaines</option>
                    <option value="Toutes les deux semaines">Une semaine sur deux</option>
                    <option value="Tous les mois">Tous les mois</option>
                  </select>
                </Field>
                {recurrence !== "Tous les mois" ? (
                  <Field label="Jour">
                    <select value={day} onChange={(event) => setDay(event.target.value)} className={inputClassName}>
                      {days.map((item) => <option key={item} value={item}>{item.toLocaleLowerCase("fr-FR")}</option>)}
                    </select>
                  </Field>
                ) : null}
              </>
            ) : null}

            {needsAnchorDate ? (
              <Field label={isRecurring ? "Date de la première occurrence" : "Date"}>
                <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={inputClassName} required />
              </Field>
            ) : null}

            <Field label="Heure de début">
              <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className={inputClassName} required />
            </Field>

            <Field label="Heure de fin">
              <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className={inputClassName} required />
            </Field>

            <Field label="Point de départ" wide>
              <div className="inline-flex rounded-xl bg-animeo-soft p-1">
                <button type="button" onClick={() => setStartType("Cabinet")} aria-pressed={startType === "Cabinet"} className={`rounded-lg px-5 py-2 text-sm font-medium transition ${startType === "Cabinet" ? "bg-white text-animeo-dark shadow-sm" : "text-animeo-muted"}`}>Cabinet</button>
                <button type="button" onClick={() => setStartType("Adresse personnalisée")} aria-pressed={startType === "Adresse personnalisée"} className={`rounded-lg px-5 py-2 text-sm font-medium transition ${startType === "Adresse personnalisée" ? "bg-white text-animeo-dark shadow-sm" : "text-animeo-muted"}`}>Adresse personnalisée</button>
              </div>
              {startType === "Adresse personnalisée" ? (
                <div className="mt-2">
                  <AddressAutocomplete
                    value={startAddressQuery}
                    onQueryChange={(value) => { setStartAddressQuery(value); setStartAddress(null); }}
                    onSelect={(result) => { setStartAddress(result); setStartAddressQuery(result.label); }}
                    placeholder="Rechercher une adresse"
                    inputClassName={inputClassName}
                  />
                </div>
              ) : null}
            </Field>

            <Field label="Arrêts max (optionnel)">
              <input type="number" min={1} value={maxStops} onChange={(event) => setMaxStops(event.target.value)} placeholder="Aucune limite" className={inputClassName} />
            </Field>

            <Field label="Statut">
              <Toggle checked={status === "Active"} onChange={(checked) => setStatus(checked ? "Active" : "Inactive")} label={status === "Active" ? "Active" : "Inactive"} />
            </Field>

            <Field label="Note (optionnel)" wide>
              <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ex. l'écurie n'ouvre qu'à 14 h" rows={2} className={`${inputClassName} h-auto py-2.5`} />
            </Field>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-[#e5eeeb] p-5 sm:flex-row sm:items-center sm:justify-end sm:p-6">
            {tour && onDelete ? (
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(true)}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-500 transition hover:bg-red-500/20 sm:mr-auto"
              >
                <TrashIcon />
                Supprimer la tournée
              </button>
            ) : null}
            <button type="button" onClick={guardedClose} className="rounded-xl border border-[#d4e2df] px-5 py-2.5 text-sm font-medium text-animeo-dark transition hover:bg-animeo-bg">Annuler</button>
            <button type="submit" disabled={saving} className="rounded-xl bg-animeo px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#459e90] disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Enregistrement…" : tour ? "Enregistrer" : "Créer la tournée"}</button>
          </div>
        </form>
      </section>

      {tour && onDelete && deleteConfirmOpen ? (
        <ConfirmModal
          title="Supprimer cette tournée ?"
          message={
            tour.appointmentCount > 0
              ? `« ${tour.name} » contient ${tour.appointmentCount} rendez-vous à sa prochaine occurrence. Ils resteront dans votre agenda mais ne seront plus rattachés à une tournée. Cette action est irréversible.`
              : `« ${tour.name} » sera définitivement supprimée. Cette action est irréversible.`
          }
          confirmLabel="Supprimer la tournée"
          onConfirm={() => onDelete(tour)}
          onClose={() => setDeleteConfirmOpen(false)}
        />
      ) : null}
    </div>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={wide ? "sm:col-span-2" : ""}>
      <span className="mb-2 block text-xs font-medium uppercase tracking-[0.11em] text-animeo-muted">{label}</span>
      {children}
    </label>
  );
}
