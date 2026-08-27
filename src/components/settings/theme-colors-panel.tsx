"use client";

import { Card } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
import { Field, Toggle, inputClassName } from "@/components/settings/settings-fields";
import { fontChoices, type DashboardDisplayOptions, type DashboardThemeMode, type DisplayDensity, type FontChoice } from "@/data/dashboard-theme";

export type ThemeDraft = {
  mode: DashboardThemeMode;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  displayOptions: DashboardDisplayOptions;
};

type ThemePreset = { id: string; label: string; description: string; primary: string; secondary: string; accent: string };

const themePresets: ThemePreset[] = [
  { id: "teal", label: "Émeraude Animéo", description: "Le vert-bleu signature, frais et professionnel.", primary: "#4FAF9F", secondary: "#2F7A6E", accent: "#F4B860" },
  { id: "ocean", label: "Bleu Océan", description: "Un bleu confiant et apaisant.", primary: "#3B82F6", secondary: "#1E3A5F", accent: "#F59E0B" },
  { id: "plum", label: "Violet Prune", description: "Une touche élégante et originale.", primary: "#8B5CF6", secondary: "#5B3A99", accent: "#EC4899" },
];

const primarySwatches = ["#4FAF9F", "#3B82F6", "#8B5CF6", "#EC4899", "#F59E0B"];
const secondarySwatches = ["#7FD1C3", "#2F7A6E", "#7FB3F5", "#B79EF0", "#C4CCCF"];
const accentSwatches = ["#F4B860", "#E4574C", "#4FAF9F", "#5B8DEF", "#9AA6AA"];

const styleOptions: Array<{ mode: DashboardThemeMode; label: string; icon: IconName }> = [
  { mode: "light", label: "Clair", icon: "sun" },
  { mode: "dark", label: "Sombre", icon: "moon" },
  { mode: "auto", label: "Automatique", icon: "monitor" },
];

const densityOptions: Array<{ value: DisplayDensity; label: string }> = [
  { value: "compact", label: "Compacte" },
  { value: "normal", label: "Normale" },
  { value: "comfortable", label: "Confortable" },
];

type ThemeColorsPanelProps = {
  draft: ThemeDraft;
  onChange: (draft: ThemeDraft) => void;
  saving?: boolean;
  canEdit?: boolean;
  onSave: () => void;
};

