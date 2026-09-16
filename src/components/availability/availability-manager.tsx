"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Modal } from "@/components/ui/modal";
import { Icon } from "@/components/ui/icon";
import { notify } from "@/lib/notify";
import {
  getAppointmentsInPeriodAction,
  updateAvailabilityAction,
  updateManualAvailabilityAction,
  type PeriodAppointment,
} from "@/lib/business-profile-actions";
import {
  availabilityStatus,
  closureAffects,
  closureLastDay,
  formatClosurePeriod,
  formatDateId,
  modeLabels,
  toDateId,
  type AvailabilityMode,
} from "@/lib/availability-status";
import type { AvailabilitySettings, ClosureScope, ExceptionalClosure, TimeSlot } from "@/data/settings";

const MESSAGE_MAX = 300;

const weekdayOrder = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

const reasons = ["Congés", "Formation", "Absence", "Fermeture exceptionnelle", "Autre"];

type AvailabilityManagerProps = {
  initialMode: AvailabilityMode;
  cabinetAvailable: boolean;
  homeAvailable: boolean;
  availability: AvailabilitySettings;
  onClose: () => void;
  onApplied: (next: { cabinetAvailable: boolean; homeAvailable: boolean; availability: AvailabilitySettings }) => void;
};

function scopeFor(mode: AvailabilityMode): ClosureScope {
  return mode === "cabinet" ? "Cabinet uniquement" : "Domicile uniquement";
}

function newId(): string {
  return `closure-${Date.now()}-${Math.round(Math.random() * 1000)}`;
}

function slotsLabel(slots: TimeSlot[], mode: AvailabilityMode): string {
  const relevant = slots.filter((slot) => (mode === "cabinet" ? slot.cabinet : slot.home));
  if (relevant.length === 0) return "Fermé";
  return relevant.map((slot) => `${slot.start} – ${slot.end}`).join("  /  ");
}

/**
 * Gestionnaire de disponibilités : un seul écran pour l'ouverture immédiate,
 * les fermetures datées, les horaires habituels et le message affiché aux
 * clients, cabinet et domicile séparément.
 *
 * Deux natures d'information cohabitent volontairement, parce qu'elles ne
 * répondent pas à la même question :
 *
 * - la bascule manuelle (BusinessProfile.cabinetAvailable / homeAvailable)
 *   dit « en ce moment, j'accepte ou non des réservations » ;
 * - les fermetures datées (AvailabilitySettings.closures) disent « à telles
 *   dates, je ne serai pas là ». Elles cessent de s'appliquer d'elles-mêmes
 *   passé leur date de fin : la réouverture automatique ne demande aucune
 *   tâche de fond.
 *
 * Dans les deux cas, seules les NOUVELLES réservations publiques sont
 * concernées : les rendez-vous déjà pris ne sont jamais annulés, et le
 * praticien continue d'en créer depuis son agenda.
 */
