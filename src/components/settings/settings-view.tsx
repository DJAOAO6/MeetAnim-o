"use client";

import { useState } from "react";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { useDashboardTheme } from "@/components/theme/dashboard-theme-provider";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
import { ProfileSettingsTab } from "@/components/settings/profile-settings-tab";
import { ServicesSettingsShortcut } from "@/components/settings/services-settings-tab";
import { AvailabilitySettingsTab } from "@/components/settings/availability-settings-tab";
import { ToursSettingsTab } from "@/components/settings/tours-settings-tab";
import { RemindersSettingsTab } from "@/components/settings/reminders-settings-tab";
import { PersonalizationView } from "@/components/settings/personalization-view";
import type { ThemeDraft } from "@/components/settings/theme-colors-panel";
import { initialSettings, type AvailabilitySettings, type ProfileSettings, type ReminderSettings, type ServiceSettings, type SettingsState } from "@/data/settings";
import { updateAvailabilityAction, updateBusinessProfileAction, updateReminderSettingsAction, type BusinessProfileData } from "@/lib/business-profile-actions";
import { hasPermission } from "@/lib/auth/permissions";
import { notify } from "@/lib/notify";
import type { Tour, Zone } from "@/data/tours";

type SettingsTab = "profile" | "services" | "availability" | "tours" | "reminders" | "customization";

type SettingsViewProps = {
  tours: Tour[];
  zones: Zone[];
  businessProfile: BusinessProfileData;
  availability: AvailabilitySettings;
  reminders: ReminderSettings;
  services: ServiceSettings[];
};

const tabs: Array<{ id: SettingsTab; label: string; icon: IconName }> = [
  { id: "profile", label: "Mon profil", icon: "clients" },
  { id: "services", label: "Prestations", icon: "services" },
  { id: "availability", label: "Disponibilités", icon: "calendar" },
  { id: "tours", label: "Tournées", icon: "tournees" },
  { id: "reminders", label: "Rappels", icon: "bell" },
  { id: "customization", label: "Personnalisation", icon: "settings" },
];

let sessionSettings = initialSettings;

export function SettingsView({ tours, zones, businessProfile, availability, reminders, services }: SettingsViewProps) {
  const currentUser = useCurrentUser();
  const { updateTheme } = useDashboardTheme();
  const canManagePublicSettings = hasPermission(currentUser, "MANAGE_PUBLIC_SETTINGS");
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [settings, setSettings] = useState<SettingsState>(() => ({
    ...sessionSettings,
    profile: businessProfile,
    publicColor: businessProfile.publicColor,
    availability,
    reminders,
  }));
  // Valeurs requises par le type BusinessProfileData mais ignorées par
  // updateBusinessProfileAction sur la mise à jour : cabinetAvailable/
  // homeAvailable sont gérés exclusivement par les badges du tableau de
  // bord (updateManualAvailabilityAction) ; latitude/longitude sont
  // recalculées côté serveur à partir de l'adresse, jamais reprises telles
  // quelles depuis ce formulaire.
  const profileMeta: Pick<BusinessProfileData, "cabinetAvailable" | "homeAvailable" | "latitude" | "longitude"> = {
    cabinetAvailable: businessProfile.cabinetAvailable,
    homeAvailable: businessProfile.homeAvailable,
    latitude: businessProfile.latitude,
    longitude: businessProfile.longitude,
  };
  const [saving, setSaving] = useState(false);

  function updateSettings<K extends keyof SettingsState>(key: K, value: SettingsState[K], message = "Modifications enregistrées") {
    setSettings((current) => {
      const next = { ...current, [key]: value };
      sessionSettings = next;
      return next;
    });
    notify.success(message);
  }

  async function saveProfile(profile: ProfileSettings, publicColor: string, message: string) {
    setSaving(true);
    const result = await updateBusinessProfileAction({ ...profile, publicColor, ...profileMeta });
    setSaving(false);

    if (!result.ok) {
      notify.error(result.error);
      return;
    }

    setSettings((current) => {
      const next = { ...current, profile, publicColor };
      sessionSettings = next;
      return next;
    });
    notify.success(message);
    if (result.warning) notify.info(result.warning);
  }

  async function saveTheme(draft: ThemeDraft) {
    updateTheme(draft);
    await saveProfile(settings.profile, draft.primaryColor, "Personnalisation enregistrée");
  }

  async function saveAvailability(value: AvailabilitySettings, message: string) {
    setSaving(true);
    let result = await updateAvailabilityAction(value);

    if (!result.ok && result.conflicts?.length) {
      const preview = result.conflicts.slice(0, 5).map((conflict) => `- ${conflict.date} ${conflict.start} · ${conflict.animalName} (${conflict.clientName})`).join("\n");
      const more = result.conflicts.length > 5 ? `\n… et ${result.conflicts.length - 5} autre(s).` : "";
      const confirmed = window.confirm(`${result.error}\n\n${preview}${more}\n\nEnregistrer quand même ?`);
      if (confirmed) result = await updateAvailabilityAction(value, true);
    }
    setSaving(false);

    if (!result.ok) {
      notify.error(result.error);
      return;
    }

    updateSettings("availability", value, message);
  }

  async function saveReminders(value: ReminderSettings) {
    setSaving(true);
    const result = await updateReminderSettingsAction(value);
    setSaving(false);

    if (!result.ok) {
      notify.error(result.error);
      return;
    }

    updateSettings("reminders", value, "Réglages de rappels enregistrés");
  }

  return (
    <>
      <PageHeader
        title="Paramètres"
        description="Configurez votre activité, vos disponibilités et votre page publique de réservation."
      />

      <Card className="mb-6 overflow-x-auto p-1.5">
        <nav aria-label="Onglets des paramètres" className="flex min-w-max gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              aria-pressed={activeTab === tab.id}
              className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-extrabold transition ${activeTab === tab.id ? "bg-animeo text-white shadow-sm" : "text-animeo-muted hover:bg-animeo-soft hover:text-animeo-dark"}`}
            >
              <Icon name={tab.icon} className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </Card>

      {activeTab === "profile" ? <ProfileSettingsTab value={settings.profile} saving={saving} canEdit={canManagePublicSettings} onSave={(value) => saveProfile(value, settings.publicColor, "Profil enregistré et visible sur votre page publique")} /> : null}
      {activeTab === "services" ? <ServicesSettingsShortcut /> : null}
      {activeTab === "availability" ? <AvailabilitySettingsTab value={settings.availability} onChange={saveAvailability} /> : null}
      {activeTab === "tours" ? <ToursSettingsTab initialTours={tours} zones={zones} /> : null}
      {activeTab === "reminders" ? <RemindersSettingsTab value={settings.reminders} onSave={saveReminders} /> : null}
      {activeTab === "customization" ? (
        <PersonalizationView
          profile={settings.profile}
          services={services}
          saving={saving}
          canEdit={canManagePublicSettings}
          onSaveTheme={saveTheme}
        />
      ) : null}
    </>
  );
}
