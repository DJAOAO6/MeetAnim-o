"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { TourRunEditor } from "@/components/tours/tour-run-editor";
import { TourDayList } from "@/components/tours/tour-day-list";
import { NewTourDayModal } from "@/components/tours/new-tour-day-modal";
import type { Coordinates, MapClient } from "@/data/tours";
import type { TourDayListData, TourRunEditorData } from "@/lib/tour-runs";
import type { ServiceSettings } from "@/data/settings";

type ToursViewProps = {
  listData: TourDayListData;
  editorDateId: string;
  editorData: TourRunEditorData;
  cabinetCoordinates: Coordinates | null;
  mapClients: MapClient[];
  homeServices: ServiceSettings[];
  // Vrai quand l'URL d'entrée portait déjà ?date=... (navigation directe vers
  // une journée, ou rechargement de page pendant qu'elle est ouverte) —
  // permet de rouvrir la journée directement plutôt que de retomber sur la
  // liste à chaque F5.
  explicitDate: boolean;
};

/**
 * Unification des tournées, phase 2 : plus de maître-détail, plus d'onglet
 * carte (doublon de /dashboard/carte), plus de bandeau — une liste de
 * journées datées, un seul point de création. Ouvrir une journée réutilise
 * TourRunEditor tel quel (sa fusion avec le détail/l'exécution est la
 * phase 3, pas celle-ci).
 *
 * Un seul chemin de création (correctif) : naviguer directement vers une
 * date sans TourRun (ex. lien direct, F5) ouvre désormais NewTourDayModal
 * — le même formulaire que "+ Nouvelle journée" — plutôt qu'un second
 * formulaire dupliqué à l'intérieur de TourRunEditor.
 */
export function ToursView({ listData, editorDateId, editorData, cabinetCoordinates, mapClients, homeServices, explicitDate }: ToursViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [editorOpen, setEditorOpen] = useState(explicitDate);
  const [newDayModalOpen, setNewDayModalOpen] = useState(false);

  function openDay(dateId: string) {
    setEditorOpen(true);
    router.push(`${pathname}?date=${dateId}`);
  }

  function closeEditor() {
    setEditorOpen(false);
    router.push(pathname);
  }

  const showEditor = editorOpen && editorData.tourRun != null;
  const needsCreation = editorOpen && editorData.tourRun == null;

  return (
    <>
      {showEditor ? (
        <TourRunEditor
          dateId={editorDateId}
          tourRun={editorData.tourRun}
          savedPlaces={editorData.savedPlaces}
          availableAppointments={editorData.availableAppointments}
          unplacedHomeAppointments={editorData.unplacedHomeAppointments}
          stopsToRemove={editorData.stopsToRemove}
          cabinet={editorData.cabinet}
          mapClients={mapClients}
          homeServices={homeServices}
          onClose={closeEditor}
        />
      ) : (
        <TourDayList
          today={editorData.tourRun}
          todayDateId={editorDateId}
          cabinetCoordinates={cabinetCoordinates}
          listData={listData}
          onOpenDay={openDay}
          onNewDay={() => setNewDayModalOpen(true)}
        />
      )}

      {newDayModalOpen || needsCreation ? (
        <NewTourDayModal
          defaultDateId={editorDateId}
          savedPlaces={editorData.savedPlaces}
          cabinetAvailable={editorData.cabinet.latitude != null}
          onClose={() => {
            setNewDayModalOpen(false);
            if (needsCreation) closeEditor();
          }}
          onCreated={(dateId) => {
            setNewDayModalOpen(false);
            openDay(dateId);
          }}
        />
      ) : null}
    </>
  );
}
