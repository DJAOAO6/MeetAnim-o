"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ClientsMap } from "@/components/tours/clients-map";
import { TourModal, type TourFormValue } from "@/components/tours/tour-modal";
import { ToursOverview } from "@/components/tours/tours-overview";
import { TourRunEditor } from "@/components/tours/tour-run-editor";
import { ZoneModal, type ZoneFormValue } from "@/components/tours/zone-modal";
import { ZonesPanel } from "@/components/tours/zones-panel";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
import { notify } from "@/lib/notify";
import { deleteTourAction, deleteZoneAction, reassignAndDeleteZoneAction, saveTourAction, saveZoneAction } from "@/lib/tours-actions";
import type { Coordinates, MapClient, Tour, TourAppointment, Zone } from "@/data/tours";
import type { TourRunEditorData } from "@/lib/tour-runs";

type ToursViewProps = {
  initialTab: "tours" | "map";
  initialTours: Tour[];
  initialZones: Zone[];
  // Arrêts réels de la prochaine occurrence de chaque tournée (dérivés des
  // rendez-vous, jamais une table à part) — groupés par tournée côté
  // serveur, affichés dans la timeline de TourDetail.
  appointments: Record<string, TourAppointment[]>;
  mapClients: MapClient[];
  cabinetCoordinates: Coordinates | null;
  cabinetAddress: string | null;
  editorDateId: string;
  editorData: TourRunEditorData;
  // Vrai quand l'URL d'entrée portait déjà ?date=... (navigation dans
  // l'éditeur, ou rechargement de page pendant qu'il est ouvert) — permet de
  // rouvrir l'éditeur directement plutôt que de retomber sur la vue
  // d'ensemble à chaque F5 (voir onOpenEditor, qui pousse ce même paramètre).
  explicitDate: boolean;
};

