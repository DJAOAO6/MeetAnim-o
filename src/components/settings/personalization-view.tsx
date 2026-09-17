"use client";

import Link from "next/link";
import { useState } from "react";
import { useDashboardTheme } from "@/components/theme/dashboard-theme-provider";
import { Card } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
import { NavigationBehaviourPanel } from "@/components/settings/navigation-behaviour-panel";
import { PersonalizationPreview } from "@/components/settings/personalization-preview";
import { PublicPageEditor } from "@/components/settings/public-page-editor";
import { ThemeColorsPanel, type ThemeDraft } from "@/components/settings/theme-colors-panel";
import type { DashboardThemeSettings } from "@/data/dashboard-theme";
import type { ProfileSettings, ServiceSettings } from "@/data/settings";
import type { PublicProfessional } from "@/data/public-booking";
import type { PublicPageState } from "@/lib/public-page-actions";

/**
 * Tout ce qui touche à l'apparence est réuni ici : le thème du logiciel, la
 * disposition du tableau de bord et la page vue par les clients.
 *
 * Les six sections vides qui figuraient dans cette liste (« Contenu et
 * textes », « Notifications », « Documents et emails », « Mentions légales »,
 * « Avancé », « Profil professionnel ») ont été retirées : elles annonçaient
 * des réglages inexistants, et « Profil professionnel » doublonnait l'onglet
 * dédié.
 */
type PersonalizationSection = "theme" | "navigation" | "dashboard" | "booking";

const sections: Array<{ id: PersonalizationSection; label: string; description: string; icon: IconName }> = [
  { id: "theme", label: "Thème et couleurs", description: "L’apparence de votre logiciel", icon: "sun" },
  { id: "navigation", label: "Navigation", description: "Le comportement du menu latéral", icon: "settings" },
  { id: "dashboard", label: "Tableau de bord", description: "Les blocs affichés et leur disposition", icon: "dashboard" },
  { id: "booking", label: "Page de réservation", description: "La page que voient vos clients", icon: "calendar" },
];

type PersonalizationViewProps = {
  profile: ProfileSettings;
  services: ServiceSettings[];
  saving?: boolean;
  canEdit?: boolean;
  onSaveTheme: (draft: ThemeDraft) => void;
  publicPage: PublicPageState;
  publicProfessional: PublicProfessional | null;
};

function draftFromTheme(theme: DashboardThemeSettings): ThemeDraft {
  return {
    mode: theme.mode,
    palette: theme.palette,
    primaryColor: theme.primaryColor,
    secondaryColor: theme.secondaryColor,
    accentColor: theme.accentColor,
    displayOptions: theme.displayOptions,
  };
}

export function PersonalizationView({ profile, services, saving = false, canEdit = true, onSaveTheme, publicPage, publicProfessional }: PersonalizationViewProps) {
  const { theme } = useDashboardTheme();
  const [activeSection, setActiveSection] = useState<PersonalizationSection>("theme");
  const [draft, setDraft] = useState<ThemeDraft>(() => draftFromTheme(theme));

  // Le thème réel n'est relu du stockage local qu'après le premier rendu : à
  // cet instant précis, le brouillon ci-dessus est une copie des valeurs par
  // défaut, pas des réglages du professionnel. Sans cette remise à niveau, le
  // panneau affiche des réglages qui ne sont pas les siens — et « Enregistrer »
  // les écrit par-dessus les vrais.
  //
  // Une fois synchronisé, `theme` ne change plus que lorsque ce panneau
  // enregistre : une modification en cours n'est donc jamais écrasée.
  const [syncedTheme, setSyncedTheme] = useState(theme);
  if (syncedTheme !== theme) {
    setSyncedTheme(theme);
    setDraft(draftFromTheme(theme));
  }

  // L'éditeur de page de réservation a son propre aperçu, bien plus fidèle :
  // l'aperçu latéral du thème n'est affiché que là où il apporte quelque chose.
  const showThemePreview = activeSection === "theme";

  return (
    <div className={`grid gap-6 ${showThemePreview ? "xl:grid-cols-[260px_minmax(0,1fr)_360px]" : "xl:grid-cols-[260px_minmax(0,1fr)]"}`}>
      <nav aria-label="Sections de personnalisation" className="space-y-2 xl:sticky xl:top-6 xl:self-start">
        {sections.map((section) => {
          const active = section.id === activeSection;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id)}
              aria-pressed={active}
              className={`flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition ${active ? "border-animeo bg-animeo-soft" : "border-animeo-border bg-animeo-surface hover:bg-animeo-bg"}`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-animeo-soft text-animeo-dark">
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

      <div className="min-w-0">
        {activeSection === "theme" ? (
          <ThemeColorsPanel draft={draft} onChange={setDraft} saving={saving} canEdit={canEdit} onSave={() => onSaveTheme(draft)} />
        ) : null}

        {activeSection === "navigation" ? <NavigationBehaviourPanel /> : null}

        {activeSection === "dashboard" ? <DashboardLayoutPanel /> : null}

        {activeSection === "booking" ? (
          canEdit && publicProfessional
            ? <PublicPageEditor initialState={publicPage} professional={publicProfessional} />
            : <Card className="p-5 text-sm font-bold text-animeo-dark">Vous n’avez pas la permission de modifier la page publique.</Card>
        ) : null}
      </div>

      {showThemePreview ? (
        <PersonalizationPreview
          profile={profile}
          services={services}
          primaryColor={draft.primaryColor}
          secondaryColor={draft.secondaryColor}
          accentColor={draft.accentColor}
          displayOptions={draft.displayOptions}
        />
      ) : null}
    </div>
  );
}

/**
 * La disposition se règle sur le vrai tableau de bord, pas ici : on déplace
 * ses blocs là où on les regarde, à leur taille réelle et avec leur contenu
 * réel. Ce panneau est le point d'entrée, pour que le réglage se trouve avec
 * les autres réglages.
 */
function DashboardLayoutPanel() {
  return (
    <Card className="p-6">
      <h2 className="text-lg font-black text-animeo-dark">Disposition du tableau de bord</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-animeo-muted">
        Choisissez les blocs affichés sur votre tableau de bord, leur ordre et leur largeur. La disposition est
        enregistrée pour votre compte : chaque professionnel du cabinet garde la sienne.
      </p>
      <ul className="mt-4 space-y-1.5 text-sm text-animeo-muted">
        <li>• Déplacez un bloc par sa poignée, à la souris, au doigt ou au clavier.</li>
        <li>• Réglez sa largeur de 1 à 4 colonnes, ou masquez-le.</li>
        <li>• Ajoutez les blocs masqués depuis le panneau du bas.</li>
        <li>• « Tout remettre d’origine » rétablit la disposition initiale si le résultat ne vous plaît pas.</li>
      </ul>
      <Link
        href="/dashboard?personnaliser=1"
        className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-animeo px-5 text-sm font-extrabold text-white transition hover:bg-animeo-hover"
      >
        Personnaliser mon tableau de bord
      </Link>
    </Card>
  );
}
