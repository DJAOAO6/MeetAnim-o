"use client";

import { useMemo, useState, type ReactNode } from "react";
import { restrictToWindowEdges } from "@dnd-kit/modifiers";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { DashboardAvailabilityControls } from "@/components/availability/dashboard-availability-controls";
import { DashboardActivityChart } from "@/components/dashboard/dashboard-activity-chart";
import { DashboardActivitySummary } from "@/components/dashboard/dashboard-activity-summary";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DashboardNextTour } from "@/components/dashboard/dashboard-next-tour";
import { DashboardPlanning } from "@/components/dashboard/dashboard-planning";
import { DashboardRemindersCard } from "@/components/dashboard/dashboard-reminders-card";
import { DashboardStats } from "@/components/dashboard/dashboard-stats";
import { Button } from "@/components/ui/button";
import { SaveStatus, type SaveState } from "@/components/ui/save-status";
import { SortableBlock } from "@/components/ui/sortable-block";
import {
  widgetDefinition,
  type DashboardWidgetId,
  type DashboardWidgetPreference,
  type DashboardWidgetSpan,
} from "@/data/dashboard-widgets";
import { resetDashboardLayoutAction, saveDashboardLayoutAction } from "@/lib/dashboard-layout-actions";
import type { DashboardOverviewData } from "@/lib/dashboard-overview";

type DashboardViewProps = DashboardOverviewData & { initialLayout: DashboardWidgetPreference[] };

/**
 * Largeur réelle d'un bloc selon l'écran. La largeur choisie ne s'applique
 * qu'à partir de xl, là où quatre colonnes tiennent vraiment : sur tablette
 * tout se ramène à une ou deux colonnes, sur téléphone à une seule. L'ordre
 * choisi, lui, est toujours respecté — c'est lui qui porte l'intention.
 */
const spanClassName: Record<DashboardWidgetSpan, string> = {
  1: "md:col-span-1 xl:col-span-1",
  2: "md:col-span-2 xl:col-span-2",
  3: "md:col-span-2 xl:col-span-3",
  4: "md:col-span-2 xl:col-span-4",
};

