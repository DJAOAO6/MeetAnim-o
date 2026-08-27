"use client";

import { useState } from "react";
import { useDashboardTheme } from "@/components/theme/dashboard-theme-provider";
import { Card } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
import { PersonalizationPreview } from "@/components/settings/personalization-preview";
import { ThemeColorsPanel, type ThemeDraft } from "@/components/settings/theme-colors-panel";
import type { ProfileSettings, ServiceSettings } from "@/data/settings";

type PersonalizationSection = "theme" | "booking" | "profile" | "content" | "notifications" | "documents" | "legal" | "advanced";

const sections: Array<{ id: PersonalizationSection; label: string; description: string; icon: IconName }> = [
  { id: "theme", label: "Thème et couleurs", description: "Personnalisez l’apparence de votre logiciel", icon: "sun" },
  { id: "booking", label: "Page de réservation", description: "Personnalisez votre page publique", icon: "calendar" },
  { id: "profile", label: "Profil professionnel", description: "Photo, bio, logo et informations", icon: "clients" },
  { id: "content", label: "Contenu et textes", description: "Personnalisez les textes affichés", icon: "document" },
  { id: "notifications", label: "Notifications", description: "Préférences d’affichage et rappels", icon: "bell" },
  { id: "documents", label: "Documents et emails", description: "Modèles et informations", icon: "mail" },
  { id: "legal", label: "Mentions légales", description: "CGU, confidentialité et mentions", icon: "shield" },
  { id: "advanced", label: "Avancé", description: "Options avancées et outils", icon: "settings" },
];

type PersonalizationViewProps = {
  profile: ProfileSettings;
  services: ServiceSettings[];
  saving?: boolean;
  canEdit?: boolean;
  onSaveTheme: (draft: ThemeDraft) => void;
};

export function PersonalizationView({ profile, services, saving = false, canEdit = true, onSaveTheme }: PersonalizationViewProps) {
  const { theme } = useDashboardTheme();
  const [activeSection, setActiveSection] = useState<PersonalizationSection>("theme");
  const [draft, setDraft] = useState<ThemeDraft>({
    mode: theme.mode,
    primaryColor: theme.primaryColor,
    secondaryColor: theme.secondaryColor,
    accentColor: theme.accentColor,
    displayOptions: theme.displayOptions,
  });

  return (
    <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)_360px]">
      <nav aria-label="Sections de personnalisation" className="space-y-2 xl:sticky xl:top-6 xl:self-start">
        {sections.map((section) => {
          const active = section.id === activeSection;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id)}
              aria-pressed={active}
              className={`flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition ${
                active ? "border-l-4 border-animeo bg-animeo-soft" : "border-[#e1eae8] bg-white hover:border-animeo"
              }`}
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${active ? "bg-white text-animeo" : "bg-animeo-bg text-animeo-dark"}`}>
                <Icon name={section.icon} className="h-4.5 w-4.5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-extrabold text-animeo-dark">{section.label}</span>
                <span className="mt-0.5 block text-xs text-animeo-muted">{section.description}</span>
              </span>
            </button>
          );
        })}
      </nav>

      <div>
        {activeSection === "theme" ? (
          <ThemeColorsPanel draft={draft} onChange={setDraft} saving={saving} canEdit={canEdit} onSave={() => onSaveTheme(draft)} />
        ) : (
          <PlaceholderPanel section={sections.find((item) => item.id === activeSection)!} />
        )}
      </div>

      <PersonalizationPreview
        profile={profile}
        services={services}
        primaryColor={draft.primaryColor}
        secondaryColor={draft.secondaryColor}
        accentColor={draft.accentColor}
        displayOptions={draft.displayOptions}
      />
    </div>
  );
}

function PlaceholderPanel({ section }: { section: { label: string; description: string; icon: IconName } }) {
  return (
    <Card className="flex flex-col items-center justify-center gap-3 p-10 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-animeo-soft text-animeo-dark"><Icon name={section.icon} className="h-6 w-6" /></span>
      <h2 className="text-lg font-black text-animeo-dark">{section.label}</h2>
      <p className="max-w-sm text-sm text-animeo-muted">Cette section sera bientôt disponible. Donnez le détail attendu pour « {section.label} » afin de construire ce formulaire.</p>
    </Card>
  );
}