export function ThemeColorsPanel({ draft, onChange, saving = false, canEdit = true, onSave }: ThemeColorsPanelProps) {
  function updateDisplayOptions(patch: Partial<DashboardDisplayOptions>) {
    onChange({ ...draft, displayOptions: { ...draft.displayOptions, ...patch } });
  }

  return (
    <Card className="p-5 sm:p-6">
      <fieldset disabled={!canEdit} className="disabled:opacity-60">
        {!canEdit ? (
          <div role="status" className="mb-5 rounded-2xl border border-[#f0d8a5] bg-[#fffaf0] px-4 py-3 text-sm font-bold text-[#8c6118]">
            Vous n’avez pas la permission de modifier les paramètres publics. Contactez un administrateur.
          </div>
        ) : null}

        <h2 className="text-lg font-black text-animeo-dark">Thème et couleurs</h2>
        <p className="mt-1 text-sm text-animeo-muted">Personnalisez les couleurs et l’apparence de votre interface et de votre page de réservation.</p>

        <div className="mt-6">
          <Field label="Thèmes prédéfinis" hint="Choisissez un thème complet en un clic, puis affinez les couleurs ci-dessous si besoin.">
            <div className="grid gap-3 sm:grid-cols-3">
              {themePresets.map((preset) => {
                const active = draft.primaryColor.toUpperCase() === preset.primary.toUpperCase()
                  && draft.secondaryColor.toUpperCase() === preset.secondary.toUpperCase()
                  && draft.accentColor.toUpperCase() === preset.accent.toUpperCase();
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onChange({ ...draft, primaryColor: preset.primary, secondaryColor: preset.secondary, accentColor: preset.accent })}
                    aria-pressed={active}
                    className={`relative rounded-2xl border-2 p-4 text-left transition ${active ? "border-animeo bg-animeo-soft" : "border-[#dfe9e6] bg-white hover:border-[#aad5cd]"}`}
                  >
                    {active ? (
                      <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-animeo text-white">
                        <CheckIcon className="h-3 w-3" />
                      </span>
                    ) : null}
                    <div className="flex h-10 overflow-hidden rounded-xl">
                      <span className="flex-1" style={{ backgroundColor: preset.primary }} />
                      <span className="flex-1" style={{ backgroundColor: preset.secondary }} />
                      <span className="flex-1" style={{ backgroundColor: preset.accent }} />
                    </div>
                    <p className="mt-3 text-sm font-extrabold text-animeo-dark">{preset.label}</p>
                    <p className="mt-1 text-xs text-animeo-muted">{preset.description}</p>
                  </button>
                );
              })}
            </div>
          </Field>
        </div>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <SwatchField
            label="Couleur principale"
            description="Couleur utilisée pour les boutons, liens et éléments actifs."
            swatches={primarySwatches}
            value={draft.primaryColor}
            onChange={(value) => onChange({ ...draft, primaryColor: value })}
            allowCustom
          />
          <SwatchField
            label="Couleur secondaire"
            description="Couleur utilisée pour les éléments secondaires."
            swatches={secondarySwatches}
            value={draft.secondaryColor}
            onChange={(value) => onChange({ ...draft, secondaryColor: value })}
          />
        </div>

        <div className="mt-6">
          <Field label="Style d’interface" hint="Choisissez l’apparence générale de votre interface.">
            <div className="grid gap-3 sm:grid-cols-3">
              {styleOptions.map((option) => {
                const active = draft.mode === option.mode;
                return (
                  <button
                    key={option.mode}
                    type="button"
                    onClick={() => onChange({ ...draft, mode: option.mode })}
                    aria-pressed={active}
                    className={`relative flex flex-col items-center gap-2 rounded-2xl border-2 p-4 text-center transition ${active ? "border-animeo bg-animeo-soft" : "border-[#dfe9e6] bg-white hover:border-[#aad5cd]"}`}
                  >
                    {active ? (
                      <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-animeo text-white">
                        <CheckIcon className="h-3 w-3" />
                      </span>
                    ) : null}
                    <Icon name={option.icon} className="h-6 w-6 text-animeo-dark" />
                    <span className="text-sm font-extrabold text-animeo-dark">{option.label}</span>
                  </button>
                );
              })}
            </div>
          </Field>
        </div>

        <div className="mt-6 sm:w-1/2 sm:pr-3">
          <SwatchField
            label="Couleur d’accent"
            description="Couleur utilisée pour les badges et notifications."
            swatches={accentSwatches}
            value={draft.accentColor}
            onChange={(value) => onChange({ ...draft, accentColor: value })}
          />
        </div>

        <div className="mt-8 border-t border-[#e7eeec] pt-6">
          <h3 className="font-black text-animeo-dark">Options d’affichage</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <ToggleRow label="Menu compact" description="Réduire la largeur du menu latéral." checked={draft.displayOptions.compactMenu} onChange={(value) => updateDisplayOptions({ compactMenu: value })} />
            <ToggleRow label="Arrondis des cartes" description="Appliquer des coins arrondis aux cartes." checked={draft.displayOptions.roundedCards} onChange={(value) => updateDisplayOptions({ roundedCards: value })} />
            <ToggleRow label="Afficher les icônes seulement" description="N’afficher que les icônes dans le menu." checked={draft.displayOptions.iconsOnly} onChange={(value) => updateDisplayOptions({ iconsOnly: value })} />
            <ToggleRow label="Animations douces" description="Activer les animations et transitions." checked={draft.displayOptions.smoothAnimations} onChange={(value) => updateDisplayOptions({ smoothAnimations: value })} />
            <Field label="Densité d’affichage" hint="Adapter la taille des éléments de l’interface.">
              <select value={draft.displayOptions.density} onChange={(event) => updateDisplayOptions({ density: event.target.value as DisplayDensity })} className={inputClassName}>
                {densityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </Field>
            <Field label="Police d’écriture" hint="Choisir la police principale de l’interface.">
              <select value={draft.displayOptions.fontFamily} onChange={(event) => updateDisplayOptions({ fontFamily: event.target.value as FontChoice })} className={inputClassName}>
                {fontChoices.map((font) => <option key={font} value={font}>{font}</option>)}
              </select>
            </Field>
          </div>
        </div>

        <button type="button" disabled={saving} onClick={onSave} className="mt-8 rounded-2xl bg-animeo px-6 py-3 text-sm font-extrabold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60">
          {saving ? "Enregistrement…" : "Enregistrer les modifications"}
        </button>
      </fieldset>
    </Card>
  );
}

function SwatchField({ label, description, swatches, value, onChange, allowCustom = false }: {
  label: string;
  description: string;
  swatches: string[];
  value: string;
  onChange: (value: string) => void;
  allowCustom?: boolean;
}) {
  return (
    <Field label={label} hint={description}>
      <div className="flex flex-wrap items-center gap-3">
        {swatches.map((swatch) => (
          <button
            key={swatch}
            type="button"
            onClick={() => onChange(swatch)}
            aria-label={`Choisir la couleur ${swatch}`}
            aria-pressed={value.toUpperCase() === swatch.toUpperCase()}
            className="flex h-10 w-10 items-center justify-center rounded-full shadow-sm transition hover:scale-105"
            style={{ backgroundColor: swatch }}
          >
            {value.toUpperCase() === swatch.toUpperCase() ? <CheckIcon className="h-4 w-4 text-white" /> : null}
          </button>
        ))}
        {allowCustom ? (
          <>
            <input type="color" value={value} onChange={(event) => onChange(event.target.value)} aria-label="Couleur personnalisée" className="h-10 w-12 cursor-pointer rounded-lg border-0 bg-transparent" />
            <input value={value.toUpperCase()} onChange={(event) => onChange(event.target.value)} className={`${inputClassName} w-32`} aria-label="Code de la couleur" />
          </>
        ) : null}
      </div>
    </Field>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#e7eeec] bg-animeo-bg px-4 py-3.5">
      <div className="min-w-0">
        <p className="text-sm font-extrabold text-animeo-dark">{label}</p>
        <p className="mt-0.5 text-xs text-animeo-muted">{description}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} label="" compact />
    </div>
  );
}
