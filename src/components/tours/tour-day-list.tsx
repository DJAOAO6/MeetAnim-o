"use client";

import Link from "next/link";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { formatDistanceMeters } from "@/lib/maps/map-utils";
import { buildTourMapsLinks } from "@/lib/tour-maps";
import type { TourRunView, TourDayListData, TourDayListItem } from "@/lib/tour-runs";
import type { Coordinates } from "@/data/tours";

const todayLabelFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
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
  const [pastExpanded, setPastExpanded] = useState(false);
  const visiblePast = pastExpanded ? listData.past : listData.past.slice(0, PAST_VISIBLE_COUNT);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium text-animeo-dark">Tournées</h1>
          <p className="mt-1 text-sm text-animeo-muted">Vos journées de tournée, planifiées avant les rendez-vous.</p>
        </div>
        <button type="button" onClick={onNewDay} className="inline-flex min-h-11 shrink-0 items-center rounded-xl bg-animeo px-5 text-sm font-medium text-white transition hover:bg-[#459e90]">
          + Nouvelle journée
        </button>
      </div>

      {today ? <TodayCard tourRun={today} dateId={todayDateId} cabinetCoordinates={cabinetCoordinates} onOpen={() => onOpenDay(todayDateId)} /> : null}

      <section>
        <h2 className="mb-3 text-sm font-medium text-animeo-dark">À venir</h2>
        {listData.upcoming.length === 0 ? (
          <p className="text-sm text-animeo-muted">Aucune journée à venir pour l’instant.</p>
        ) : (
          <Card className="overflow-hidden p-0">
            <ul>
              {listData.upcoming.map((item) => <DayRow key={item.id} item={item} onOpen={() => onOpenDay(item.dateId)} />)}
            </ul>
          </Card>
        )}
      </section>

      {listData.past.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-medium text-animeo-dark">Passées</h2>
          <Card className="overflow-hidden p-0">
            <ul>
              {visiblePast.map((item) => <DayRow key={item.id} item={item} onOpen={() => onOpenDay(item.dateId)} dimmed />)}
            </ul>
          </Card>
          {listData.past.length > PAST_VISIBLE_COUNT ? (
            <button type="button" onClick={() => setPastExpanded((current) => !current)} className="mt-2 text-xs font-medium text-animeo hover:underline">
              {pastExpanded ? "Réduire" : `Afficher les ${listData.past.length - PAST_VISIBLE_COUNT} de plus`}
            </button>
          ) : null}
        </section>
      ) : null}

      <p className="pt-2 text-xs text-animeo-muted">
        Zones, lieux enregistrés et jours récurrents se règlent dans{" "}
        <Link href="/dashboard/parametres" className="font-medium text-animeo hover:underline">Paramètres</Link>.
      </p>
    </div>
  );
}

function TodayCard({ tourRun, dateId, cabinetCoordinates, onOpen }: { tourRun: TourRunView; dateId: string; cabinetCoordinates: Coordinates | null; onOpen: () => void }) {
  const lastStop = tourRun.stops[tourRun.stops.length - 1];
  const estimatedEnd = lastStop?.departureTime ?? tourRun.departureTime;
  const summary = [
    `${tourRun.stops.length} arrêt${tourRun.stops.length > 1 ? "s" : ""}`,
    tourRun.totalDistanceMeters != null ? formatDistanceMeters(tourRun.totalDistanceMeters) : null,
    tourRun.departureTime ? `${tourRun.departureTime}${estimatedEnd ? ` → ${estimatedEnd}` : ""}` : null,
  ].filter(Boolean).join(" · ");

  const mapsResult = buildTourMapsLinks(cabinetCoordinates, tourRun.stops.map((stop) => ({ coordinates: stop.latitude != null && stop.longitude != null ? { lat: stop.latitude, lng: stop.longitude } : null })));

  return (
    <Card className="overflow-hidden">
      <div className="p-5 sm:p-6">
        <p className="text-xs font-medium uppercase tracking-[0.1em] text-animeo">Aujourd’hui</p>
        <h2 className="mt-1 text-lg font-medium text-animeo-dark">{todayLabelFormatter.format(new Date(`${dateId}T12:00:00.000Z`))} · {tourRun.name}</h2>
        <p className="mt-1.5 text-sm text-animeo-muted">{summary}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={onOpen} className="inline-flex min-h-11 items-center rounded-xl bg-animeo px-5 text-sm font-medium text-white transition hover:bg-[#459e90]">
            Ouvrir ma tournée
          </button>
          {mapsResult.links.map((link) => (
            <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-animeo px-5 text-sm font-medium text-animeo transition hover:bg-animeo-soft">
              <Icon name="car" className="h-4 w-4" />
              {mapsResult.links.length > 1 ? link.label : "Itinéraire complet"}
            </a>
          ))}
        </div>
      </div>
    </Card>
  );
}

function DayRow({ item, onOpen, dimmed = false }: { item: TourDayListItem; onOpen: () => void; dimmed?: boolean }) {
  const detailParts = [
    item.stopCount > 0 ? `${item.stopCount} arrêt${item.stopCount > 1 ? "s" : ""}` : "aucun rendez-vous pour l’instant",
    item.freeSlotCount != null && item.freeSlotCount > 0 ? `${item.freeSlotCount} créneau${item.freeSlotCount > 1 ? "x" : ""} libre${item.freeSlotCount > 1 ? "s" : ""}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <li className="border-b border-[#edf2f0] last:border-b-0">
      <button type="button" onClick={onOpen} className={`flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-animeo-bg ${dimmed ? "opacity-60" : ""}`}>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-animeo-dark">
            {item.dateLabel}{item.sectorLabel ? ` · ${item.sectorLabel}` : ""}
            {item.recurrenceMention ? <span className="ml-2 text-xs font-normal text-animeo-muted">({item.recurrenceMention})</span> : null}
          </p>
          <p className="mt-0.5 truncate text-xs text-animeo-muted">{detailParts}</p>
        </div>
      </button>
    </li>
  );
}
