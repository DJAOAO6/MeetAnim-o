"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, buttonBaseClassName, buttonSizeClassName, buttonVariantClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { PageHeader } from "@/components/layout/page-header";
import { formatDistanceMeters } from "@/lib/maps/map-utils";
import { buildTourMapsLinks } from "@/lib/tour-maps";
import { deleteTourRunAction, deleteTourRunsAction } from "@/lib/tour-runs-actions";
import { notify } from "@/lib/notify";
import type { TourRunView, TourDayListData, TourDayListItem } from "@/lib/tour-runs";
import type { Coordinates } from "@/data/tours";
import { Plus, Trash2 } from "lucide-react";

const todayLabelFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const weekdayShortFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "short" });
const PAST_VISIBLE_COUNT = 5;

type TourDayListProps = {
  today: TourRunView | null;
  todayDateId: string;
  cabinetCoordinates: Coordinates | null;
  listData: TourDayListData;
  onOpenDay: (dateId: string) => void;
  onNewDay: () => void;
};

export function TourDayList({ today, todayDateId, cabinetCoordinates, listData, onOpenDay, onNewDay }: TourDayListProps) {
  const router = useRouter();
  const [pastExpanded, setPastExpanded] = useState(false);
  // Suppression optimiste (retire immédiatement de la liste affichée) — le
  // serveur reste la source de vérité, router.refresh() la resynchronise.
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  // La suppression en attente de confirmation : la sélection, ou une journée.
  const [confirming, setConfirming] = useState<{ kind: "selection" } | { kind: "day"; id: string; label: string } | null>(null);

  const visibleUpcoming = listData.upcoming.filter((item) => !removedIds.has(item.id));
  const visiblePastAll = listData.past.filter((item) => !removedIds.has(item.id));
  const visiblePast = pastExpanded ? visiblePastAll : visiblePastAll.slice(0, PAST_VISIBLE_COUNT);

  // Tout ce qui est réellement affiché, et donc sélectionnable : les journées
  // passées repliées n'entrent pas dans « tout sélectionner », sinon on
  // supprimerait des lignes qu'on n'a pas sous les yeux.
  const selectableIds = [...visibleUpcoming, ...visiblePast].map((item) => item.id);
  const selectedCount = selectedIds.size;
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function deleteSelected() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBulkDeleting(true);
    const result = await deleteTourRunsAction(ids);
    setBulkDeleting(false);
    if (!result.ok) {
      notify.error(result.error);
      return;
    }

    setRemovedIds((current) => new Set([...current, ...ids]));
    setSelectedIds(new Set());
    const deleted = result.deleted ?? ids.length;
    notify.success(`${deleted} journée${deleted > 1 ? "s" : ""} supprimée${deleted > 1 ? "s" : ""}.`);
    router.refresh();
  }

  async function deleteDay(id: string) {
    setDeletingIds((current) => new Set(current).add(id));
    const result = await deleteTourRunAction(id);
    setDeletingIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    if (!result.ok) {
      notify.error(result.error);
      return;
    }
    setRemovedIds((current) => new Set(current).add(id));
    notify.success("Tournée supprimée.");
    router.refresh();
  }

  return (
    <>
      <PageHeader
        title="Tournées"
        description="Vos journées de tournée, planifiées avant les rendez-vous."
        action={
          <Button type="button" onClick={onNewDay} icon={<Plus aria-hidden="true" className="h-4 w-4" strokeWidth={2.75} />}>Nouvelle journée</Button>
        }
      />

      <div className="space-y-8">
        {selectableIds.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-animeo-border-soft bg-animeo-bg px-4 py-3">
            <Button type="button" variant="secondary" onClick={() => setSelectedIds(allSelected ? new Set() : new Set(selectableIds))}>
              {allSelected ? "Tout désélectionner" : `Tout sélectionner (${selectableIds.length})`}
            </Button>
            {selectedCount > 0 ? (
              <>
                <span className="text-xs font-bold text-animeo-muted">
                  {selectedCount} journée{selectedCount > 1 ? "s" : ""} sélectionnée{selectedCount > 1 ? "s" : ""}
                </span>
                <Button type="button" variant="danger" onClick={() => setConfirming({ kind: "selection" })} disabled={bulkDeleting} icon={<Trash2 aria-hidden="true" className="h-4 w-4" />} className="ml-auto">
                  {bulkDeleting ? "Suppression…" : "Supprimer la sélection"}
                </Button>
              </>
            ) : null}
          </div>
        ) : null}

        {today && !removedIds.has(today.id) ? (
          <TodayCard
            tourRun={today}
            dateId={todayDateId}
            cabinetCoordinates={cabinetCoordinates}
            onOpen={() => onOpenDay(todayDateId)}
            onDelete={() => setConfirming({ kind: "day", id: today.id, label: "d’aujourd’hui" })}
            deleting={deletingIds.has(today.id)}
          />
        ) : null}

        <section>
          <h2 className="mb-3 text-xs font-extrabold uppercase tracking-[0.12em] text-animeo-muted">À venir</h2>
          {visibleUpcoming.length === 0 ? (
            <EmptyState message="Aucune journée à venir pour l’instant." />
          ) : (
            <Card className="overflow-hidden p-0">
              <ul>
                {visibleUpcoming.map((item) => (
                  <DayRow key={item.id} item={item} onOpen={() => onOpenDay(item.dateId)} onDelete={() => setConfirming({ kind: "day", id: item.id, label: `du ${item.dateLabel}` })} deleting={deletingIds.has(item.id) || (bulkDeleting && selectedIds.has(item.id))} selected={selectedIds.has(item.id)} onToggleSelected={() => toggleSelected(item.id)} />
                ))}
              </ul>
            </Card>
          )}
        </section>

        {visiblePastAll.length > 0 ? (
          <section>
            <h2 className="mb-3 text-xs font-extrabold uppercase tracking-[0.12em] text-animeo-muted">Passées</h2>
            <Card className="overflow-hidden p-0">
              <ul>
                {visiblePast.map((item) => (
                  <DayRow key={item.id} item={item} onOpen={() => onOpenDay(item.dateId)} onDelete={() => setConfirming({ kind: "day", id: item.id, label: `du ${item.dateLabel}` })} deleting={deletingIds.has(item.id) || (bulkDeleting && selectedIds.has(item.id))} selected={selectedIds.has(item.id)} onToggleSelected={() => toggleSelected(item.id)} dimmed />
                ))}
              </ul>
            </Card>
            {visiblePastAll.length > PAST_VISIBLE_COUNT ? (
              <Button type="button" variant="secondary" onClick={() => setPastExpanded((current) => !current)} className="mt-3">
                {pastExpanded ? "Réduire" : `Afficher les ${visiblePastAll.length - PAST_VISIBLE_COUNT} de plus`}
              </Button>
            ) : null}
          </section>
        ) : null}

        <p className="pt-2 text-xs text-animeo-muted">
          Zones, lieux enregistrés et jours récurrents se règlent dans{" "}
          <Link href="/dashboard/parametres" className="font-extrabold text-animeo hover:underline">Paramètres</Link>.
        </p>
      </div>

      {confirming?.kind === "selection" ? (
        <ConfirmModal
          title={`Supprimer ${selectedCount} journée${selectedCount > 1 ? "s" : ""} de tournée ?`}
          message="Les rendez-vous eux-mêmes ne sont pas supprimés, seules les journées (les itinéraires) le sont."
          confirmLabel="Supprimer"
          onConfirm={() => { setConfirming(null); void deleteSelected(); }}
          onClose={() => setConfirming(null)}
        />
      ) : null}
      {confirming?.kind === "day" ? (
        <ConfirmModal
          title={`Supprimer la tournée ${confirming.label} ?`}
          message="Les rendez-vous eux-mêmes ne sont pas supprimés, seule la tournée (l’itinéraire) l’est."
          confirmLabel="Supprimer"
          onConfirm={() => { const { id } = confirming; setConfirming(null); void deleteDay(id); }}
          onClose={() => setConfirming(null)}
        />
      ) : null}
    </>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl bg-animeo-bg px-4 py-10 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-animeo-dark shadow-sm"><Icon name="tournees" className="h-6 w-6" /></span>
      <p className="mt-4 font-bold text-animeo-dark">{message}</p>
    </div>
  );
}