export function AvailabilityManager({ initialMode, cabinetAvailable, homeAvailable, availability, onClose, onApplied }: AvailabilityManagerProps) {
  const [mode, setMode] = useState<AvailabilityMode>(initialMode);
  const [cabinet, setCabinet] = useState(cabinetAvailable);
  const [home, setHome] = useState(homeAvailable);
  const [draft, setDraft] = useState<AvailabilitySettings>(availability);
  const [saving, setSaving] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [closureForm, setClosureForm] = useState<ExceptionalClosure | null>(null);

  const manuallyOpen = mode === "cabinet" ? cabinet : home;
  const status = useMemo(() => availabilityStatus(mode, manuallyOpen, draft), [mode, manuallyOpen, draft]);
  const modeClosures = useMemo(
    () => draft.closures.filter((closure) => closureAffects(closure, mode)).sort((a, b) => a.date.localeCompare(b.date)),
    [draft.closures, mode],
  );

  const dirty = JSON.stringify(draft) !== JSON.stringify(availability);

  async function applyManual(nextCabinet: boolean, nextHome: boolean, message: string) {
    setSaving(true);
    const result = await updateManualAvailabilityAction(nextCabinet, nextHome);
    setSaving(false);
    if (!result.ok) { notify.error(result.error); return; }
    setCabinet(nextCabinet);
    setHome(nextHome);
    onApplied({ cabinetAvailable: nextCabinet, homeAvailable: nextHome, availability: draft });
    notify.success(message);
  }

  function openNow() {
    void applyManual(mode === "cabinet" ? true : cabinet, mode === "home" ? true : home, `${modeLabels[mode]} ouvert aux réservations.`);
  }

  function closeNow() {
    setConfirmingClose(false);
    void applyManual(
      mode === "cabinet" ? false : cabinet,
      mode === "home" ? false : home,
      `${modeLabels[mode]} fermé aux nouvelles réservations.`,
    );
  }

  function updateDay(label: string, change: Partial<{ enabled: boolean; slots: TimeSlot[] }>) {
    setDraft((current) => ({
      ...current,
      days: current.days.map((day) => (day.label === label ? { ...day, ...change } : day)),
    }));
  }

  async function save() {
    setSaving(true);
    const result = await updateAvailabilityAction(draft);
    setSaving(false);
    if (!result.ok) {
      // Le refus vient de rendez-vous qui sortiraient des plages ouvertes :
      // on l'expose tel quel, c'est une information utile, pas une panne.
      notify.error(result.error);
      return;
    }
    onApplied({ cabinetAvailable: cabinet, homeAvailable: home, availability: draft });
    notify.success("Disponibilités enregistrées.");
    onClose();
  }

  return (
    <>
      <Modal
        title="Gérer les disponibilités"
        description="Configurez vos disponibilités et la manière dont vos clients peuvent prendre rendez-vous."
        onClose={onClose}
        size="xl"
        mobile="fullscreen"
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>Annuler</Button>
            <Button onClick={save} disabled={saving || !dirty}>{saving ? "Enregistrement…" : "Enregistrer"}</Button>
          </>
        }
      >
        <div className="space-y-6">
          {/* Onglets Cabinet / Domicile : chaque mode a son statut, ses
              fermetures et ses créneaux, sans quitter l'écran. */}
          <div className="mx-auto flex w-full max-w-md rounded-2xl bg-animeo-bg p-1.5" role="tablist" aria-label="Mode de consultation">
            {(["cabinet", "home"] as AvailabilityMode[]).map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={mode === item}
                onClick={() => setMode(item)}
                className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-extrabold transition ${mode === item ? "bg-animeo-surface text-animeo-dark shadow-sm" : "text-animeo-muted"}`}
              >
                <Icon name={item === "cabinet" ? "home" : "car"} className="h-4 w-4" />
                {modeLabels[item]}
              </button>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-6">
              <section>
                <h3 className="mb-2 text-sm font-black text-animeo-dark">Statut actuel</h3>
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-animeo-border p-4">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-extrabold text-animeo-dark">
                      <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${manuallyOpen ? "bg-animeo-positive" : "bg-animeo-error"}`} />
                      {manuallyOpen ? `${modeLabels[mode]} ouvert` : `${modeLabels[mode]} fermé`}
                    </p>
                    <p className="mt-1 text-xs text-animeo-muted">
                      {manuallyOpen
                        ? `Les clients peuvent prendre rendez-vous ${mode === "cabinet" ? "au cabinet" : "à domicile"}.`
                        : `Les clients ne peuvent plus prendre rendez-vous ${mode === "cabinet" ? "au cabinet" : "à domicile"}.`}
                    </p>
                    {status.kind === "scheduled" ? (
                      <p className="mt-2 rounded-lg bg-animeo-warning-soft px-2.5 py-1.5 text-xs font-bold text-animeo-warning">
                        Fermeture prévue {formatClosurePeriod(status.closure)}
                      </p>
                    ) : null}
                    {status.kind === "closing" ? (
                      <p className="mt-2 rounded-lg bg-animeo-warning-soft px-2.5 py-1.5 text-xs font-bold text-animeo-warning">
                        Fermé {formatClosurePeriod(status.closure)}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={manuallyOpen}
                    aria-label={`${modeLabels[mode]} ouvert aux réservations`}
                    disabled={saving}
                    onClick={() => (manuallyOpen ? setConfirmingClose(true) : openNow())}
                    className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition ${manuallyOpen ? "bg-animeo-positive" : "bg-animeo-subtle"}`}
                  >
                    <span className={`absolute h-5 w-5 rounded-full bg-white shadow-sm transition ${manuallyOpen ? "left-6" : "left-1"}`} />
                  </button>
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-sm font-black text-animeo-dark">Actions rapides</h3>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" disabled={manuallyOpen || saving} onClick={openNow} className="border-animeo-positive text-animeo-positive">
                    ▶ Ouvrir maintenant
                  </Button>
                  <Button size="sm" variant="secondary" disabled={!manuallyOpen || saving} onClick={() => setConfirmingClose(true)} className="border-animeo-danger-border text-animeo-error">
                    ⏸ Fermer maintenant
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setClosureForm({ id: newId(), date: toDateId(new Date()), endDate: toDateId(new Date()), start: "00:00", end: "23:59", scope: scopeFor(mode), reason: "Congés" })}
                  >
                    <Icon name="calendar" className="h-4 w-4" /> Fermeture temporaire
                  </Button>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-black text-animeo-dark">Message affiché aux clients</h3>
                <p className="mb-2 text-xs text-animeo-muted">Ce message sera visible sur votre page de réservation.</p>
                <textarea
                  value={draft.publicMessage ?? ""}
                  maxLength={MESSAGE_MAX}
                  onChange={(event) => setDraft((current) => ({ ...current, publicMessage: event.target.value }))}
                  rows={3}
                  aria-label="Message affiché aux clients"
                  placeholder="Ex. Le cabinet est exceptionnellement fermé cette semaine. Merci pour votre compréhension !"
                  className="w-full resize-y rounded-xl border border-animeo-border bg-animeo-bg p-3 text-sm text-animeo-dark outline-none focus:border-animeo focus:bg-white"
                />
                <p className="mt-1 text-right text-xs text-animeo-muted">{(draft.publicMessage ?? "").length} / {MESSAGE_MAX}</p>
              </section>
            </div>

            <div className="space-y-6">
              <WeeklyHours mode={mode} days={draft.days} onChange={updateDay} />

              <section>
                <h3 className="text-sm font-black text-animeo-dark">Exceptions</h3>
                <p className="mb-2 text-xs text-animeo-muted">Ajoutez des périodes particulières (congés, formations, etc.).</p>
                <ul className="space-y-2">
                  {modeClosures.map((closure) => (
                    <li key={closure.id} className="flex items-center justify-between gap-3 rounded-xl border border-animeo-border p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-animeo-dark">
                          <Icon name="calendar" className="mr-1.5 inline h-4 w-4 text-animeo" aria-hidden="true" />
                          {formatDateId(closure.date)}
                          {closureLastDay(closure) !== closure.date ? <> <span aria-hidden="true">→</span> {closureLastDay(closure) === "2999-12-31" ? "sans date de fin" : formatDateId(closureLastDay(closure))}</> : null}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-animeo-muted">{closure.reason || "Fermeture"} · {closure.scope}</p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button type="button" onClick={() => setClosureForm(closure)} className="min-h-9 rounded-lg px-3 text-xs font-extrabold text-animeo-muted hover:bg-animeo-bg">Modifier</button>
                        <button
                          type="button"
                          onClick={() => setDraft((current) => ({ ...current, closures: current.closures.filter((item) => item.id !== closure.id) }))}
                          className="min-h-9 rounded-lg px-3 text-xs font-extrabold text-animeo-error hover:bg-animeo-danger-soft"
                        >
                          Supprimer
                        </button>
                      </div>
                    </li>
                  ))}
                  {modeClosures.length === 0 ? (
                    <li className="rounded-xl bg-animeo-bg p-4 text-sm text-animeo-muted">Aucune fermeture prévue pour {modeLabels[mode].toLowerCase()}.</li>
                  ) : null}
                </ul>
                <button
                  type="button"
                  onClick={() => setClosureForm({ id: newId(), date: toDateId(new Date()), endDate: toDateId(new Date()), start: "00:00", end: "23:59", scope: scopeFor(mode), reason: "Congés" })}
                  className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-animeo-border-strong text-sm font-extrabold text-animeo-dark transition hover:bg-animeo-bg"
                >
                  + Ajouter une exception
                </button>
              </section>
            </div>
          </div>
        </div>
      </Modal>

      {confirmingClose ? (
        <ConfirmModal
          title={`Fermer le ${modeLabels[mode].toLowerCase()} aux réservations ?`}
          message={`Les visiteurs de votre page de réservation ne pourront plus prendre de rendez-vous ${mode === "cabinet" ? "au cabinet" : "à domicile"} tant que vous ne le rouvrez pas. Vos rendez-vous déjà prévus ne sont pas annulés, et vous pouvez toujours en créer depuis votre agenda.`}
          confirmLabel="Fermer"
          onConfirm={closeNow}
          onClose={() => setConfirmingClose(false)}
        />
      ) : null}

      {closureForm ? (
        <ClosureForm
          value={closureForm}
          onClose={() => setClosureForm(null)}
          onSave={(closure) => {
            setDraft((current) => ({
              ...current,
              closures: current.closures.some((item) => item.id === closure.id)
                ? current.closures.map((item) => (item.id === closure.id ? closure : item))
                : [...current.closures, closure],
            }));
            setClosureForm(null);
          }}
        />
      ) : null}
    </>
  );
}

/** Horaires habituels : sept jours, plusieurs plages par jour. */
function WeeklyHours({ mode, days, onChange }: { mode: AvailabilityMode; days: AvailabilitySettings["days"]; onChange: (label: string, change: Partial<{ enabled: boolean; slots: TimeSlot[] }>) => void }) {
  const [editing, setEditing] = useState<string | null>(null);

  const ordered = weekdayOrder
    .map((label) => days.find((day) => day.label === label))
    .filter((day): day is AvailabilitySettings["days"][number] => Boolean(day));

  return (
    <section>
      <h3 className="text-sm font-black text-animeo-dark">Horaires habituels</h3>
      <p className="mb-2 text-xs text-animeo-muted">Définissez vos créneaux récurrents pour chaque jour de la semaine.</p>
      <ul className="divide-y divide-animeo-border-soft overflow-hidden rounded-2xl border border-animeo-border">
        {ordered.map((day) => {
          const open = day.enabled && day.slots.some((slot) => (mode === "cabinet" ? slot.cabinet : slot.home));
          const isEditing = editing === day.label;
          return (
            <li key={day.label} className="bg-animeo-surface">
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-sm font-bold text-animeo-dark">{day.label}</span>
                <span className="flex items-center gap-2">
                  {open ? (
                    <span className="text-sm font-semibold text-animeo-muted">{slotsLabel(day.slots, mode)}</span>
                  ) : (
                    <span className="rounded-md bg-animeo-danger-soft px-2 py-0.5 text-xs font-bold text-animeo-error">Fermé</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditing(isEditing ? null : day.label)}
                    aria-expanded={isEditing}
                    aria-label={`Modifier les horaires du ${day.label.toLowerCase()}`}
                    className="min-h-9 min-w-9 rounded-lg text-animeo-muted transition hover:bg-animeo-bg"
                  >
                    ⋯
                  </button>
                </span>
              </div>

              {isEditing ? (
                <div className="space-y-2 border-t border-animeo-border-soft bg-animeo-bg px-4 py-3">
                  {day.slots.map((slot, index) => (
                    <div key={index} className="flex flex-wrap items-center gap-2">
                      <input
                        type="time"
                        value={slot.start}
                        aria-label={`Début de la plage ${index + 1} du ${day.label.toLowerCase()}`}
                        onChange={(event) => onChange(day.label, { slots: day.slots.map((item, position) => (position === index ? { ...item, start: event.target.value } : item)) })}
                        className="min-h-11 rounded-xl border border-animeo-border bg-white px-3 text-sm font-semibold text-animeo-dark"
                      />
                      <span aria-hidden="true" className="text-animeo-muted">→</span>
                      <input
                        type="time"
                        value={slot.end}
                        aria-label={`Fin de la plage ${index + 1} du ${day.label.toLowerCase()}`}
                        onChange={(event) => onChange(day.label, { slots: day.slots.map((item, position) => (position === index ? { ...item, end: event.target.value } : item)) })}
                        className="min-h-11 rounded-xl border border-animeo-border bg-white px-3 text-sm font-semibold text-animeo-dark"
                      />
                      <button
                        type="button"
                        onClick={() => onChange(day.label, { slots: day.slots.filter((_, position) => position !== index) })}
                        className="min-h-9 rounded-lg px-3 text-xs font-extrabold text-animeo-error hover:bg-animeo-danger-soft"
                      >
                        Supprimer
                      </button>
                    </div>
                  ))}

                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onChange(day.label, { enabled: true, slots: [...day.slots, { id: `slot-${Date.now()}`, start: "09:00", end: "12:00", cabinet: true, home: true }] })}
                    >
                      + Ajouter une plage
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onChange(day.label, { enabled: !day.enabled })}>
                      {day.enabled ? "Marquer comme fermé" : "Rouvrir ce jour"}
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Programmation d'une fermeture. Les rendez-vous déjà prévus sur la période
 * sont comptés et annoncés : fermer n'annule rien, mais il y a des personnes
 * à prévenir.
 */
function ClosureForm({ value, onSave, onClose }: { value: ExceptionalClosure; onSave: (closure: ExceptionalClosure) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(value);
  const [autoReopen, setAutoReopen] = useState(Boolean(value.endDate));
  const [appointments, setAppointments] = useState<PeriodAppointment[]>([]);
  const [error, setError] = useState<string | null>(null);

  const scope: "cabinet" | "home" | "both" = draft.scope === "Tout fermer" ? "both" : draft.scope === "Cabinet uniquement" ? "cabinet" : "home";
  const lastDay = autoReopen ? (draft.endDate ?? draft.date) : draft.date;

  useEffect(() => {
    let cancelled = false;
    void getAppointmentsInPeriodAction(draft.date, lastDay, scope).then((rows) => { if (!cancelled) setAppointments(rows); });
    return () => { cancelled = true; };
  }, [draft.date, lastDay, scope]);

  function submit() {
    if (autoReopen && draft.endDate && draft.endDate < draft.date) {
      setError("La date de fin doit être après la date de début.");
      return;
    }
    // Sans réouverture automatique, la fermeture n'a pas de fin : elle dure
    // jusqu'à ce que le praticien la supprime lui-même.
    onSave({ ...draft, endDate: autoReopen ? (draft.endDate ?? draft.date) : "2999-12-31" });
  }

  return (
    <Modal
      title="Programmer une fermeture"
      description="Les rendez-vous déjà pris ne sont pas annulés : seule la prise de nouveaux rendez-vous est bloquée."
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button onClick={submit}>Programmer</Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <p role="alert" className="rounded-xl bg-animeo-danger-soft px-4 py-3 text-sm font-bold text-animeo-error">{error}</p> : null}

        <label className="block">
          <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.11em] text-animeo-muted">Du</span>
          <input
            type="date"
            value={draft.date}
            onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))}
            className="min-h-11 w-full rounded-xl border border-animeo-border bg-animeo-bg px-3 text-sm font-semibold text-animeo-dark"
          />
        </label>

        <label className="flex items-center gap-2.5">
          <input type="checkbox" checked={autoReopen} onChange={(event) => setAutoReopen(event.target.checked)} className="h-5 w-5 accent-animeo" />
          <span className="text-sm font-bold text-animeo-dark">Rouvrir automatiquement à une date précise</span>
        </label>

        {autoReopen ? (
          <label className="block">
            <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.11em] text-animeo-muted">Au (dernier jour fermé)</span>
            <input
              type="date"
              value={draft.endDate ?? draft.date}
              onChange={(event) => setDraft((current) => ({ ...current, endDate: event.target.value }))}
              className="min-h-11 w-full rounded-xl border border-animeo-border bg-animeo-bg px-3 text-sm font-semibold text-animeo-dark"
            />
          </label>
        ) : (
          <p className="rounded-xl bg-animeo-bg p-3 text-xs text-animeo-muted">
            Sans date de fin, la fermeture dure jusqu’à ce que vous la supprimiez vous-même.
          </p>
        )}

        <label className="block">
          <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.11em] text-animeo-muted">Ce qui ferme</span>
          <select
            value={draft.scope}
            onChange={(event) => setDraft((current) => ({ ...current, scope: event.target.value as ClosureScope }))}
            className="min-h-11 w-full rounded-xl border border-animeo-border bg-animeo-bg px-3 text-sm font-semibold text-animeo-dark"
          >
            <option value="Cabinet uniquement">Cabinet uniquement</option>
            <option value="Domicile uniquement">Domicile uniquement</option>
            <option value="Tout fermer">Cabinet et domicile</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-[0.11em] text-animeo-muted">Motif</span>
          <select
            value={reasons.includes(draft.reason) ? draft.reason : "Autre"}
            onChange={(event) => setDraft((current) => ({ ...current, reason: event.target.value }))}
            className="min-h-11 w-full rounded-xl border border-animeo-border bg-animeo-bg px-3 text-sm font-semibold text-animeo-dark"
          >
            {reasons.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
          </select>
          <span className="mt-1 block text-xs text-animeo-muted">Pour vous : ce motif n’est pas affiché à vos clients.</span>
        </label>

        {appointments.length > 0 ? (
          <div className="rounded-xl bg-animeo-info-soft p-4">
            <p className="text-sm font-extrabold text-animeo-dark">
              {appointments.length} rendez-vous déjà prévu{appointments.length > 1 ? "s" : ""} sur cette période
            </p>
            <p className="mt-1 text-xs text-animeo-dark">Ces rendez-vous ne seront pas annulés automatiquement.</p>
            <ul className="mt-2 space-y-1 text-xs text-animeo-dark">
              {appointments.slice(0, 4).map((appointment) => (
                <li key={appointment.id}>{appointment.date} · {appointment.start} — {appointment.animalName} ({appointment.clientName})</li>
              ))}
              {appointments.length > 4 ? <li>… et {appointments.length - 4} autre{appointments.length - 4 > 1 ? "s" : ""}.</li> : null}
            </ul>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