export function DashboardView({ clients, tours, zones, tourAppointments, reminders, cabinetAvailable, homeAvailable, initialLayout }: DashboardViewProps) {
  const dueReminders = useMemo(() => reminders.filter((reminder) => reminder.status === "À relancer").length, [reminders]);

  const [layout, setLayout] = useState(initialLayout);
  const [editing, setEditing] = useState(false);
  // Disposition d'avant l'entrée en édition : « Annuler » doit la restituer
  // exactement, y compris après plusieurs déplacements.
  const [snapshot, setSnapshot] = useState(initialLayout);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const widgetContent = useMemo<Record<DashboardWidgetId, ReactNode>>(() => ({
    availability: <DashboardAvailabilityControls cabinetAvailable={cabinetAvailable} homeAvailable={homeAvailable} />,
    stats: <DashboardStats clients={clients} dueReminders={dueReminders} />,
    planning: <DashboardPlanning clients={clients} />,
    activityChart: <DashboardActivityChart />,
    nextTour: <DashboardNextTour tours={tours} zones={zones} tourAppointments={tourAppointments} />,
    reminders: <DashboardRemindersCard reminders={reminders} />,
    activitySummary: <DashboardActivitySummary clients={clients} />,
  }), [cabinetAvailable, homeAvailable, clients, dueReminders, tours, zones, tourAppointments, reminders]);

  // Souris : quelques pixels avant de déplacer, pour ne pas confondre avec un
  // clic. Doigt : appui maintenu, même règle que l'agenda — le défilement de
  // la page reste prioritaire. Clavier : déplacement aux flèches.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 400, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const visibleWidgets = layout.filter((widget) => widget.visible);
  const hiddenWidgets = layout.filter((widget) => !widget.visible);

  function updateWidget(id: DashboardWidgetId, change: Partial<DashboardWidgetPreference>) {
    setLayout((current) => current.map((widget) => (widget.id === id ? { ...widget, ...change } : widget)));
    setSaveState("dirty");
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setLayout((current) => {
      const from = current.findIndex((widget) => widget.id === active.id);
      const to = current.findIndex((widget) => widget.id === over.id);
      if (from === -1 || to === -1) return current;
      return arrayMove(current, from, to);
    });
    setSaveState("dirty");
  }

  async function save() {
    setSaveState("saving");
    const result = await saveDashboardLayoutAction(layout);
    if (!result.ok) { setSaveState("error"); return; }
    setLayout(result.layout);
    setSnapshot(result.layout);
    setSaveState("saved");
    setEditing(false);
  }

  function cancel() {
    setLayout(snapshot);
    setSaveState("idle");
    setEditing(false);
  }

  async function reset() {
    setSaveState("saving");
    const result = await resetDashboardLayoutAction();
    if (!result.ok) { setSaveState("error"); return; }
    setLayout(result.layout);
    setSnapshot(result.layout);
    setSaveState("saved");
  }

  const grid = (
    <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2 xl:grid-cols-4" data-testid="dashboard-grid">
      {visibleWidgets.map((widget) => {
        const definition = widgetDefinition(widget.id);
        if (!definition) return null;
        return (
          <SortableBlock
            key={widget.id}
            id={widget.id}
            editing={editing}
            label={definition.label}
            className={spanClassName[widget.span]}
            toolbar={
              <div className="flex flex-wrap items-center gap-1.5">
                <div className="flex items-center gap-1 rounded-xl bg-animeo-surface px-2 py-1 shadow-sm" role="group" aria-label={`Largeur du bloc ${definition.label}`}>
                  {([1, 2, 3, 4] as DashboardWidgetSpan[]).map((span) => (
                    <button
                      key={span}
                      type="button"
                      disabled={span < definition.minSpan}
                      aria-pressed={widget.span === span}
                      onClick={() => updateWidget(widget.id, { span })}
                      title={`${span} colonne${span > 1 ? "s" : ""}`}
                      className={`min-h-7 min-w-7 rounded-lg text-xs font-black transition disabled:opacity-30 ${widget.span === span ? "bg-animeo text-white" : "text-animeo-muted hover:bg-animeo-bg"}`}
                    >
                      {span}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => updateWidget(widget.id, { visible: false })}
                  className="min-h-9 rounded-xl bg-animeo-surface px-3 text-xs font-extrabold text-animeo-muted shadow-sm transition hover:text-animeo-error"
                >
                  Masquer
                </button>
              </div>
            }
          >
            {widgetContent[widget.id]}
          </SortableBlock>
        );
      })}
    </div>
  );

  return (
    <>
      <DashboardHeader />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SaveStatus state={saveState} />
        <div className="flex flex-wrap gap-2 sm:justify-end [&>*]:flex-1 sm:[&>*]:flex-none">
          {editing ? (
            <>
              <Button variant="ghost" onClick={reset}>Réinitialiser</Button>
              <Button variant="secondary" onClick={cancel}>Annuler</Button>
              <Button onClick={save} disabled={saveState === "saving"}>
                {saveState === "saving" ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </>
          ) : (
            <Button
              variant="secondary"
              onClick={() => { setSnapshot(layout); setEditing(true); setSaveState("idle"); }}
            >
              Personnaliser mon tableau de bord
            </Button>
          )}
        </div>
      </div>

      {editing ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToWindowEdges]} onDragEnd={handleDragEnd}>
          <SortableContext items={visibleWidgets.map((widget) => widget.id)} strategy={rectSortingStrategy}>
            {grid}
          </SortableContext>
        </DndContext>
      ) : (
        grid
      )}

      {editing ? (
        <section className="mt-8 rounded-[22px] border border-dashed border-animeo-border-strong p-5">
          <h2 className="text-sm font-black uppercase tracking-[0.12em] text-animeo-muted">Ajouter un bloc</h2>
          {hiddenWidgets.length === 0 ? (
            <p className="mt-3 text-sm text-animeo-muted">Tous les blocs disponibles sont déjà affichés.</p>
          ) : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {hiddenWidgets.map((widget) => {
                const definition = widgetDefinition(widget.id);
                if (!definition) return null;
                return (
                  <li key={widget.id} className="flex items-start justify-between gap-3 rounded-2xl bg-animeo-surface p-4">
                    <div className="min-w-0">
                      <p className="text-sm font-extrabold text-animeo-dark">{definition.label}</p>
                      <p className="mt-1 text-xs text-animeo-muted">{definition.description}</p>
                    </div>
                    <Button size="sm" onClick={() => updateWidget(widget.id, { visible: true })}>Ajouter</Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      {visibleWidgets.length === 0 && !editing ? (
        <div className="rounded-[22px] border border-dashed border-animeo-border-strong p-10 text-center">
          <p className="text-sm font-extrabold text-animeo-dark">Votre tableau de bord est vide.</p>
          <p className="mt-1 text-sm text-animeo-muted">Ajoutez les blocs qui vous sont utiles depuis « Personnaliser mon tableau de bord ».</p>
        </div>
      ) : null}
    </>
  );
}
