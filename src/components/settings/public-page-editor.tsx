"use client";

import { useMemo, useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { PublicPagePreview, type PreviewDevice } from "@/components/settings/public-page-preview";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { SaveStatus, type SaveState } from "@/components/ui/save-status";
import { SortableBlock } from "@/components/ui/sortable-block";
import {
  DEFAULT_PUBLIC_THEME,
  sectionDefinition,
  type ButtonShape,
  type PublicPageConfig,
  type PublicPageDensity,
  type PublicPageFont,
  type PublicSection,
  type PublicSectionId,
  type SectionTone,
} from "@/data/public-page";
import { discardPublicPageDraftAction, publishPublicPageAction, resetPublicPageAction, savePublicPageDraftAction, type PublicPageState } from "@/lib/public-page-actions";
import { notify } from "@/lib/notify";
import type { PublicProfessional } from "@/data/public-booking";

const devices: Array<{ id: PreviewDevice; label: string }> = [
  { id: "desktop", label: "Ordinateur" },
  { id: "tablet", label: "Tablette" },
  { id: "mobile", label: "Téléphone" },
];

const tones: Array<{ id: SectionTone; label: string }> = [
  { id: "surface", label: "Carte" },
  { id: "soft", label: "Teinté" },
  { id: "transparent", label: "Sans fond" },
];

const fonts: Array<{ id: PublicPageFont; label: string }> = [
  { id: "nunito", label: "Nunito (par défaut)" },
  { id: "system", label: "Système" },
  { id: "serif", label: "Serif" },
];

const densities: Array<{ id: PublicPageDensity; label: string }> = [
  { id: "compact", label: "Compact" },
  { id: "normal", label: "Normal" },
  { id: "spacious", label: "Spacieux" },
];

const shapes: Array<{ id: ButtonShape; label: string }> = [
  { id: "rounded", label: "Arrondi" },
  { id: "pill", label: "Pilule" },
  { id: "square", label: "Carré" },
];

function PawCheck({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-start gap-2.5 py-1.5 text-sm font-bold text-animeo-dark">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--theme-primary)]"
      />
      <span>
        {label}
        <span className="mt-0.5 block text-xs font-semibold text-animeo-muted">{hint}</span>
      </span>
    </label>
  );
}

function ColorControl({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm font-bold text-animeo-dark">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={label}
          className="h-9 w-12 cursor-pointer rounded-lg border border-animeo-border bg-transparent"
        />
        <code className="text-xs font-bold uppercase text-animeo-muted">{value}</code>
      </span>
    </label>
  );
}

function OptionRow<T extends string>({ label, options, value, onChange }: { label: string; options: Array<{ id: T; label: string }>; value: T; onChange: (value: T) => void }) {
  return (
    <div className="py-2">
      <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.11em] text-animeo-muted">{label}</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={value === option.id}
            onClick={() => onChange(option.id)}
            className={`min-h-9 rounded-xl px-3 text-xs font-extrabold transition ${value === option.id ? "bg-animeo text-white" : "bg-animeo-bg text-animeo-muted hover:text-animeo-dark"}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Éditeur de la page publique de réservation : sections à gauche, aperçu réel
 * au centre, réglages de l'élément sélectionné à droite.
 *
 * L'aperçu n'est pas une imitation : il rend les mêmes composants que la page
 * publique, avec la configuration en cours. Ce qui est vu est donc ce qui
 * sera publié — c'est la raison d'être de cet écran.
 *
 * Volontairement un éditeur encadré, pas une toile libre : on compose des
 * sections typées, on choisit des couleurs et des espacements. Aucune
 * position absolue, aucun HTML libre — la page reste responsive quoi que
 * fasse le professionnel, et le parcours de réservation reste intact.
 */
export function PublicPageEditor({ initialState, professional }: { initialState: PublicPageState; professional: PublicProfessional }) {
  const [state, setState] = useState(initialState);
  const [config, setConfig] = useState<PublicPageConfig>(initialState.draft);
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const [selectedId, setSelectedId] = useState<PublicSectionId | "theme">("theme");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [confirmingReset, setConfirmingReset] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 400, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const selectedSection = useMemo(
    () => (selectedId === "theme" ? null : config.sections.find((section) => section.id === selectedId) ?? null),
    [config.sections, selectedId],
  );

  function updateSection(id: PublicSectionId, change: Partial<PublicSection>) {
    setConfig((current) => ({ ...current, sections: current.sections.map((section) => (section.id === id ? { ...section, ...change } : section)) }));
    setSaveState("dirty");
  }

  function updateTheme(change: Partial<PublicPageConfig["theme"]>) {
    setConfig((current) => ({ ...current, theme: { ...current.theme, ...change } }));
    setSaveState("dirty");
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setConfig((current) => {
      const from = current.sections.findIndex((section) => section.id === active.id);
      const to = current.sections.findIndex((section) => section.id === over.id);
      if (from === -1 || to === -1) return current;
      return { ...current, sections: arrayMove(current.sections, from, to) };
    });
    setSaveState("dirty");
  }

  async function save() {
    setSaveState("saving");
    const result = await savePublicPageDraftAction(config);
    if (!result.ok) { setSaveState("error"); return; }
    setState(result.state);
    setSaveState("saved");
  }

  async function publish() {
    setSaveState("saving");
    const result = await publishPublicPageAction(config);
    if (!result.ok) { setSaveState("error"); return; }
    setState(result.state);
    setConfig(result.state.draft);
    setSaveState("saved");
  }

  /**
   * Retour à la présentation d'origine. Confirmé parce que c'est la seule
   * action de cet écran qui efface à la fois le brouillon et la version en
   * ligne : elle change immédiatement ce que voient les clients.
   */
  async function resetToOriginal() {
    setConfirmingReset(false);
    setSaveState("saving");
    const result = await resetPublicPageAction();
    if (!result.ok) { setSaveState("error"); notify.error(result.error); return; }
    setState(result.state);
    setConfig(result.state.draft);
    setSaveState("idle");
    notify.success("Page de réservation rétablie dans sa présentation d’origine.");
  }

  async function discard() {
    setSaveState("saving");
    const result = await discardPublicPageDraftAction();
    if (!result.ok) { setSaveState("error"); return; }
    setState(result.state);
    setConfig(result.state.draft);
    setSaveState("idle");
  }

  return (
    // Seuil 2xl et non xl : l'éditeur vit désormais dans l'onglet
    // Personnalisation, qui occupe déjà une colonne de navigation à gauche.
    // À xl, les trois colonnes de l'éditeur devenaient si étroites qu'elles
    // se chevauchaient ; elles s'empilent maintenant tant que la place
    // manque.
    <div className="grid gap-5 2xl:grid-cols-[240px_minmax(0,1fr)_280px]">
      {/* Sections : colonne de gauche sur grand écran, rangée repliable au-dessus
          de l'aperçu sur les écrans plus étroits. */}
      <section className="rounded-[22px] border border-animeo-border bg-animeo-surface p-4">
        <h2 className="mb-3 text-sm font-black uppercase tracking-[0.12em] text-animeo-muted">Sections</h2>
        <DndContext id="public-page-sections" sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={config.sections.map((section) => section.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-2">
              {config.sections.map((section) => {
                const definition = sectionDefinition(section.id);
                if (!definition) return null;
                return (
                  <li key={section.id}>
                    <SortableBlock id={section.id} editing label={definition.label} toolbar={
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedId(section.id)}
                          aria-pressed={selectedId === section.id}
                          className={`min-h-9 rounded-xl px-3 text-xs font-extrabold transition ${selectedId === section.id ? "bg-animeo-soft text-animeo-dark" : "bg-animeo-bg text-animeo-muted"}`}
                        >
                          Régler
                        </button>
                        {definition.alwaysVisible ? (
                          <span className="text-[11px] font-bold text-animeo-muted" title="Cette section ne peut pas être masquée">Toujours visible</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => updateSection(section.id, { visible: !section.visible })}
                            className="min-h-9 rounded-xl bg-animeo-bg px-3 text-xs font-extrabold text-animeo-muted transition hover:text-animeo-dark"
                          >
                            {section.visible ? "Masquer" : "Afficher"}
                          </button>
                        )}
                      </div>
                    }>
                      <p className="px-1 text-xs text-animeo-muted">{definition.description}</p>
                    </SortableBlock>
                  </li>
                );
              })}
            </ul>
          </SortableContext>
        </DndContext>
      </section>

      {/* Aperçu */}
      <section className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Format d'aperçu">
            {devices.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={device === item.id}
                onClick={() => setDevice(item.id)}
                className={`min-h-9 rounded-xl px-3 text-xs font-extrabold transition ${device === item.id ? "bg-animeo text-white" : "bg-animeo-bg text-animeo-muted hover:text-animeo-dark"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <SaveStatus state={saveState} />
        </div>

        <PublicPagePreview config={config} professional={professional} device={device} />

        <div className="mt-4 flex flex-wrap gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
          <Button variant="ghost" onClick={() => setConfirmingReset(true)} disabled={saveState === "saving"}>Tout remettre d’origine</Button>
          <Button variant="ghost" onClick={discard} disabled={saveState === "saving"}>Annuler les modifications</Button>
          <Button variant="secondary" onClick={save} disabled={saveState === "saving"}>Enregistrer le brouillon</Button>
          <Button onClick={publish} disabled={saveState === "saving"}>Publier</Button>
        </div>
        <p className="mt-2 text-xs text-animeo-muted">
          {state.hasUnpublishedChanges
            ? "Vos clients voient encore la version publiée : publiez pour appliquer vos changements."
            : state.publishedAt
              ? `Page publiée — dernière mise en ligne le ${new Date(state.publishedAt).toLocaleDateString("fr-FR")}.`
              : "Cette page n'a jamais été publiée : vos clients voient la présentation d'origine."}
        </p>
      </section>

      {/* Réglages */}
      <section className="rounded-[22px] border border-animeo-border bg-animeo-surface p-4">
        <h2 className="mb-1 text-sm font-black uppercase tracking-[0.12em] text-animeo-muted">Réglages</h2>
        <div className="mb-3 flex gap-2">
          <button
            type="button"
            aria-pressed={selectedId === "theme"}
            onClick={() => setSelectedId("theme")}
            className={`min-h-9 flex-1 rounded-xl px-3 text-xs font-extrabold transition ${selectedId === "theme" ? "bg-animeo text-white" : "bg-animeo-bg text-animeo-muted"}`}
          >
            Toute la page
          </button>
        </div>

        {selectedSection ? (
          <div>
            <p className="mb-2 text-sm font-black text-animeo-dark">{sectionDefinition(selectedSection.id)?.label}</p>
            <label className="block py-2">
              <span className="mb-2 block text-xs font-extrabold uppercase tracking-[0.11em] text-animeo-muted">Titre affiché</span>
              <input
                value={selectedSection.title ?? ""}
                onChange={(event) => updateSection(selectedSection.id, { title: event.target.value })}
                placeholder={sectionDefinition(selectedSection.id)?.label}
                className="h-11 w-full rounded-xl border border-animeo-border bg-animeo-bg px-3.5 text-sm font-semibold text-animeo-dark outline-none focus:border-animeo focus:bg-white"
              />
            </label>
            <OptionRow label="Fond de la section" options={tones} value={selectedSection.tone} onChange={(tone) => updateSection(selectedSection.id, { tone })} />
          </div>
        ) : (
          <div>
            <ColorControl label="Couleur principale" value={config.theme.primaryColor} onChange={(primaryColor) => updateTheme({ primaryColor })} />
            <ColorControl label="Couleur d'accent" value={config.theme.accentColor} onChange={(accentColor) => updateTheme({ accentColor })} />
            <ColorControl label="Arrière-plan" value={config.theme.backgroundColor} onChange={(backgroundColor) => updateTheme({ backgroundColor })} />
            <ColorControl label="Cartes" value={config.theme.surfaceColor} onChange={(surfaceColor) => updateTheme({ surfaceColor })} />
            <ColorControl label="Texte" value={config.theme.textColor} onChange={(textColor) => updateTheme({ textColor })} />
            <OptionRow label="Police" options={fonts} value={config.theme.font} onChange={(font) => updateTheme({ font })} />
            <OptionRow label="Espacement" options={densities} value={config.theme.density} onChange={(density) => updateTheme({ density })} />
            <OptionRow label="Boutons" options={shapes} value={config.theme.buttonShape} onChange={(buttonShape) => updateTheme({ buttonShape })} />

            <div className="py-2">
              <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.11em] text-animeo-muted">Effet patte</p>
              <p className="mb-2 text-xs font-semibold text-animeo-muted">
                Chez vos visiteurs, à la souris seulement : sans effet sur écran tactile, et le curseur de saisie des
                champs reste normal.
              </p>
              <PawCheck
                label="Traînée de pattes"
                hint="Des traces suivent la souris sur la page. La flèche habituelle reste."
                checked={config.theme.pawTrail}
                onChange={(pawTrail) => updateTheme({ pawTrail })}
              />
              <PawCheck
                label="Remplacer le curseur"
                hint="La flèche cède la place à une patte, qui se referme quand on attrape quelque chose."
                checked={config.theme.pawCursor}
                onChange={(pawCursor) => updateTheme({ pawCursor })}
              />
              <div className="flex items-center justify-between gap-3 py-2">
                <span className="text-sm font-bold text-animeo-dark">Couleur des pattes</span>
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateTheme({ pawColor: "" })}
                    aria-pressed={config.theme.pawColor === ""}
                    title="Suivre les couleurs de la page"
                    className={`rounded-lg border px-2 py-1 text-xs font-extrabold transition ${config.theme.pawColor === "" ? "border-animeo bg-animeo-soft text-animeo-dark" : "border-animeo-border text-animeo-muted"}`}
                  >
                    Page
                  </button>
                  <input
                    type="color"
                    value={config.theme.pawColor || config.theme.primaryColor}
                    onChange={(event) => updateTheme({ pawColor: event.target.value })}
                    aria-label="Couleur des pattes"
                    className="h-9 w-12 cursor-pointer rounded-lg border border-animeo-border bg-transparent"
                  />
                </span>
              </div>
            </div>
            <label className="block py-2">
              <span className="mb-2 block text-xs font-extrabold uppercase tracking-[0.11em] text-animeo-muted">
                Assombrissement de la couverture — {config.theme.coverOverlay} %
              </span>
              <input
                type="range"
                min={0}
                max={80}
                step={5}
                value={config.theme.coverOverlay}
                onChange={(event) => updateTheme({ coverOverlay: Number(event.target.value) })}
                className="w-full accent-animeo"
              />
              <span className="mt-1 block text-xs text-animeo-muted">Plus la couverture est sombre, plus le texte posé dessus reste lisible.</span>
            </label>
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => updateTheme(DEFAULT_PUBLIC_THEME)}>
              Revenir aux couleurs 1002 Pattes
            </Button>
          </div>
        )}
      </section>

      {confirmingReset ? (
        <ConfirmModal
          title="Remettre la page d’origine ?"
          message="Vos couleurs, l’ordre des sections et les sections masquées seront effacés, et vos clients retrouveront immédiatement la présentation d’origine. Vous pourrez toujours repersonnaliser ensuite."
          confirmLabel="Tout remettre d’origine"
          onConfirm={resetToOriginal}
          onClose={() => setConfirmingReset(false)}
        />
      ) : null}
    </div>
  );
}
