"use client";

import { useState } from "react";
import { ClientsMap } from "@/components/tours/clients-map";
import { TourDetail } from "@/components/tours/tour-detail";
import { TourModal, type TourFormValue } from "@/components/tours/tour-modal";
import { ToursOverview } from "@/components/tours/tours-overview";
import { ZoneModal, type ZoneFormValue } from "@/components/tours/zone-modal";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
import { notify } from "@/lib/notify";
import type { MapClient, Tour, TourAppointment, Zone } from "@/data/tours";

type ToursViewProps = {
  initialTab: "tours" | "map";
  initialTours: Tour[];
  initialZones: Zone[];
  appointments: Record<string, TourAppointment[]>;
  mapClients: MapClient[];
};

const stats: Array<{ label: string; value: string; icon: IconName; color: string; background: string }> = [
  { label: "Tournées actives", value: "3", icon: "tournees", color: "text-animeo", background: "bg-animeo-soft" },
  { label: "RDV domicile cette semaine", value: "8", icon: "agenda", color: "text-animeo-dark", background: "bg-[#e8f1f4]" },
  { label: "Kilomètres estimés", value: "186 km", icon: "map", color: "text-[#b7791f]", background: "bg-[#fff4dd]" },
  { label: "Zones desservies", value: "4", icon: "map", color: "text-[#8067b0]", background: "bg-[#eeeaf8]" },
];

export function ToursView({ initialTab, initialTours, initialZones, appointments, mapClients }: ToursViewProps) {
  const [activeTab, setActiveTab] = useState<"tours" | "map">(initialTab);
  const [tours, setTours] = useState(initialTours);
  const [zones, setZones] = useState(initialZones);
  const [selectedTourId, setSelectedTourId] = useState<string | null>(null);
  const [tourModal, setTourModal] = useState<Tour | "new" | null>(null);
  const [zoneModal, setZoneModal] = useState<Zone | "new" | null>(null);
  const selectedTour = tours.find((tour) => tour.id === selectedTourId);

  function saveTour(value: TourFormValue) {
    if (value.id) {
      setTours((current) => current.map((tour) => (
        tour.id === value.id ? { ...tour, ...value } : tour
      )));
      notify.success(`${value.name} a été modifiée localement.`);
    } else {
      const newTour: Tour = {
        ...value,
        id: `tour-${Date.now()}`,
        dateLabel: `${value.day} · prochaine occurrence`,
        appointmentCount: 0,
        estimatedKm: 0,
        consultationHours: "0h",
      };
      setTours((current) => [newTour, ...current]);
      notify.success(`${value.name} a été créée localement.`);
    }
    setTourModal(null);
  }

  function toggleTourStatus(tour: Tour) {
    const nextStatus = tour.status === "Active" ? "Inactive" : "Active";
    setTours((current) => current.map((item) => (
      item.id === tour.id ? { ...item, status: nextStatus } : item
    )));
    notify.success(`${tour.name} est maintenant ${nextStatus.toLocaleLowerCase("fr-FR")}.`);
  }

  function saveZone(value: ZoneFormValue) {
    if (value.id) {
      const updatedZone: Zone = { ...value, id: value.id };
      setZones((current) => current.map((zone) => zone.id === value.id ? updatedZone : zone));
      notify.success(`${value.name} a été modifiée localement.`);
    } else {
      setZones((current) => [{ ...value, id: `zone-${Date.now()}` }, ...current]);
      notify.success(`${value.name} a été créée localement.`);
    }
    setZoneModal(null);
  }

  function deleteZone(zone: Zone) {
    if (tours.some((tour) => tour.zoneId === zone.id)) {
      notify.error(`${zone.name} est utilisée par une tournée et ne peut pas être supprimée.`);
      return;
    }
    setZones((current) => current.filter((item) => item.id !== zone.id));
    notify.success(`${zone.name} a été supprimée localement.`);
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
        action={activeTab === "tours" ? (
          <button type="button" onClick={() => setTourModal("new")} className="inline-flex items-center rounded-2xl bg-animeo px-5 py-3 font-extrabold text-white shadow-[0_8px_20px_rgba(79,175,159,0.2)] transition hover:-translate-y-0.5 hover:bg-[#459e90]">
            <span aria-hidden="true" className="mr-2 text-xl leading-none">+</span>
            Créer une tournée
          </button>
        ) : undefined}
      />

      <Card className="mb-6 inline-flex p-1.5">
        <TabButton active={activeTab === "tours"} label="Tournées" icon="tournees" onClick={() => changeTab("tours")} />
        <TabButton active={activeTab === "map"} label="Carte clients" icon="map" onClick={() => changeTab("map")} />
      </Card>

      {activeTab === "tours" ? (
        <>
          {!selectedTour ? (
            <section aria-label="Statistiques des tournées" className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {stats.map((item) => (
                <Card key={item.label} className="flex items-center gap-4 p-5">
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${item.background} ${item.color}`}>
                    <Icon name={item.icon} className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-animeo-muted">{item.label}</p>
                    <p className={`mt-1 text-2xl font-black ${item.color}`}>{item.value}</p>
                  </div>
                </Card>
              ))}
            </section>
          ) : null}

          {selectedTour ? (
            <TourDetail
              tour={selectedTour}
              zone={zones.find((zone) => zone.id === selectedTour.zoneId)}
              appointments={appointments[selectedTour.id] ?? []}
              onBack={() => setSelectedTourId(null)}
              onRoute={() => notify.info("L’itinéraire est une simulation locale : aucun trajet réel n’a été calculé.")}
            />
          ) : (
            <ToursOverview
              tours={tours}
              zones={zones}
              onViewTour={(tour) => setSelectedTourId(tour.id)}
              onEditTour={setTourModal}
              onToggleTour={toggleTourStatus}
              onNewZone={() => setZoneModal("new")}
              onEditZone={setZoneModal}
              onDeleteZone={deleteZone}
            />
          )}
        </>
      ) : (
        <ClientsMap clients={mapClients} />
      )}

      {tourModal ? (
        <TourModal
          tour={tourModal === "new" ? undefined : tourModal}
          zones={zones}
          onClose={() => setTourModal(null)}
          onSave={saveTour}
          onCreateZone={() => setZoneModal("new")}
        />
      ) : null}

      {zoneModal ? (
        <ZoneModal
          zone={zoneModal === "new" ? undefined : zoneModal}
          onClose={() => setZoneModal(null)}
          onSave={saveZone}
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
