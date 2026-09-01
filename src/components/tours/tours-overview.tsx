import { Card } from "@/components/ui/card";
import { TourList } from "@/components/tours/tour-list";
import { TourDetail } from "@/components/tours/tour-detail";
import type { Tour, TourAppointment, Zone } from "@/data/tours";

type ToursOverviewProps = {
  tours: Tour[];
  zones: Zone[];
  appointments: Record<string, TourAppointment[]>;
  cabinetAddress: string | null;
  selectedTourId: string | null;
  onSelectTour: (id: string | null) => void;
  onEditTour: (tour: Tour) => void;
  onNewTour: () => void;
  onOpenZonesPanel: () => void;
  onOpenEditor: () => void;
  hasTourRunToday: boolean;
};

/**
 * Maître-détail : la liste des tournées reste toujours visible à gauche à
 * partir de 1024px (lg), le détail à droite — plus de bascule plein écran
 * façon TourExecution (retiré, remplacé par TourDetail). Sous 1024px, une
 * seule colonne à la fois (liste, puis détail plein écran avec retour).
 */
export function ToursOverview({ tours, zones, appointments, cabinetAddress, selectedTourId, onSelectTour, onEditTour, onNewTour, onOpenZonesPanel, onOpenEditor, hasTourRunToday }: ToursOverviewProps) {
  const selectedTour = tours.find((tour) => tour.id === selectedTourId) ?? null;

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="flex flex-col items-start gap-4 bg-animeo-dark p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-white/70">Éditeur de tournées</p>
            <h2 className="mt-1 text-xl font-medium text-white">Organisez votre journée sur la carte</h2>
            <p className="mt-1 text-sm text-white/80">Départ, arrivée, rendez-vous, itinéraire réel et optimisation — jour par jour.</p>
          </div>
          <button type="button" onClick={onOpenEditor} className="inline-flex shrink-0 items-center gap-1.5 rounded-2xl bg-white px-5 py-3 text-sm font-medium text-animeo-dark shadow-sm transition hover:-translate-y-0.5">
            {hasTourRunToday ? "Continuer ma tournée" : "+ Nouvel itinéraire"}
          </button>
        </div>
      </Card>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className={selectedTour ? "hidden lg:block" : "block"}>
          <TourList tours={tours} zones={zones} selectedTourId={selectedTourId} onSelectTour={onSelectTour} onNewTour={onNewTour} onOpenZonesPanel={onOpenZonesPanel} />
        </div>
        <div className={selectedTour ? "flex flex-1" : "hidden flex-1 lg:flex"}>
          <TourDetail
            tour={selectedTour}
            zones={zones}
            stops={selectedTour ? (appointments[selectedTour.id] ?? []) : []}
            cabinetAddress={cabinetAddress}
            onEdit={() => selectedTour && onEditTour(selectedTour)}
            onBack={() => onSelectTour(null)}
          />
        </div>
      </div>
    </div>
  );
}
