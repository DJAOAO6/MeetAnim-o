import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import type { Tour, Zone } from "@/data/tours";

type ToursOverviewProps = {
  tours: Tour[];
  zones: Zone[];
  onViewTour: (tour: Tour) => void;
  onEditTour: (tour: Tour) => void;
  onToggleTour: (tour: Tour) => void;
  onNewZone: () => void;
  onEditZone: (zone: Zone) => void;
  onDeleteZone: (zone: Zone) => void;
};

export function ToursOverview({ tours, zones, onViewTour, onEditTour, onToggleTour, onNewZone, onEditZone, onDeleteZone }: ToursOverviewProps) {
  return (
    <div className="space-y-8">
      <section>
        <div className="mb-4">
          <h2 className="text-xl font-extrabold text-animeo-dark">Vos tournées</h2>
          <p className="mt-1 text-sm text-animeo-muted">Chaque tournée associe un jour, des horaires et une zone.</p>
        </div>
        <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
          {tours.map((tour) => (
            <TourCard
              key={tour.id}
              tour={tour}
              zone={zones.find((item) => item.id === tour.zoneId)}
              onView={() => onViewTour(tour)}
              onEdit={() => onEditTour(tour)}
              onToggle={() => onToggleTour(tour)}
            />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-extrabold text-animeo-dark">Gestion des zones</h2>
            <p className="mt-1 text-sm text-animeo-muted">Une zone regroupe uniquement des villes et leurs codes postaux.</p>
          </div>
          <button type="button" onClick={onNewZone} className="inline-flex items-center justify-center rounded-xl border border-animeo px-4 py-2.5 text-sm font-extrabold text-animeo transition hover:bg-animeo-soft">+ Nouvelle zone</button>
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {zones.map((zone) => (
            <ZoneCard key={zone.id} zone={zone} onEdit={() => onEditZone(zone)} onDelete={() => onDeleteZone(zone)} />
          ))}
        </div>
        <div className="mt-4 rounded-2xl border border-[#f1d89f] bg-[#fff9ec] px-4 py-3 text-xs font-semibold leading-relaxed text-[#8c6118]">
          V1 : les zones utilisent seulement les villes et codes postaux. Aucun rayon kilométrique ni dessin sur la carte n’est calculé.
        </div>
      </section>
    </div>
  );
}

function TourCard({ tour, zone, onView, onEdit, onToggle }: { tour: Tour; zone?: Zone; onView: () => void; onEdit: () => void; onToggle: () => void }) {
  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <div className={`h-1.5 ${tour.status === "Active" ? "bg-animeo" : "bg-[#aeb8bb]"}`} />
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-animeo">{tour.recurrence}</p>
            <h3 className="mt-2 text-xl font-black text-animeo-dark">{tour.name}</h3>
            <p className="mt-1 text-sm font-bold text-animeo-muted">{tour.day} · {tour.startTime} - {tour.endTime}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-[10px] font-black ${tour.status === "Active" ? "bg-[#e4f5ef] text-[#267668]" : "bg-[#f0f2f2] text-[#6f7b7f]"}`}>{tour.status}</span>
        </div>

        <div className="mt-5 rounded-2xl bg-animeo-bg p-4">
          <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.1em] text-animeo-muted">
            <Icon name="map" className="h-4 w-4 text-animeo" />
            {zone?.name ?? "Zone non définie"}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {zone?.cities.map((city) => <span key={city.id} className="rounded-lg bg-white px-2 py-1 text-[10px] font-bold text-animeo-dark">{city.name}</span>)}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between text-sm">
          <span className="font-bold text-animeo-muted">Rendez-vous prévus</span>
          <span className="text-xl font-black text-animeo-dark">{tour.appointmentCount}</span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 border-t border-[#e5eeeb] pt-4">
          <button type="button" onClick={onView} className="col-span-2 rounded-xl bg-animeo px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-[#459e90]">Voir la journée</button>
          <button type="button" onClick={onEdit} className="rounded-xl bg-animeo-soft px-3 py-2.5 text-xs font-extrabold text-animeo-dark transition hover:bg-[#dceee9]">Modifier</button>
          <button type="button" onClick={onToggle} className="rounded-xl bg-animeo-bg px-3 py-2.5 text-xs font-extrabold text-animeo-muted transition hover:text-animeo-dark">{tour.status === "Active" ? "Désactiver" : "Activer"}</button>
        </div>
      </div>
    </Card>
  );
}

function ZoneCard({ zone, onEdit, onDelete }: { zone: Zone; onEdit: () => void; onDelete: () => void }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-animeo-soft text-animeo-dark"><Icon name="map" className="h-5 w-5" /></div>
        <span className="rounded-full bg-animeo-bg px-2.5 py-1 text-[10px] font-black text-animeo-muted">{zone.cities.length} ville{zone.cities.length > 1 ? "s" : ""}</span>
      </div>
      <h3 className="mt-4 font-black text-animeo-dark">{zone.name}</h3>
      <ul className="mt-3 space-y-2">
        {zone.cities.map((city) => (
          <li key={city.id} className="flex items-center justify-between gap-3 text-xs">
            <span className="font-bold text-animeo-dark">{city.name}</span>
            <span className="text-animeo-muted">{city.postalCode}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex gap-2 border-t border-[#e5eeeb] pt-4">
        <button type="button" onClick={onEdit} className="flex-1 rounded-xl bg-animeo-soft px-3 py-2 text-xs font-extrabold text-animeo-dark transition hover:bg-[#dceee9]">Modifier</button>
        <button type="button" onClick={onDelete} className="flex-1 rounded-xl bg-[#fff1ec] px-3 py-2 text-xs font-extrabold text-[#a9573b] transition hover:bg-[#ffe7de]">Supprimer</button>
      </div>
    </Card>
  );
}
