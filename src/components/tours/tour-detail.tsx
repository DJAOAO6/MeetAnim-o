import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { SimulatedMap } from "@/components/tours/simulated-map";
import type { Tour, TourAppointment, Zone } from "@/data/tours";

type TourDetailProps = {
  tour: Tour;
  zone?: Zone;
  appointments: TourAppointment[];
  onBack: () => void;
  onRoute: () => void;
};

export function TourDetail({ tour, zone, appointments, onBack, onRoute }: TourDetailProps) {
  const points = appointments.map((appointment, index) => ({
    id: appointment.id,
    x: appointment.position.x,
    y: appointment.position.y,
    label: `${index + 1}`,
    title: `${appointment.time} · ${appointment.animalName} · ${appointment.city}`,
    accent: "purple" as const,
  }));

  return (
    <div className="space-y-6">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm font-extrabold text-animeo-muted transition hover:text-animeo">
        <Icon name="arrow" className="h-4 w-4 rotate-180" />
        Retour aux tournées
      </button>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-5 bg-gradient-to-r from-animeo-soft to-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-animeo">Journée à domicile</p>
            <h2 className="mt-1 text-3xl font-black text-animeo-dark">{tour.name}</h2>
            <p className="mt-2 font-bold text-animeo-muted">{tour.dateLabel} · {tour.startTime} - {tour.endTime}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {zone?.cities.map((city) => <span key={city.id} className="rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-animeo-dark shadow-sm">{city.name}</span>)}
            </div>
          </div>
          <button type="button" onClick={onRoute} className="inline-flex items-center justify-center rounded-xl bg-animeo px-5 py-3 text-sm font-extrabold text-white transition hover:bg-[#459e90]">
            <Icon name="tournees" className="mr-2 h-5 w-5" />
            Voir l’itinéraire
          </button>
        </div>
        <div className="grid divide-y divide-[#e5eeeb] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <TourMetric value={`${tour.appointmentCount}`} label="rendez-vous" />
          <TourMetric value={`${tour.estimatedKm} km`} label="estimés" />
          <TourMetric value={tour.consultationHours} label="de consultations" />
        </div>
      </Card>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(340px,0.75fr)_minmax(0,1.25fr)]">
        <Card className="overflow-hidden">
          <div className="border-b border-[#e5eeeb] px-5 py-4">
            <h3 className="font-extrabold text-animeo-dark">Rendez-vous de la journée</h3>
            <p className="mt-0.5 text-xs text-animeo-muted">Ordre prévu, sans calcul de trajet réel</p>
          </div>
          {appointments.length > 0 ? (
            <div className="divide-y divide-[#edf2f0]">
              {appointments.map((appointment, index) => (
                <article key={appointment.id} className="flex gap-4 p-5">
                  <div className="flex flex-col items-center">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#eeeaf8] text-xs font-black text-[#6c5598]">{index + 1}</span>
                    {index < appointments.length - 1 ? <span className="mt-2 h-full w-px bg-[#e2e8e6]" /> : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-black text-animeo-dark">{appointment.time}</p>
                        <h4 className="mt-1 font-extrabold text-animeo-dark">{appointment.animalName}</h4>
                      </div>
                      <span className="rounded-full bg-animeo-soft px-2.5 py-1 text-[10px] font-black text-animeo-dark">Domicile</span>
                    </div>
                    <p className="mt-1 text-sm font-bold text-animeo-muted">{appointment.service}</p>
                    <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-animeo-muted"><Icon name="map" className="h-3.5 w-3.5 text-animeo" />{appointment.city} · {appointment.clientName}</p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-sm font-semibold text-animeo-muted">Aucun rendez-vous prévu dans cette tournée.</div>
          )}
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-extrabold text-animeo-dark">Aperçu de la journée</h3>
              <p className="mt-0.5 text-xs text-animeo-muted">Positions fictives des rendez-vous</p>
            </div>
            <span className="rounded-full bg-[#eeeaf8] px-3 py-1 text-[10px] font-black text-[#6c5598]">Simulation</span>
          </div>
          <SimulatedMap points={points} heightClassName="h-[520px]" />
        </Card>
      </div>
    </div>
  );
}

function TourMetric({ value, label }: { value: string; label: string }) {
  return <div className="p-5 text-center"><p className="text-2xl font-black text-animeo-dark">{value}</p><p className="mt-1 text-xs font-bold text-animeo-muted">{label}</p></div>;
}
