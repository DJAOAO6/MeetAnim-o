"use client";

import { useState, type FormEvent } from "react";
import { useAppointments } from "@/components/appointments/appointments-context";
import { Field, inputClassName, textareaClassName } from "@/components/settings/settings-fields";
import { Icon } from "@/components/ui/icon";
import { appointmentStatusLabels, type Appointment, type AppointmentStatus } from "@/data/appointments";

type StatusFilter = "all" | AppointmentStatus;

const statusStyles: Record<AppointmentStatus, string> = {
  pending: "bg-[#fff1d5] text-[#986216]",
  confirmed: "bg-animeo-soft text-[#24755f]",
  completed: "bg-[#e8f1f4] text-animeo-dark",
  cancelled: "bg-[#eef1f1] text-animeo-muted",
};

export function GlobalAppointmentsManager() {
  const {
    appointments,
    managerOpen,
    selectedAppointmentId,
    creatingAppointment,
    openManager,
    openNewAppointment,
    closeManager,
    saveAppointment,
    updateAppointment,
  } = useAppointments();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const pendingCount = appointments.filter((appointment) => appointment.status === "pending").length;
  const selectedAppointment = appointments.find((appointment) => appointment.id === selectedAppointmentId);
  const filteredAppointments = appointments
    .filter((appointment) => statusFilter === "all" || appointment.status === statusFilter)
    .filter((appointment) => `${appointment.clientName} ${appointment.animalName} ${appointment.serviceName}`.toLocaleLowerCase("fr-FR").includes(search.toLocaleLowerCase("fr-FR")))
    .sort((first, second) => `${first.date} ${first.start}`.localeCompare(`${second.date} ${second.start}`));

  return (
    <>
      {!managerOpen ? (
        <button
          type="button"
          onClick={() => openManager()}
          className="fixed bottom-5 right-4 z-40 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-animeo-dark px-4 py-3 text-sm font-extrabold text-white shadow-[0_14px_35px_rgba(24,59,69,0.3)] transition hover:-translate-y-0.5 sm:bottom-7 sm:right-7"
        >
          <Icon name="agenda" className="h-5 w-5 text-animeo" />
          <span className="hidden sm:inline">Gérer les rendez-vous</span>
          {pendingCount > 0 ? <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-animeo-accent px-1.5 text-xs font-black text-[#5f420f]">{pendingCount}</span> : null}
        </button>
      ) : null}

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
                          <button type="button" onClick={() => updateAppointment(appointment.id, { status: "confirmed" })} className="rounded-xl bg-animeo px-3 py-2.5 text-xs font-extrabold text-white">Accepter</button>
                          <button type="button" onClick={() => updateAppointment(appointment.id, { status: "cancelled" })} className="rounded-xl bg-[#fff0eb] px-3 py-2.5 text-xs font-extrabold text-[#a9573b]">Refuser</button>
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

function AppointmentForm({ appointment, onSave, onBack }: { appointment?: Appointment; onSave: (appointment: Appointment) => void; onBack: () => void }) {
  const [draft, setDraft] = useState<Appointment>(() => appointment ?? {
    id: `rdv-${Date.now()}`,
    date: "2026-08-25",
    start: "09:00",
    duration: 60,
    clientName: "",
    animalName: "",
    serviceName: "Ostéopathie canine",
    mode: "cabinet",
    location: "Cabinet",
    price: 60,
    status: "confirmed",
    notes: "",
  });
  const [feedback, setFeedback] = useState<string | null>(null);

  function update<K extends keyof Appointment>(key: K, value: Appointment[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({ ...draft, location: draft.mode === "cabinet" ? "Cabinet" : draft.location });
    setFeedback("Rendez-vous enregistré localement");
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <button type="button" onClick={onBack} className="mb-5 inline-flex items-center gap-1 text-sm font-extrabold text-animeo"><span aria-hidden="true">←</span> Tous les rendez-vous</button>
        <h3 className="text-xl font-black text-animeo-dark">{appointment ? `Modifier le rendez-vous de ${appointment.animalName}` : "Nouveau rendez-vous"}</h3>
        <p className="mt-1 text-sm text-animeo-muted">Tous les champs restent modifiables dans cette version locale.</p>

        {feedback ? <div role="status" className="mt-4 rounded-xl bg-animeo-soft px-4 py-3 text-sm font-extrabold text-animeo-dark">✓ {feedback}</div> : null}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field label="Client"><input value={draft.clientName} onChange={(event) => update("clientName", event.target.value)} className={inputClassName} required /></Field>
          <Field label="Animal"><input value={draft.animalName} onChange={(event) => update("animalName", event.target.value)} className={inputClassName} required /></Field>
          <div className="sm:col-span-2"><Field label="Prestation"><input value={draft.serviceName} onChange={(event) => update("serviceName", event.target.value)} className={inputClassName} required /></Field></div>
          <Field label="Date"><input type="date" value={draft.date} onChange={(event) => update("date", event.target.value)} className={inputClassName} required /></Field>
          <Field label="Heure"><input type="time" value={draft.start} onChange={(event) => update("start", event.target.value)} className={inputClassName} required /></Field>
          <Field label="Durée"><select value={draft.duration} onChange={(event) => update("duration", Number(event.target.value))} className={inputClassName}>{[30, 45, 60, 90, 120].map((duration) => <option key={duration} value={duration}>{duration} minutes</option>)}</select></Field>
          <Field label="Statut"><select value={draft.status} onChange={(event) => update("status", event.target.value as AppointmentStatus)} className={inputClassName}>{Object.entries(appointmentStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
          <Field label="Mode"><select value={draft.mode} onChange={(event) => update("mode", event.target.value as Appointment["mode"])} className={inputClassName}><option value="cabinet">Cabinet</option><option value="home">Domicile</option></select></Field>
          <Field label="Prix"><div className="relative"><input type="number" min="0" value={draft.price} onChange={(event) => update("price", Number(event.target.value))} className={`${inputClassName} pr-9`} /><span className="absolute right-3 top-3 text-sm font-black text-animeo-muted">€</span></div></Field>
          {draft.mode === "home" ? <div className="sm:col-span-2"><Field label="Adresse ou ville"><input value={draft.location} onChange={(event) => update("location", event.target.value)} className={inputClassName} required /></Field></div> : null}
          <div className="sm:col-span-2"><Field label="Notes"><textarea value={draft.notes} onChange={(event) => update("notes", event.target.value)} className={textareaClassName} /></Field></div>
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-[#dce8e5] bg-white p-4 sm:flex-row sm:justify-between sm:p-5">
        {appointment && draft.status !== "cancelled" ? <button type="button" onClick={() => { update("status", "cancelled"); setFeedback("Le statut Annulé sera appliqué après enregistrement"); }} className="rounded-xl bg-[#fff0eb] px-4 py-2.5 text-sm font-extrabold text-[#a9573b]">Annuler le rendez-vous</button> : <span />}
        <button type="submit" className="rounded-xl bg-animeo px-5 py-2.5 text-sm font-extrabold text-white">Enregistrer les modifications</button>
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
