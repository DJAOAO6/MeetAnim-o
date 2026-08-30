"use client";

import { useState } from "react";
import { AppointmentForm } from "@/components/appointments/appointment-form";
import { useAppointments } from "@/components/appointments/appointments-context";
import { inputClassName } from "@/components/settings/settings-fields";
import { useModalFocusTrap } from "@/components/ui/use-modal-focus-trap";
import { confirmDiscardChanges } from "@/components/ui/use-unsaved-changes-warning";
import { appointmentStatusLabels, type AppointmentStatus } from "@/data/appointments";
import type { ClientPickerOption } from "@/data/clients";

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
    newAppointmentDefaultDate,
    openManager,
    openNewAppointment,
    closeManager,
    saveAppointment,
    updateAppointmentStatus,
  } = useAppointments();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [actionError, setActionError] = useState<string | null>(null);
  const [formDirty, setFormDirty] = useState(false);

  function guardedCloseManager() {
    if (!confirmDiscardChanges(formDirty)) return;
    closeManager();
  }

  const dialogRef = useModalFocusTrap<HTMLElement>(guardedCloseManager, managerOpen);

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
          <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="appointments-manager-title" className="absolute inset-y-0 right-0 flex w-full max-w-3xl flex-col bg-animeo-bg shadow-[-20px_0_60px_rgba(12,39,47,0.25)] outline-none">
            <header className="flex items-start justify-between gap-4 border-b border-[#dce8e5] bg-white p-5 sm:p-6">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-animeo">Disponible sur tous les onglets</p>
                <h2 id="appointments-manager-title" className="mt-1 text-2xl font-black text-animeo-dark">Gestion des rendez-vous</h2>
                <p className="mt-1 text-sm text-animeo-muted">Consultez et modifiez votre agenda sans quitter la page en cours.</p>
              </div>
              <button type="button" onClick={guardedCloseManager} aria-label="Fermer" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-animeo-bg text-2xl text-animeo-muted">×</button>
            </header>

            {creatingAppointment || selectedAppointment ? (
              <AppointmentForm
                key={selectedAppointment?.id ?? "new-appointment"}
                appointment={selectedAppointment}
                clients={clients}
                defaultDate={newAppointmentDefaultDate}
                onSave={saveAppointment}
                onBack={() => openManager()}
                onDirtyChange={setFormDirty}
              />
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="border-b border-[#dce8e5] bg-white p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <input value={search} onChange={(event) => setSearch(event.target.value)} className={`${inputClassName} flex-1`} placeholder="Rechercher un client, un animal ou une prestation" />
                    <button type="button" onClick={() => openNewAppointment()} className="rounded-xl bg-animeo px-4 py-2.5 text-sm font-extrabold text-white">+ Nouveau rendez-vous</button>
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

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(year, month - 1, day, 12));
}

function formatPrice(value: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(value);
}