function TodayCard({ tourRun, dateId, cabinetCoordinates, onOpen, onDelete, deleting }: { tourRun: TourRunView; dateId: string; cabinetCoordinates: Coordinates | null; onOpen: () => void; onDelete: () => void; deleting: boolean }) {
  const lastStop = tourRun.stops[tourRun.stops.length - 1];
  const estimatedEnd = lastStop?.departureTime ?? tourRun.departureTime;
  const badges = [
    { icon: "clients" as const, label: `${tourRun.stops.length} arrêt${tourRun.stops.length > 1 ? "s" : ""}` },
    tourRun.totalDistanceMeters != null ? { icon: "car" as const, label: formatDistanceMeters(tourRun.totalDistanceMeters) } : null,
    tourRun.departureTime ? { icon: "calendar" as const, label: `${tourRun.departureTime}${estimatedEnd ? ` → ${estimatedEnd}` : ""}` } : null,
  ].filter((badge): badge is { icon: "clients" | "car" | "calendar"; label: string } => badge !== null);

  const mapsResult = buildTourMapsLinks(cabinetCoordinates, tourRun.stops.map((stop) => ({ coordinates: stop.latitude != null && stop.longitude != null ? { lat: stop.latitude, lng: stop.longitude } : null })));

  return (
    <Card className={`overflow-hidden border-2 border-animeo/20 ${deleting ? "opacity-50" : ""}`}>
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-animeo-soft text-animeo-dark"><Icon name="tournees" className="h-5 w-5" /></span>
            <div className="min-w-0">
              <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-animeo">Aujourd’hui</p>
              <h2 className="truncate text-lg font-black text-animeo-dark">{tourRun.name}</h2>
            </div>
          </div>
          <IconButton variant="danger" label="Supprimer la tournée d’aujourd’hui" onClick={onDelete} disabled={deleting} tooltipAlign="end">
            <Trash2 aria-hidden="true" className="h-5 w-5" />
          </IconButton>
        </div>
        <p className="mt-1 text-sm capitalize text-animeo-muted">{todayLabelFormatter.format(new Date(`${dateId}T12:00:00.000Z`))}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          {badges.map((badge) => (
            <span key={badge.label} className="inline-flex items-center gap-1.5 rounded-xl bg-animeo-bg px-3 py-1.5 text-xs font-extrabold text-animeo-dark">
              <Icon name={badge.icon} className="h-3.5 w-3.5" />
              {badge.label}
            </span>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" onClick={onOpen}>Ouvrir ma tournée</Button>
          {mapsResult.links.map((link) => (
            <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer" className={`${buttonBaseClassName} ${buttonVariantClassName.secondary} ${buttonSizeClassName.md}`}>
              <Icon name="car" className="h-4 w-4" />
              {mapsResult.links.length > 1 ? link.label : "Itinéraire complet"}
            </a>
          ))}
        </div>
      </div>
    </Card>
  );
}

function DateBadge({ dateId, dimmed }: { dateId: string; dimmed: boolean }) {
  const date = new Date(`${dateId}T12:00:00.000Z`);
  const day = date.getUTCDate();
  const weekday = weekdayShortFormatter.format(date).replace(".", "");

  return (
    <span className={`flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-2xl ${dimmed ? "bg-animeo-bg text-animeo-muted" : "bg-animeo-soft text-animeo-dark"}`}>
      <span className="text-[11px] font-extrabold uppercase leading-none tracking-[0.06em]">{weekday}</span>
      <span className="text-sm font-black leading-none">{day}</span>
    </span>
  );
}

function DayRow({ item, onOpen, onDelete, deleting, selected, onToggleSelected, dimmed = false }: { item: TourDayListItem; onOpen: () => void; onDelete: () => void; deleting: boolean; selected: boolean; onToggleSelected: () => void; dimmed?: boolean }) {
  const detailParts = [
    item.stopCount > 0 ? `${item.stopCount} arrêt${item.stopCount > 1 ? "s" : ""}` : "Aucun rendez-vous pour l’instant",
    item.freeSlotCount != null && item.freeSlotCount > 0 ? `${item.freeSlotCount} créneau${item.freeSlotCount > 1 ? "x" : ""} libre${item.freeSlotCount > 1 ? "s" : ""}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <li className="border-b border-animeo-border-soft last:border-b-0">
      <div className={`flex min-h-11 items-center gap-2 pl-4 pr-2 transition ${dimmed ? "opacity-60" : ""} ${deleting ? "opacity-40" : ""} ${selected ? "bg-animeo-soft" : ""}`}>
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelected}
          aria-label={`Sélectionner la tournée du ${item.dateLabel}`}
          className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--theme-primary)]"
        />
        <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 py-3 text-left transition hover:opacity-80">
          <DateBadge dateId={item.dateId} dimmed={dimmed} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-extrabold text-animeo-dark">
              {item.dateLabel}{item.sectorLabel ? ` · ${item.sectorLabel}` : ""}
            </p>
            <p className="mt-0.5 truncate text-xs text-animeo-muted">
              {detailParts}
              {item.recurrenceMention ? <span className="ml-1.5">· {item.recurrenceMention}</span> : null}
            </p>
          </div>
        </button>
        <IconButton variant="danger" label={`Supprimer la tournée du ${item.dateLabel}`} tooltip="Supprimer" onClick={onDelete} disabled={deleting} tooltipAlign="end">
          <Trash2 aria-hidden="true" className="h-5 w-5" />
        </IconButton>
        <Icon name="chevron" className="h-4 w-4 shrink-0 -rotate-90 text-animeo-muted" />
      </div>
    </li>
  );
}
