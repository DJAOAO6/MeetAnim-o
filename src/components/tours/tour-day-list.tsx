"use client";

import Link from "next/link";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/layout/page-header";
import { formatDistanceMeters } from "@/lib/maps/map-utils";
import { buildTourMapsLinks } from "@/lib/tour-maps";
import type { TourRunView, TourDayListData, TourDayListItem } from "@/lib/tour-runs";
import type { Coordinates } from "@/data/tours";

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
  const [pastExpanded, setPastExpanded] = useState(false);
  const visiblePast = pastExpanded ? listData.past : listData.past.slice(0, PAST_VISIBLE_COUNT);

  return (
    <>
      <PageHeader
        title="Tournées"
        description="Vos journées de tournée, planifiées avant les rendez-vous."
        action={
          <button type="button" onClick={onNewDay} className="inline-flex min-h-11 items-center gap-1.5 rounded-2xl bg-animeo px-5 py-3 text-sm font-extrabold text-white shadow-[0_8px_20px_rgba(79,175,159,0.2)] transition hover:-translate-y-0.5 hover:bg-[#459e90]">
            <span aria-hidden="true" className="text-xl leading-none">+</span>
            Nouvelle journée
          </button>
        }
      />

      <div className="space-y-8">
        {today ? <TodayCard tourRun={today} dateId={todayDateId} cabinetCoordinates={cabinetCoordinates} onOpen={() => onOpenDay(todayDateId)} /> : null}

        <section>
          <h2 className="mb-3 text-xs font-extrabold uppercase tracking-[0.12em] text-animeo-muted">À venir</h2>
          {listData.upcoming.length === 0 ? (
            <EmptyState message="Aucune journée à venir pour l’instant." />
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
            <h2 className="mb-3 text-xs font-extrabold uppercase tracking-[0.12em] text-animeo-muted">Passées</h2>
            <Card className="overflow-hidden p-0">
              <ul>
                {visiblePast.map((item) => <DayRow key={item.id} item={item} onOpen={() => onOpenDay(item.dateId)} dimmed />)}
              </ul>
            </Card>
            {listData.past.length > PAST_VISIBLE_COUNT ? (
              <button type="button" onClick={() => setPastExpanded((current) => !current)} className="mt-3 text-xs font-extrabold text-animeo hover:underline">
                {pastExpanded ? "Réduire" : `Afficher les ${listData.past.length - PAST_VISIBLE_COUNT} de plus`}
              </button>
            ) : null}
          </section>
        ) : null}

        <p className="pt-2 text-xs text-animeo-muted">
          Zones, lieux enregistrés et jours récurrents se règlent dans{" "}
          <Link href="/dashboard/parametres" className="font-extrabold text-animeo hover:underline">Paramètres</Link>.
        </p>
      </div>
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

function TodayCard({ tourRun, dateId, cabinetCoordinates, onOpen }: { tourRun: TourRunView; dateId: string; cabinetCoordinates: Coordinates | null; onOpen: () => void }) {
  const lastStop = tourRun.stops[tourRun.stops.length - 1];
  const estimatedEnd = lastStop?.departureTime ?? tourRun.departureTime;
  const badges = [
    { icon: "clients" as const, label: `${tourRun.stops.length} arrêt${tourRun.stops.length > 1 ? "s" : ""}` },
    tourRun.totalDistanceMeters != null ? { icon: "car" as const, label: formatDistanceMeters(tourRun.totalDistanceMeters) } : null,
    tourRun.departureTime ? { icon: "calendar" as const, label: `${tourRun.departureTime}${estimatedEnd ? ` → ${estimatedEnd}` : ""}` } : null,
  ].filter((badge): badge is { icon: "clients" | "car" | "calendar"; label: string } => badge !== null);

  const mapsResult = buildTourMapsLinks(cabinetCoordinates, tourRun.stops.map((stop) => ({ coordinates: stop.latitude != null && stop.longitude != null ? { lat: stop.latitude, lng: stop.longitude } : null })));

  return (
    <Card className="overflow-hidden border-2 border-animeo/20">
      <div className="p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-animeo-soft text-animeo-dark"><Icon name="tournees" className="h-5 w-5" /></span>
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-animeo">Aujourd’hui</p>
            <h2 className="truncate text-lg font-black text-animeo-dark">{tourRun.name}</h2>
          </div>
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
          <button type="button" onClick={onOpen} className="inline-flex min-h-11 items-center rounded-2xl bg-animeo px-5 text-sm font-extrabold text-white shadow-[0_8px_20px_rgba(79,175,159,0.2)] transition hover:-translate-y-0.5 hover:bg-[#459e90]">
            Ouvrir ma tournée
          </button>
          {mapsResult.links.map((link) => (
            <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-2xl border border-[#d4e2df] bg-white px-5 text-sm font-extrabold text-animeo-dark transition hover:bg-animeo-bg">
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
      <span className="text-[9px] font-extrabold uppercase leading-none tracking-[0.06em]">{weekday}</span>
      <span className="text-sm font-black leading-none">{day}</span>
    </span>
  );
}

function DayRow({ item, onOpen, dimmed = false }: { item: TourDayListItem; onOpen: () => void; dimmed?: boolean }) {
  const detailParts = [
    item.stopCount > 0 ? `${item.stopCount} arrêt${item.stopCount > 1 ? "s" : ""}` : "Aucun rendez-vous pour l’instant",
    item.freeSlotCount != null && item.freeSlotCount > 0 ? `${item.freeSlotCount} créneau${item.freeSlotCount > 1 ? "x" : ""} libre${item.freeSlotCount > 1 ? "s" : ""}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <li className="border-b border-[#edf2f0] last:border-b-0">
      <button type="button" onClick={onOpen} className={`flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-animeo-bg ${dimmed ? "opacity-60" : ""}`}>
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
        <Icon name="chevron" className="h-4 w-4 shrink-0 -rotate-90 text-animeo-muted" />
      </button>
    </li>
  );
}
