"use client";

import { useState, type FormEvent } from "react";
import { useAppointments } from "@/components/appointments/appointments-context";
import { Field, inputClassName, textareaClassName } from "@/components/settings/settings-fields";
import { appointmentStatusLabels, type Appointment, type AppointmentStatus } from "@/data/appointments";
import type { ClientPickerOption } from "@/data/clients";
import { animalSpeciesList, type AnimalSpecies } from "@/data/species";
import type { SaveAppointmentInput } from "@/lib/appointments-actions";

type StatusFilter = "all" | AppointmentStatus;

const statusStyles: Record<AppointmentStatus, string> = {
  pending: "bg-[#fff1d5] text-[#986216]",
  confirmed: "bg-animeo-soft text-[#24755f]",
  completed: "bg-[#e8f1f4] text-animeo-dark",
  cancelled: "bg-[#eef1f1] text-animeo-muted",
};

export function GlobalAppointmentsManager({ clients }: { clients: ClientPickerOption[] }) {
  const {
    appointments,
    managerOpen,
    selectedAppointmentId,
    creatingAppointment,
    openManager,
    openNewAppointment,
    closeManager,
    saveAppointment,
    updateAppointmentStatus,
  } = useAppointments();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleStatusChange(appointmentId: string, status: AppointmentStatus) {
    setActionError(null);
    const result = await updateAppointmentStatus(appointmentId, status);
    if (!result.ok) setActionError(result.error ?? "Une erreur est survenue.");
  }

  const selectedAppointment = appointments.find((appointment) => appointment.id === selectedAppointmentId);
  const filteredAppointments = appointments
    .filter((appointment) => statusFilter === "all" || appointment.status === statusFilter)
    .filter((appointment) => `${appointment.clientName} ${appointment.animalName} ${appointment.serviceName}`.toLocaleLowerCase("fr-FR").includes(search.toLocaleLowerCase("fr-FR")))
    .sort((first, second) => `${first.date} ${first.start}`.localeCompare(`${second.date} ${second.start}`));

  return (
    <>
      {managerOpen ? (
        <div className="fixed inset-0 z-50 bg-[#102f37]/55 backdrop-blur-sm" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="appointments-manager-title" className="absolute inset-y-0 right-0 flex w-full max-w-3xl flex-col bg-animeo-bg shadow-[-20px_0_60px_rgba(12,39,47,0.25)]">
            <header className="flex items-start justify-between gap-4 border-b border-[#dce8e5] bg-white p-5 sm:p-6">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-animeo">Disponible sur tous les onglets</p>
                <h2 id="appointments-manager-title" className="mt-1 text-2xl font-black text-animeo-dark">Gestion des rendez-vous</h2>
                <p className="mt-1 text-sm text-animeo-muted">Consultez et modifiez votre agenda sans quitter la page en cours.</p>
              </div>
              <button type="button" onClick={closeManager} aria-label="Fermer" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-animeo-bg text-2xl text-animeo-muted">×</button>
            </header>

            {creatingAppointment || selectedAppointment ? (
              <AppointmentForm
                key={selectedAppointment?.id ?? "new-appointment"}
                appointment={selectedAppointment}
                clients={clients}
                onSave={saveAppointment}
                onBack={() => openManager()}
              />
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="border-b border-[#dce8e5] bg-white p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <input value={search} onChange={(event) => setSearch(event.target.value)} className={`${inputClassName} flex-1`} placeholder="Rechercher un client, un animal ou une prestation" />
                    <button type="button" onClick={openNewAppointment} className="rounded-xl bg-animeo px-4 py-2.5 text-sm font-extrabold text-white">+ Nouveau rendez-vous</button>
                  </div>
                  <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                    {(["all", "pending", "confirmed", "completed", "cancelled"] as StatusFilter[]).map((status) => (
                      <button key={status} type="button" onClick={() => setStatusFilter(status)} aria-pressed={statusFilter === status} className={`shrink-0 rounded-xl px-3 py-2 text-xs font-extrabold ${statusFilter === status ? "bg-animeo-dark text-white" : "bg-animeo-bg text-animeo-muted"}`}>
                        {status === "all" ? "Tous" : appointmentStatusLabels[status]}
                      </button>
                    ))}
                  </div>
                </div>

                {actionError ? (
                  <div role="alert" className="mx-4 mt-4 flex items-center justify-between gap-3 rounded-xl bg-[#fff1f1] px-4 py-3 text-sm font-bold text-animeo-error sm:mx-5">
                    <span>{actionError}</span>
                    <button type="button" onClick={() => setActionError(null)} aria-label="Fermer" className="text-lg leading-none">×</button>
                  </div>
                ) : null}

                <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
                  {filteredAppointments.map((appointment) => (
                    <article key={appointment.id} className={`rounded-2xl border border-[#dce8e5] bg-white p-4 ${appointment.status === "cancelled" ? "opacity-65" : ""}`}>
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${statusStyles[appointment.status]}`}>{appointmentStatusLabels[appointment.status]}</span>
                            <span className="text-xs font-extrabold capitalize text-animeo-muted">{formatDate(appointment.date)} · {appointment.start}</span>
                          </div>
                          <h3 className="mt-2 text-lg font-black text-animeo-dark">{appointment.animalName}</h3>
                          <p className="text-sm font-bold text-animeo-muted">{appointment.clientName} · {appointment.serviceName}</p>
                          <p className="mt-1 text-xs text-animeo-muted">{appointment.mode === "cabinet" ? "Cabinet" : `Domicile · ${appointment.location}`} · {appointment.duration} min · {formatPrice(appointment.price)}</p>
                        </div>
                        <button type="button" onClick={() => openManager(appointment.id)} className="shrink-0 rounded-xl bg-animeo-soft px-3 py-2 text-xs font-extrabold text-animeo-dark">Modifier</button>
                      </div>

                      {appointment.status === "pending" ? (
                        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[#e7eeec] pt-3">
                          <button type="button" onClick={() => handleStatusChange(appointment.id, "confirmed")} className="rounded-xl bg-animeo px-3 py-2.5 text-xs font-extrabold text-white">Accepter</button>
                          <button type="button" onClick={() => handleStatusChange(appointment.id, "cancelled")} className="rounded-xl bg-[#fff0eb] px-3 py-2.5 text-xs font-extrabold text-[#a9573b]">Refuser</button>
                        </div>
                      ) : null}
                    </article>
                  ))}
                  {filteredAppointments.length === 0 ? <div className="rounded-2xl bg-white p-8 text-center text-sm font-bold text-animeo-muted">Aucun rendez-vous ne correspond à cette recherche.</div> : null}
                </div>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}

function AppointmentForm({ appointment, clients, onSave, onBack }: {
  appointment?: Appointment;
  clients: ClientPickerOption[];
  onSave: (input: SaveAppointmentInput) => Promise<{ ok: boolean; error?: string }>;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState<Omit<Appointment, "id">>(() => appointment ?? {
    date: "2026-08-25",
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
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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

  function composeLocation(): string {
    if (draft.mode === "cabinet") return "Cabinet";
    const line1 = [addressLine.trim(), addressExtra.trim() ? `(${addressExtra.trim()})` : ""].filter(Boolean).join(" ");
    const line2 = [postalCode.trim(), city.trim()].filter(Boolean).join(" ");
    return [line1, line2].filter(Boolean).join(", ");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFeedback(null);
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
    setFeedback("Rendez-vous enregistré");
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <button type="button" onClick={onBack} className="mb-5 inline-flex items-center gap-1 text-sm font-extrabold text-animeo"><span aria-hidden="true">←</span> Tous les rendez-vous</button>
        <h3 className="text-xl font-black text-animeo-dark">{appointment ? `Modifier le rendez-vous de ${appointment.animalName}` : "Nouveau rendez-vous"}</h3>
        <p className="mt-1 text-sm text-animeo-muted">Le cabinet et le domicile partagent un seul agenda : un créneau déjà pris ne peut pas être réutilisé.</p>

        {feedback ? <div role="status" className="mt-4 rounded-xl bg-animeo-soft px-4 py-3 text-sm font-extrabold text-animeo-dark">✓ {feedback}</div> : null}
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
              <div className="sm:col-span-2"><Field label="Adresse"><input value={addressLine} onChange={(event) => setAddressLine(event.target.value)} className={inputClassName} placeholder="12 rue Exemple" required /></Field></div>
              <div className="sm:col-span-2"><Field label="Complément d’adresse" hint="Facultatif"><input value={addressExtra} onChange={(event) => setAddressExtra(event.target.value)} className={inputClassName} placeholder="Bâtiment, étage, lieu-dit…" /></Field></div>
              <Field label="Code postal" hint="Facultatif"><input value={postalCode} onChange={(event) => setPostalCode(event.target.value)} className={inputClassName} inputMode="numeric" placeholder="76000" /></Field>
              <Field label="Ville" hint="Facultatif"><input value={city} onChange={(event) => setCity(event.target.value)} className={inputClassName} placeholder="Rouen" /></Field>
            </>
          ) : null}

          <div className="sm:col-span-2"><Field label="Notes"><textarea value={draft.notes} onChange={(event) => update("notes", event.target.value)} className={textareaClassName} /></Field></div>
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-[#dce8e5] bg-white p-4 sm:flex-row sm:justify-between sm:p-5">
        {appointment && draft.status !== "cancelled" ? <button type="button" onClick={() => { update("status", "cancelled"); setFeedback("Le statut Annulé sera appliqué après enregistrement"); }} className="rounded-xl bg-[#fff0eb] px-4 py-2.5 text-sm font-extrabold text-[#a9573b]">Annuler le rendez-vous</button> : <span />}
        <button type="submit" disabled={pending} className="rounded-xl bg-animeo px-5 py-2.5 text-sm font-extrabold text-white disabled:opacity-70">{pending ? "Enregistrement…" : "Enregistrer les modifications"}</button>
      </div>
    </form>
  );
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(year, month - 1, day, 12));
}

function formatPrice(value: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(value);
}
