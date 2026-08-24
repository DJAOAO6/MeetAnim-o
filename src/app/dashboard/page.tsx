import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";

const stats: Array<{
  title: string;
  value: string;
  detail: string;
  icon: IconName;
  warning?: boolean;
}> = [
  { title: "Rendez-vous aujourd’hui", value: "4", detail: "2 au cabinet · 2 à domicile", icon: "calendar" },
  { title: "Demandes en attente", value: "2", detail: "À valider avant ce soir", icon: "agenda", warning: true },
  { title: "Clients à relancer", value: "8", detail: "3 rappels ce mois-ci", icon: "clients" },
  { title: "Chiffre d’affaires du mois", value: "2 520 €", detail: "+12 % par rapport au mois dernier", icon: "euro" },
];

const appointments = [
  { time: "09:00", animal: "Luna", client: "Claire Martin", location: "Cabinet" },
  { time: "11:00", animal: "Spirit", client: "Julien Robert", location: "Domicile · Rouen" },
  { time: "14:30", animal: "Oslo", client: "Emma Leroy", location: "Domicile · Mont-Saint-Aignan" },
  { time: "17:00", animal: "Oscar", client: "Sophie Dubois", location: "Cabinet" },
];

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Tableau de bord"
        description="Bonjour Pauline, voici l’essentiel de votre activité aujourd’hui."
        action={
          <Link
            href="/dashboard/agenda"
            className="inline-flex items-center rounded-2xl bg-animeo px-5 py-3 font-extrabold text-white shadow-[0_8px_20px_rgba(79,175,159,0.2)] transition hover:-translate-y-0.5 hover:bg-[#459e90]"
          >
            <span className="mr-2 text-xl leading-none" aria-hidden="true">+</span>
            Nouveau rendez-vous
          </Link>
        }
      />

      <section aria-label="Disponibilités" className="mb-6 flex flex-wrap gap-3">
        <AvailabilityBadge label="Cabinet" />
        <AvailabilityBadge label="Domicile" />
        <p className="self-center text-sm text-animeo-muted">Les deux modes de réservation sont ouverts.</p>
      </section>

      <section aria-label="Indicateurs clés" className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => <StatCard key={stat.title} {...stat} />)}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.8fr)_minmax(280px,0.8fr)]">
        <Card className="overflow-hidden p-5 sm:p-7">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-animeo">Lundi 24 août</p>
              <h2 className="mt-1 text-xl font-extrabold text-animeo-dark sm:text-2xl">Rendez-vous du jour</h2>
            </div>
            <Link href="/dashboard/agenda" className="flex items-center gap-1 text-sm font-extrabold text-animeo transition hover:text-animeo-dark">
              Voir l’agenda
              <Icon name="arrow" className="h-4 w-4" />
            </Link>
          </div>
          <div className="divide-y divide-[#edf2f0]">
            {appointments.map((appointment) => (
              <Appointment key={`${appointment.time}-${appointment.animal}`} {...appointment} />
            ))}
          </div>
        </Card>

        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-1">
          <Card className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-bold text-animeo-muted">Rappels du mois</p>
                <p className="mt-2 text-4xl font-black text-animeo-accent">3</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fff4dd] text-[#b7791f]">
                <Icon name="bell" className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-1 text-sm text-animeo-muted">clients à contacter prochainement</p>
            <Link href="/dashboard/rappels" className="mt-5 flex w-full items-center justify-center rounded-2xl bg-[#fff4dd] px-4 py-3 text-sm font-extrabold text-[#9a671c] transition hover:bg-[#ffe9bd]">
              Voir les rappels
            </Link>
          </Card>

          <Card className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-bold text-animeo-muted">Prochaine tournée</p>
                <h2 className="mt-2 text-xl font-extrabold text-animeo-dark">Secteur Le Havre</h2>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-animeo-soft text-animeo-dark">
                <Icon name="tournees" className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-1 text-sm text-animeo-muted">Lundi · 09:00 à 18:00 · 5 rendez-vous</p>
            <Link href="/dashboard/tournees" className="mt-5 flex w-full items-center justify-center rounded-2xl bg-animeo-soft px-4 py-3 text-sm font-extrabold text-animeo-dark transition hover:bg-[#dceee9]">
              Voir la tournée
            </Link>
          </Card>
        </div>
      </div>

      <section aria-label="Statistiques du mois" className="mt-6 grid gap-4 md:grid-cols-3">
        <SmallCard title="Consultations du mois" value="28" detail="+12 % vs mois dernier" />
        <SmallCard title="Animaux vus" value="64 % chiens" detail="28 % chats · 8 % chevaux" />
        <SmallCard title="Kilomètres du mois" value="386 km" detail="Déplacements professionnels" />
      </section>
    </>
  );
}

function AvailabilityBadge({ label }: { label: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-[#cfe7e1] bg-white px-3.5 py-2 text-sm font-extrabold text-animeo-dark">
      <span className="h-2.5 w-2.5 rounded-full bg-animeo shadow-[0_0_0_4px_rgba(79,175,159,0.14)]" />
      {label} ouvert
    </div>
  );
}

function StatCard({ title, value, detail, icon, warning = false }: {
  title: string;
  value: string;
  detail: string;
  icon: IconName;
  warning?: boolean;
}) {
  return (
    <Card className="p-5">
      <div className={`mb-5 flex h-11 w-11 items-center justify-center rounded-2xl ${warning ? "bg-[#fff4dd] text-[#b7791f]" : "bg-animeo-soft text-animeo-dark"}`}>
        <Icon name={icon} className="h-5 w-5" />
      </div>
      <p className="text-sm font-bold leading-snug text-animeo-muted">{title}</p>
      <p className={`mt-2 text-3xl font-black ${warning ? "text-animeo-accent" : "text-animeo"}`}>{value}</p>
      <p className="mt-2 text-xs text-animeo-muted">{detail}</p>
    </Card>
  );
}

function Appointment({ time, animal, client, location }: {
  time: string;
  animal: string;
  client: string;
  location: string;
}) {
  const isHomeVisit = location.startsWith("Domicile");

  return (
    <div className="grid grid-cols-[55px_42px_minmax(0,1fr)] items-center gap-3 py-4 sm:grid-cols-[65px_42px_minmax(0,1fr)_auto]">
      <p className="font-extrabold text-animeo">{time}</p>
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-animeo-soft text-animeo-dark">
        <Icon name="paw" className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate font-extrabold text-animeo-dark">{animal}</p>
        <p className="truncate text-sm text-animeo-muted">{client}</p>
      </div>
      <span className={`col-start-3 w-fit rounded-full px-3 py-1.5 text-xs font-extrabold sm:col-start-auto ${isHomeVisit ? "bg-[#fff4dd] text-[#946116]" : "bg-animeo-soft text-animeo-dark"}`}>
        {location}
      </span>
    </div>
  );
}

function SmallCard({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <Card className="p-5 sm:p-6">
      <p className="text-sm font-bold text-animeo-muted">{title}</p>
      <p className="mt-3 text-2xl font-black text-animeo-dark">{value}</p>
      <p className="mt-1 text-sm text-animeo-muted">{detail}</p>
    </Card>
  );
}