export function ToursView({ initialTab, initialTours, initialZones, appointments, mapClients, cabinetCoordinates: _cabinetCoordinates, cabinetAddress, editorDateId, editorData, explicitDate }: ToursViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  // L'éditeur ne vit que dans l'onglet "tours" : ?date=... force cet onglet
  // au chargement, quelle que soit la route (/tournees ou /carte).
  const [activeTab, setActiveTab] = useState<"tours" | "map">(explicitDate ? "tours" : initialTab);
  const [editorOpen, setEditorOpen] = useState(explicitDate);
  const [tours, setTours] = useState(initialTours);
  const [zones, setZones] = useState(initialZones);
  const [selectedTourId, setSelectedTourId] = useState<string | null>(null);
  const [tourModal, setTourModal] = useState<Tour | "new" | null>(null);
  const [zoneModal, setZoneModal] = useState<Zone | "new" | null>(null);
  const [zonesPanelOpen, setZonesPanelOpen] = useState(false);

  async function saveTour(value: TourFormValue) {
    const result = await saveTourAction(value);
    if (!result.ok) {
      notify.error(result.error);
      return;
    }
    setTours((current) => current.some((tour) => tour.id === result.tour.id)
      ? current.map((tour) => tour.id === result.tour.id ? result.tour : tour)
      : [result.tour, ...current]);
    notify.success(value.id ? `${result.tour.name} a été modifiée.` : `${result.tour.name} a été créée.`);
    setTourModal(null);
  }

  async function saveZone(value: ZoneFormValue) {
    const result = await saveZoneAction(value);
    if (!result.ok) {
      notify.error(result.error);
      return;
    }
    setZones((current) => current.some((zone) => zone.id === result.zone.id)
      ? current.map((zone) => zone.id === result.zone.id ? result.zone : zone)
      : [result.zone, ...current]);
    notify.success(value.id ? `${result.zone.name} a été modifiée.` : `${result.zone.name} a été créée.`);
    setZoneModal(null);
  }

  async function deleteTour(tour: Tour) {
    const result = await deleteTourAction(tour.id);
    if (!result.ok) {
      notify.error(result.error);
      return;
    }
    setTours((current) => current.filter((item) => item.id !== tour.id));
    setSelectedTourId(null);
    setTourModal(null);
    notify.success(`${tour.name} a été supprimée.`);
  }

  async function deleteZone(zone: Zone) {
    const result = await deleteZoneAction(zone.id);
    if (!result.ok) {
      notify.error(result.error);
      return;
    }
    setZones((current) => current.filter((item) => item.id !== zone.id));
    notify.success(`${zone.name} a été supprimée.`);
  }

  async function reassignAndDeleteZone(zoneId: string, targetZoneId: string) {
    const result = await reassignAndDeleteZoneAction(zoneId, targetZoneId);
    if (!result.ok) {
      notify.error(result.error);
      return;
    }
    const targetZone = zones.find((zone) => zone.id === targetZoneId);
    setZones((current) => current.filter((zone) => zone.id !== zoneId));
    setTours((current) => current.map((tour) => tour.zoneIds.includes(zoneId)
      ? { ...tour, zoneId: tour.zoneId === zoneId ? targetZoneId : tour.zoneId, zoneIds: [...new Set(tour.zoneIds.filter((id) => id !== zoneId).concat(targetZoneId))] }
      : tour));
    notify.success(targetZone ? `Tournées réassignées vers « ${targetZone.name} », zone supprimée.` : "Zone supprimée.");
  }

  function changeTab(tab: "tours" | "map") {
    setActiveTab(tab);
    setSelectedTourId(null);
  }

  return (
    <>
      <PageHeader
        title={activeTab === "tours" ? "Tournées" : "Carte clients"}
        description={activeTab === "tours"
          ? "Organisez simplement vos journées de consultations à domicile."
          : "Visualisez vos clients et leurs animaux sur une carte."}
      />

      <Card className="mb-6 inline-flex p-1.5">
        <TabButton active={activeTab === "tours"} label="Tournées" icon="tournees" onClick={() => changeTab("tours")} />
        <TabButton active={activeTab === "map"} label="Carte clients" icon="map" onClick={() => changeTab("map")} />
      </Card>

      {activeTab === "tours" ? (
        editorOpen ? (
          <TourRunEditor
            dateId={editorDateId}
            tourRun={editorData.tourRun}
            savedPlaces={editorData.savedPlaces}
            preferences={editorData.preferences}
            availableAppointments={editorData.availableAppointments}
            cabinet={editorData.cabinet}
            mapClients={mapClients}
            onClose={() => {
              setEditorOpen(false);
              router.push(pathname);
            }}
          />
        ) : (
          <ToursOverview
            tours={tours}
            zones={zones}
            appointments={appointments}
            cabinetAddress={cabinetAddress}
            selectedTourId={selectedTourId}
            onSelectTour={setSelectedTourId}
            onEditTour={setTourModal}
            onNewTour={() => setTourModal("new")}
            onOpenZonesPanel={() => setZonesPanelOpen(true)}
            onOpenEditor={() => {
              setEditorOpen(true);
              router.push(`${pathname}?date=${editorDateId}`);
            }}
            hasTourRunToday={editorData.tourRun !== null}
          />
        )
      ) : (
        <ClientsMap clients={mapClients} />
      )}

      {tourModal ? (
        <TourModal
          tour={tourModal === "new" ? undefined : tourModal}
          zones={zones}
          onClose={() => setTourModal(null)}
          onSave={saveTour}
          onZoneCreated={(zone) => setZones((current) => [...current, zone])}
          onDelete={deleteTour}
        />
      ) : null}

      {zoneModal ? (
        <ZoneModal
          zone={zoneModal === "new" ? undefined : zoneModal}
          onClose={() => setZoneModal(null)}
          onSave={saveZone}
        />
      ) : null}

      {zonesPanelOpen ? (
        <ZonesPanel
          zones={zones}
          tours={tours}
          onClose={() => setZonesPanelOpen(false)}
          onNewZone={() => setZoneModal("new")}
          onEditZone={setZoneModal}
          onDeleteZone={deleteZone}
          onReassignAndDelete={reassignAndDeleteZone}
        />
      ) : null}
    </>
  );
}

function TabButton({ active, label, icon, onClick }: { active: boolean; label: string; icon: IconName; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-extrabold transition ${active ? "bg-animeo text-white shadow-sm" : "text-animeo-muted hover:bg-animeo-soft hover:text-animeo-dark"}`}>
      <Icon name={icon} className="h-4 w-4" />
      {label}
    </button>
  );
}
