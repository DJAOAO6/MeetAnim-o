"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Field, fieldDescribedBy, inputClassName, textareaClassName } from "@/components/settings/settings-fields";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { useUnsavedChangesWarning } from "@/components/ui/use-unsaved-changes-warning";
import { appointmentStatusLabels, type Appointment, type AppointmentStatus } from "@/data/appointments";
import type { ClientPickerOption } from "@/data/clients";
import type { GeocodedAddress } from "@/data/geocoding";
import { animalSpeciesList, type AnimalSpecies } from "@/data/species";
import type { SaveAppointmentInput } from "@/lib/appointments-actions";
import { toLocalDateId } from "@/lib/booking-validation";
import { notify } from "@/lib/notify";

export function AppointmentForm({ appointment, clients, defaultDate, onSave, onBack, backLabel = "Tous les rendez-vous", onDirtyChange }: {
  appointment?: Appointment;
  clients: ClientPickerOption[];
  // Jour pré-sélectionné dans l'agenda au moment du clic sur "Nouveau
  // rendez-vous" (vue Jour/Semaine/Mois/Année) — voir AgendaView. Ignoré en
  // modification (la date existante du rendez-vous prime toujours).
  defaultDate?: string;
  onSave: (input: SaveAppointmentInput) => Promise<{ ok: boolean; error?: string }>;
  onBack: () => void;
  backLabel?: string;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState<Omit<Appointment, "id">>(() => appointment ?? {
    date: defaultDate ?? toLocalDateId(new Date()),
    start: "09:00",
    duration: 60,
    clientId: undefined,
    clientName: "",
    animalId: undefined,
    animalName: "",
    animalSpecies: undefined,
    serviceName: "Ostéopathie canine",
    mode: "cabinet",
    location: "Cabinet",
    price: 60,
    status: "confirmed",
    notes: "",
  });
  const [addressLine, setAddressLine] = useState(() => (appointment?.mode === "home" ? appointment.location : ""));
  const [addressExtra, setAddressExtra] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [animalMode, setAnimalMode] = useState<"existing" | "freeform">(appointment?.animalId ? "existing" : "freeform");
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [initialSnapshot, setInitialSnapshot] = useState(() => JSON.stringify({ draft, addressLine, addressExtra, postalCode, city }));
  const isDirty = JSON.stringify({ draft, addressLine, addressExtra, postalCode, city }) !== initialSnapshot;
  const { confirmDiscard } = useUnsavedChangesWarning(isDirty);
  useEffect(() => {
    onDirtyChange?.(isDirty);
    return () => onDirtyChange?.(false);
  }, [isDirty, onDirtyChange]);

  function handleBack() {
    if (!confirmDiscard()) return;
    onBack();
  }

  function update<K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  const selectedClient = clients.find((client) => client.id === draft.clientId);
  const selectedClientAnimals = selectedClient?.animals ?? [];
  const clientMatches = (draft.clientName.trim().length > 0
    ? clients.filter((client) => `${client.firstName} ${client.lastName}`.toLocaleLowerCase("fr-FR").includes(draft.clientName.trim().toLocaleLowerCase("fr-FR")))
    : clients
  ).slice(0, 6);

  function selectClient(client: ClientPickerOption) {
    const fullName = `${client.firstName} ${client.lastName}`;
    const firstAnimal = client.animals[0];
    setDraft((current) => ({
      ...current,
      clientId: client.id,
      clientName: fullName,
      animalId: firstAnimal?.id,
      animalName: firstAnimal?.name ?? "",
      animalSpecies: (firstAnimal?.species as AnimalSpecies) ?? undefined,
    }));
    setAnimalMode(firstAnimal ? "existing" : "freeform");
    setClientPickerOpen(false);
    if (draft.mode === "home") {
      setAddressLine((current) => current || client.address);
    }
  }

  function clearClient() {
    setDraft((current) => ({ ...current, clientId: undefined, animalId: undefined, animalName: "", animalSpecies: undefined }));
    setAnimalMode("freeform");
  }

  function chooseAnimal(animalId: string) {
    const animal = selectedClientAnimals.find((item) => item.id === animalId);
    if (!animal) return;
    setAnimalMode("existing");
    setDraft((current) => ({ ...current, animalId: animal.id, animalName: animal.name, animalSpecies: animal.species as AnimalSpecies }));
  }

  function switchToNewAnimal() {
    setAnimalMode("freeform");
    setDraft((current) => ({ ...current, animalId: undefined, animalName: "", animalSpecies: undefined }));
  }

  function handleModeChange(nextMode: Appointment["mode"]) {
    update("mode", nextMode);
    if (nextMode === "home" && selectedClient) {
      setAddressLine((current) => current || selectedClient.address);
    }
  }

  function applySelectedAddress(result: GeocodedAddress) {
    setAddressLine(result.label);
    setPostalCode(result.postcode);
    setCity(result.city);
  }

  function composeLocation(): string {
    if (draft.mode === "cabinet") return "Cabinet";
    const line1 = [addressLine.trim(), addressExtra.trim() ? `(${addressExtra.trim()})` : ""].filter(Boolean).join(" ");
    const line2 = [postalCode.trim(), city.trim()].filter(Boolean).join(" ");
    return [line1, line2].filter(Boolean).join(", ");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const result = await onSave({
      id: appointment?.id,
      date: draft.date,
      start: draft.start,
      duration: draft.duration,
      clientId: draft.clientId ?? null,
      clientName: draft.clientName.trim(),
      animalId: draft.animalId ?? null,
      animalName: draft.animalName.trim(),
      animalSpecies: draft.animalSpecies ?? null,
      serviceName: draft.serviceName,
      mode: draft.mode,
      location: composeLocation(),
      price: draft.price,
      status: draft.status,
      notes: draft.notes,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? "Une erreur est survenue.");
      return;
    }
    setInitialSnapshot(JSON.stringify({ draft, addressLine, addressExtra, postalCode, city }));
    notify.success(appointment ? "Rendez-vous modifié" : "Rendez-vous créé");
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <button type="button" onClick={handleBack} className="mb-5 inline-flex items-center gap-1 text-sm font-extrabold text-animeo"><span aria-hidden="true">←</span> {backLabel}</button>
        <h3 className="text-xl font-black text-animeo-dark">{appointment ? `Modifier le rendez-vous de ${appointment.animalName}` : "Nouveau rendez-vous"}</h3>
        <p className="mt-1 text-sm text-animeo-muted">Le cabinet et le domicile partagent un seul agenda : un créneau déjà pris ne peut pas être réutilisé.</p>

        {error ? <div role="alert" className="mt-4 rounded-xl bg-[#fff1f1] px-4 py-3 text-sm font-bold text-animeo-error">{error}</div> : null}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Client">
              {draft.clientId ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-[#d9e5e2] bg-animeo-soft px-3.5 py-2.5">
                  <span className="min-w-0 truncate text-sm font-extrabold text-animeo-dark">{draft.clientName}</span>
                  <button type="button" onClick={clearClient} className="shrink-0 text-xs font-extrabold text-animeo">Changer</button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    value={draft.clientName}
                    onChange={(event) => { update("clientName", event.target.value); setClientPickerOpen(true); }}
                    onFocus={() => setClientPickerOpen(true)}
                    onKeyDown={(event) => { if (event.key === "Escape") setClientPickerOpen(false); }}
                    className={inputClassName}
                    placeholder="Nom du client, ou recherchez une fiche existante"
                    autoComplete="off"
                    required
                  />
                  {clientPickerOpen && clientMatches.length > 0 ? (
                    <div className="absolute inset-x-0 top-[calc(100%+4px)] z-10 max-h-56 overflow-y-auto rounded-xl border border-[#d9e5e2] bg-white p-1.5 shadow-[0_16px_35px_rgba(21,63,71,0.14)]">
                      {clientMatches.map((client) => (
                        <button
                          key={client.id}
                          type="button"
                          onMouseDown={(event) => { event.preventDefault(); selectClient(client); }}
                          className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-animeo-bg"
                        >
                          <span className="font-extrabold text-animeo-dark">{client.firstName} {client.lastName}</span>
                          <span className="text-xs text-animeo-muted">{client.animals.length} animal{client.animals.length > 1 ? "s" : ""}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </Field>
          </div>

          <div className="sm:col-span-2">
            <Field label="Animal">
              {selectedClientAnimals.length > 0 && animalMode === "existing" ? (
                <select
                  value={draft.animalId ?? "__new__"}
                  onChange={(event) => (event.target.value === "__new__" ? switchToNewAnimal() : chooseAnimal(event.target.value))}
                  className={inputClassName}
                >
                  {selectedClientAnimals.map((animal) => <option key={animal.id} value={animal.id}>{animal.name} · {animal.species}</option>)}
                  <option value="__new__">+ Nouvel animal (non enregistré chez ce client)</option>
                </select>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <input value={draft.animalName} onChange={(event) => update("animalName", event.target.value)} className={inputClassName} placeholder="Nom de l’animal" required />
                  <select value={draft.animalSpecies ?? "Chien"} onChange={(event) => update("animalSpecies", event.target.value as AnimalSpecies)} className={inputClassName}>
                    {animalSpeciesList.map((species) => <option key={species} value={species}>{species}</option>)}
                  </select>
                  {selectedClientAnimals.length > 0 ? (
                    <button type="button" onClick={() => chooseAnimal(selectedClientAnimals[0].id)} className="text-left text-xs font-extrabold text-animeo sm:col-span-2">
                      ← Choisir parmi les animaux de {selectedClient?.firstName}
                    </button>
                  ) : null}
                </div>
              )}
            </Field>
          </div>

          <div className="sm:col-span-2"><Field label="Prestation"><input value={draft.serviceName} onChange={(event) => update("serviceName", event.target.value)} className={inputClassName} required /></Field></div>
          <Field label="Date"><input type="date" value={draft.date} onChange={(event) => update("date", event.target.value)} className={inputClassName} required /></Field>
          <Field label="Heure"><input type="time" value={draft.start} onChange={(event) => update("start", event.target.value)} className={inputClassName} required /></Field>
          <Field label="Durée"><select value={draft.duration} onChange={(event) => update("duration", Number(event.target.value))} className={inputClassName}>{[30, 45, 60, 90, 120].map((duration) => <option key={duration} value={duration}>{duration} minutes</option>)}</select></Field>
          <Field label="Statut"><select value={draft.status} onChange={(event) => update("status", event.target.value as AppointmentStatus)} className={inputClassName}>{Object.entries(appointmentStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
          <Field label="Mode"><select value={draft.mode} onChange={(event) => handleModeChange(event.target.value as Appointment["mode"])} className={inputClassName}><option value="cabinet">Cabinet</option><option value="home">Domicile</option></select></Field>
          <Field label="Prix"><div className="relative"><input type="number" min="0" value={draft.price} onChange={(event) => update("price", Number(event.target.value))} className={`${inputClassName} pr-9`} /><span className="absolute right-3 top-3 text-sm font-black text-animeo-muted">€</span></div></Field>

          {draft.mode === "home" ? (
            <>
              <div className="sm:col-span-2">
                <Field label="Adresse">
                  <AddressAutocomplete value={addressLine} onQueryChange={setAddressLine} onSelect={applySelectedAddress} inputClassName={inputClassName} placeholder="12 rue Exemple" required />
                </Field>
              </div>
              <div className="sm:col-span-2"><Field id="appt-form-address-extra" label="Complément d’adresse" hint="Facultatif"><input value={addressExtra} onChange={(event) => setAddressExtra(event.target.value)} className={inputClassName} placeholder="Bâtiment, étage, lieu-dit…" aria-describedby={fieldDescribedBy("appt-form-address-extra", { hasHint: true })} /></Field></div>
              <Field id="appt-form-postal-code" label="Code postal" hint="Facultatif"><input value={postalCode} onChange={(event) => setPostalCode(event.target.value)} className={inputClassName} inputMode="numeric" placeholder="76000" aria-describedby={fieldDescribedBy("appt-form-postal-code", { hasHint: true })} /></Field>
              <Field id="appt-form-city" label="Ville" hint="Facultatif"><input value={city} onChange={(event) => setCity(event.target.value)} className={inputClassName} placeholder="Rouen" aria-describedby={fieldDescribedBy("appt-form-city", { hasHint: true })} /></Field>
            </>
          ) : null}

          <div className="sm:col-span-2"><Field label="Notes"><textarea value={draft.notes} onChange={(event) => update("notes", event.target.value)} className={textareaClassName} /></Field></div>
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-[#dce8e5] bg-white p-4 sm:flex-row sm:justify-between sm:p-5">
        {appointment && draft.status !== "cancelled" ? <button type="button" onClick={() => { update("status", "cancelled"); notify.info("Le statut Annulé sera appliqué après enregistrement"); }} className="rounded-xl bg-[#fff0eb] px-4 py-2.5 text-sm font-extrabold text-[#a9573b]">Annuler le rendez-vous</button> : <span />}
        <button type="submit" disabled={pending} className="rounded-xl bg-animeo px-5 py-2.5 text-sm font-extrabold text-white disabled:opacity-70">{pending ? "Enregistrement…" : appointment ? "Enregistrer les modifications" : "Créer le rendez-vous"}</button>
      </div>
    </form>
  );
}
