"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { SectionTitle, Toggle } from "@/components/settings/settings-fields";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { notify } from "@/lib/notify";
import {
  disableIcsFeedAction,
  disconnectGoogleCalendarAction,
  regenerateIcsFeedTokenAction,
  updateGoogleCalendarSettingsAction,
  type UpdateGoogleCalendarSettingsInput,
} from "@/lib/calendar-actions";
import type { GoogleIntegrationState, IcsFeedState } from "@/lib/calendar";

type IntegrationsSettingsTabProps = {
  google: GoogleIntegrationState;
  icsFeed: IcsFeedState;
};

function timeAgoFr(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "à l’instant";
  if (minutes < 60) return `il y a ${minutes} minute${minutes > 1 ? "s" : ""}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} heure${hours > 1 ? "s" : ""}`;
  const days = Math.floor(hours / 24);
  return `il y a ${days} jour${days > 1 ? "s" : ""}`;
}

export function IntegrationsSettingsTab({ google, icsFeed }: IntegrationsSettingsTabProps) {
  return (
    <div className="space-y-6">
      <GoogleCalendarCard google={google} />
      <AppleCalendarCard icsFeed={icsFeed} />
    </div>
  );
}

function GoogleCalendarCard({ google }: { google: GoogleIntegrationState }) {
  const [disconnectConfirmOpen, setDisconnectConfirmOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [settings, setSettings] = useState(() =>
    google.status === "connected"
      ? { syncAppointments: google.syncAppointments, syncUpdates: google.syncUpdates, deleteCancelledEvents: google.deleteCancelledEvents, blockExternalBusySlots: google.blockExternalBusySlots }
      : { syncAppointments: true, syncUpdates: true, deleteCancelledEvents: true, blockExternalBusySlots: true },
  );
  const [calendarId, setCalendarId] = useState(google.status === "connected" ? google.calendarId : "");
  const [saving, setSaving] = useState(false);

  async function persist(next: typeof settings, nextCalendarId?: string) {
    setSaving(true);
    const availableCalendars = google.status === "connected" ? google.availableCalendars : [];
    const nextCalendar = nextCalendarId ? availableCalendars.find((calendar) => calendar.id === nextCalendarId) : undefined;
    const input: UpdateGoogleCalendarSettingsInput = {
      ...next,
      ...(nextCalendar ? { calendarId: nextCalendar.id, calendarName: nextCalendar.name } : {}),
    };
    const result = await updateGoogleCalendarSettingsAction(input);
    setSaving(false);
    if (!result.ok) {
      notify.error(result.error);
      return;
    }
    notify.success("Réglages Google Agenda enregistrés");
  }

  function toggleSetting(key: keyof typeof settings) {
    setSettings((current) => {
      const next = { ...current, [key]: !current[key] };
      void persist(next);
      return next;
    });
  }

  function changeCalendar(nextCalendarId: string) {
    setCalendarId(nextCalendarId);
    void persist(settings, nextCalendarId);
  }

  async function disconnect() {
    setDisconnecting(true);
    const result = await disconnectGoogleCalendarAction();
    setDisconnecting(false);
    setDisconnectConfirmOpen(false);
    if (!result.ok) {
      notify.error(result.error);
      return;
    }
    notify.success("Google Agenda déconnecté");
  }

  return (
    <Card className="p-5 sm:p-6">
      <SectionTitle
        title="Google Agenda"
        description={google.status === "connected" ? undefined : "Synchronisez vos rendez-vous et évitez les doubles réservations."}
      />

      {google.status === "disconnected" ? (
        <a
          href="/api/calendar/google/connect"
          className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-animeo px-5 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#459e90]"
        >
          <GoogleBadge />
          Connecter Google Agenda
        </a>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-animeo-soft px-3 py-1.5 text-xs font-extrabold text-[#24755f]">
              <span className="h-2 w-2 rounded-full bg-[#278064]" aria-hidden="true" />
              Connecté
            </span>
            <span className="text-sm font-bold text-animeo-dark">{google.accountEmail}</span>
          </div>

          {google.lastError ? (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#fff3e0] px-4 py-3 text-sm font-bold text-[#a9573b]">
              <span>⚠ Synchronisation Google à vérifier</span>
              <a href="/api/calendar/google/connect" className="inline-flex min-h-9 items-center rounded-lg bg-white px-3 text-xs font-extrabold text-[#a9573b] shadow-sm transition hover:bg-[#fff7ef]">Reconnecter</a>
            </div>
          ) : null}

          <div className="max-w-sm">
            <label className="block">
              <span className="mb-2 block text-xs font-extrabold uppercase tracking-[0.11em] text-animeo-muted">Agenda utilisé</span>
              {google.availableCalendars.length > 0 ? (
                <select
                  value={calendarId}
                  onChange={(event) => changeCalendar(event.target.value)}
                  disabled={saving}
                  className="h-11 w-full rounded-xl border border-[#d9e5e2] bg-animeo-bg px-3.5 text-sm font-semibold text-animeo-dark outline-none transition focus:border-animeo focus:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {google.availableCalendars.map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.name}</option>)}
                </select>
              ) : (
                <p className="rounded-xl border border-[#d9e5e2] bg-animeo-bg px-3.5 py-2.5 text-sm font-semibold text-animeo-dark">{google.calendarName}</p>
              )}
            </label>
          </div>

          <div className="flex flex-col gap-2.5">
            <Toggle checked={settings.syncAppointments} onChange={() => toggleSetting("syncAppointments")} label="Ajouter automatiquement mes rendez-vous" disabled={saving} />
            <Toggle checked={settings.syncUpdates} onChange={() => toggleSetting("syncUpdates")} label="Mettre à jour les rendez-vous modifiés" disabled={saving} />
            <Toggle checked={settings.deleteCancelledEvents} onChange={() => toggleSetting("deleteCancelledEvents")} label="Supprimer de Google les rendez-vous annulés" disabled={saving} />
            <Toggle checked={settings.blockExternalBusySlots} onChange={() => toggleSetting("blockExternalBusySlots")} label="Bloquer les horaires occupés de Google" disabled={saving} />
          </div>

          <p className="text-xs text-animeo-muted">
            Dernière synchronisation : {google.lastSyncAt ? timeAgoFr(google.lastSyncAt) : "aucune pour le moment"}
          </p>

          <button type="button" onClick={() => setDisconnectConfirmOpen(true)} className="inline-flex min-h-11 items-center rounded-xl bg-[#fff0eb] px-4 py-2.5 text-sm font-extrabold text-[#a9573b] transition hover:bg-[#ffe5dc]">
            Déconnecter
          </button>
        </div>
      )}

      {disconnectConfirmOpen ? (
        <ConfirmModal
          title="Déconnecter Google Agenda ?"
          message="Vos rendez-vous ne seront plus ajoutés ni mis à jour dans ce compte Google. Les événements déjà créés y resteront tels quels."
          confirmLabel={disconnecting ? "Déconnexion…" : "Déconnecter"}
          onConfirm={disconnect}
          onClose={() => setDisconnectConfirmOpen(false)}
        />
      ) : null}
    </Card>
  );
}

function AppleCalendarCard({ icsFeed }: { icsFeed: IcsFeedState }) {
  const [state, setState] = useState(icsFeed);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);

  async function enable() {
    setPending(true);
    const result = await regenerateIcsFeedTokenAction();
    setPending(false);
    if (!result.ok) {
      notify.error(result.error);
      return;
    }
    setState({ enabled: true, url: result.url });
    notify.success("Lien Apple Calendar généré");
  }

  async function regenerate() {
    setPending(true);
    const result = await regenerateIcsFeedTokenAction();
    setPending(false);
    if (!result.ok) {
      notify.error(result.error);
      return;
    }
    setState({ enabled: true, url: result.url });
    notify.success("Lien régénéré — l’ancien lien ne fonctionne plus");
  }

  async function disable() {
    setPending(true);
    const result = await disableIcsFeedAction();
    setPending(false);
    if (!result.ok) {
      notify.error(result.error);
      return;
    }
    setState({ enabled: false, url: null });
    notify.success("Lien Apple Calendar désactivé");
  }

  async function copyLink() {
    if (!state.url) return;
    await navigator.clipboard.writeText(state.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card className="p-5 sm:p-6">
      <SectionTitle title="Apple Calendar" description="Retrouvez vos rendez-vous sur iPhone, iPad et Mac." />

      {!state.enabled ? (
        <button type="button" onClick={enable} disabled={pending} className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-animeo px-5 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#459e90] disabled:cursor-not-allowed disabled:opacity-60">
          {pending ? "Génération…" : "Ajouter à Apple Calendar"}
        </button>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.11em] text-animeo-muted">Adresse du calendrier</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input readOnly value={state.url ?? ""} onFocus={(event) => event.currentTarget.select()} className="h-11 min-w-0 flex-1 rounded-xl border border-[#d9e5e2] bg-animeo-bg px-3.5 text-xs font-semibold text-animeo-muted outline-none focus:border-animeo" />
              <button type="button" onClick={copyLink} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-animeo px-4 text-sm font-extrabold text-animeo transition hover:bg-animeo-soft">
                {copied ? "Copié ✓" : "Copier le lien"}
              </button>
            </div>
          </div>

          <p className="text-xs text-animeo-muted">
            Les rendez-vous créés dans le logiciel apparaîtront automatiquement dans Apple Calendar. Ce lien n’est pas une synchronisation bidirectionnelle : les modifications faites directement dans Apple Calendar n’affectent jamais votre agenda Animéo.
          </p>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={regenerate} disabled={pending} className="inline-flex min-h-11 items-center rounded-xl bg-animeo-bg px-4 text-sm font-extrabold text-animeo-dark transition hover:bg-animeo-soft disabled:cursor-not-allowed disabled:opacity-60">
              Régénérer le lien
            </button>
            <button type="button" onClick={disable} disabled={pending} className="inline-flex min-h-11 items-center rounded-xl bg-[#fff0eb] px-4 text-sm font-extrabold text-[#a9573b] transition hover:bg-[#ffe5dc] disabled:cursor-not-allowed disabled:opacity-60">
              Désactiver le lien
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

function GoogleBadge() {
  return (
    <span aria-hidden="true" className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-black text-animeo">G</span>
  );
}
