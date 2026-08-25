"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
import { ProfileSettingsTab } from "@/components/settings/profile-settings-tab";
import { ServicesSettingsShortcut } from "@/components/settings/services-settings-tab";
import { AvailabilitySettingsTab } from "@/components/settings/availability-settings-tab";
import { ToursSettingsTab } from "@/components/settings/tours-settings-tab";
import { RemindersSettingsTab } from "@/components/settings/reminders-settings-tab";
import { CustomizationSettingsTab } from "@/components/settings/customization-settings-tab";
import { initialSettings, type SettingsState } from "@/data/settings";
import type { Tour, Zone } from "@/data/tours";

type SettingsTab = "profile" | "services" | "availability" | "tours" | "reminders" | "customization";

type SettingsViewProps = {
  tours: Tour[];
  zones: Zone[];
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

export function SettingsView({ tours, zones }: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [settings, setSettings] = useState<SettingsState>(() => sessionSettings);
  const [feedback, setFeedback] = useState<string | null>(null);

  function updateSettings<K extends keyof SettingsState>(key: K, value: SettingsState[K], message = "Modifications enregistrées") {
    setSettings((current) => {
      const next = { ...current, [key]: value };
      sessionSettings = next;
      return next;
    });
    setFeedback(message);
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
              onClick={() => { setActiveTab(tab.id); setFeedback(null); }}
              aria-pressed={activeTab === tab.id}
              className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-extrabold transition ${activeTab === tab.id ? "bg-animeo text-white shadow-sm" : "text-animeo-muted hover:bg-animeo-soft hover:text-animeo-dark"}`}
            >
              <Icon name={tab.icon} className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </Card>

      {feedback ? (
        <div role="status" className="mb-5 flex items-center justify-between gap-4 rounded-2xl border border-[#cfe7e1] bg-animeo-soft px-4 py-3 text-sm font-extrabold text-animeo-dark">
          <span>✓ {feedback}</span>
          <button type="button" onClick={() => setFeedback(null)} aria-label="Fermer la notification" className="text-xl leading-none">×</button>
        </div>
      ) : null}

      {activeTab === "profile" ? <ProfileSettingsTab value={settings.profile} onSave={(value) => updateSettings("profile", value)} /> : null}
      {activeTab === "services" ? <ServicesSettingsShortcut /> : null}
      {activeTab === "availability" ? <AvailabilitySettingsTab value={settings.availability} onChange={(value, message) => updateSettings("availability", value, message)} /> : null}
      {activeTab === "tours" ? <ToursSettingsTab initialTours={tours} zones={zones} onNotify={setFeedback} /> : null}
      {activeTab === "reminders" ? <RemindersSettingsTab value={settings.reminders} onSave={(value) => updateSettings("reminders", value)} /> : null}
      {activeTab === "customization" ? (
        <CustomizationSettingsTab
          profile={settings.profile}
          color={settings.publicColor}
          onProfileChange={(value) => updateSettings("profile", value, "Image mise à jour localement")}
          onColorChange={(value) => updateSettings("publicColor", value, "Personnalisation enregistrée")}
        />
      ) : null}
    </>
  );
}
