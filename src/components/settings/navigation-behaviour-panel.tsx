"use client";

import { PanelLeft } from "lucide-react";
import { useSidebar, type OpenBehavior, type SidebarDefaultState } from "@/components/layout/sidebar-provider";
import { Card } from "@/components/ui/card";

type Choice<T extends string> = { value: T; label: string };

const behaviourChoices: Array<Choice<OpenBehavior>> = [
  { value: "hover", label: "Automatique au survol" },
  { value: "click", label: "Manuelle au clic" },
];

const stateChoices: Array<Choice<SidebarDefaultState>> = [
  { value: "expanded", label: "Ouverte" },
  { value: "collapsed", label: "Réduite" },
];

/**
 * Comportement du menu latéral. Deux réglages volontairement indépendants :
 * on peut vouloir une barre qui s'ouvre au survol mais des catégories qui
 * n'obéissent qu'au clic, ou l'inverse.
 *
 * Les changements s'appliquent immédiatement — la barre est juste à côté, on
 * voit le résultat en même temps qu'on choisit.
 */
export function NavigationBehaviourPanel() {
  const { preferences, updatePreferences, pointerFine } = useSidebar();

  return (
    <Card className="p-6">
      <h2 className="flex items-center gap-2 text-lg font-black text-animeo-dark">
        <PanelLeft aria-hidden="true" className="h-5 w-5 text-animeo" />
        Comportement de la navigation
      </h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-animeo-muted">
        Ces réglages s’appliquent tout de suite, et sont propres à cet appareil : vous pouvez préférer une barre
        réduite sur un portable et déployée sur un grand écran.
      </p>

      <div className="mt-6 space-y-6">
        {/* Les deux réglages de survol ne sont proposés que là où la souris
            existe. Au doigt, la navigation n'obéit qu'à l'appui : les afficher
            quand même reviendrait à offrir un choix sans effet. */}
        {pointerFine ? (
          <>
            <SegmentedField
              label="Ouverture de la barre latérale"
              description={
                preferences.sidebarBehavior === "hover"
                  ? "Réduite, la navigation se déploie par-dessus le contenu au passage de la souris — sans rien déplacer."
                  : "La navigation ne se déploie qu’avec son bouton, et le contenu s’adapte alors à sa largeur."
              }
              choices={behaviourChoices}
              value={preferences.sidebarBehavior}
              onChange={(sidebarBehavior) => updatePreferences({ sidebarBehavior })}
            />

            <SegmentedField
              label="Ouverture des menus"
              description={
                preferences.menuBehavior === "hover"
                  ? "Les catégories s’ouvrent au passage de la souris. Une seule reste ouverte à la fois."
                  : "Les catégories ne s’ouvrent qu’au clic. Une seule reste ouverte à la fois."
              }
              choices={behaviourChoices}
              value={preferences.menuBehavior}
              onChange={(menuBehavior) => updatePreferences({ menuBehavior })}
            />
          </>
        ) : (
          <p className="rounded-2xl bg-animeo-bg p-4 text-sm leading-6 text-animeo-muted">
            Cet appareil est tactile : la navigation s’ouvre à l’appui, et les catégories aussi. Les réglages
            d’ouverture au survol apparaîtront ici dès que vous utiliserez cet écran avec une souris.
          </p>
        )}

        <SegmentedField
          label="État de la barre latérale"
          description="Réduite, la barre ne montre que les icônes et le contenu occupe la place rendue. Le bouton en haut de la barre règle exactement la même chose."
          choices={stateChoices}
          value={preferences.defaultState}
          onChange={(defaultState) => updatePreferences({ defaultState })}
        />
      </div>
    </Card>
  );
}

function SegmentedField<T extends string>({ label, description, choices, value, onChange }: {
  label: string;
  description: string;
  choices: Array<Choice<T>>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <p className="text-sm font-extrabold text-animeo-dark">{label}</p>
      <div className="mt-2 inline-flex flex-wrap gap-1 rounded-2xl bg-animeo-bg p-1.5" role="group" aria-label={label}>
        {choices.map((choice) => (
          <button
            key={choice.value}
            type="button"
            aria-pressed={value === choice.value}
            onClick={() => onChange(choice.value)}
            className={`min-h-11 rounded-xl px-4 text-sm font-extrabold transition ${
              value === choice.value ? "bg-animeo-surface text-animeo-dark shadow-sm" : "text-animeo-muted hover:text-animeo-dark"
            }`}
          >
            {choice.label}
          </button>
        ))}
      </div>
      <p className="mt-2 max-w-xl text-xs leading-5 text-animeo-muted">{description}</p>
    </div>
  );
}
