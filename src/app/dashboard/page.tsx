import Link from "next/link";
import { AppointmentStatCards, DashboardAgendaOverview, NewAppointmentButton } from "@/components/appointments/dashboard-agenda-overview";
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
  { title: "Clients à relancer", value: "8", detail: "3 rappels ce mois-ci", icon: "clients" },
  { title: "Chiffre d’affaires du mois", value: "2 520 €", detail: "+12 % par rapport au mois dernier", icon: "euro" },
];

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Tableau de bord"
        description="Bonjour Pauline, voici l’essentiel de votre activité aujourd’hui."
        action={<NewAppointmentButton />}
      />

      <section aria-label="Disponibilités" className="mb-6 flex flex-wrap gap-3">
        <AvailabilityBadge label="Cabinet" />
        <AvailabilityBadge label="Domicile" />
        <p className="self-center text-sm text-animeo-muted">Les deux modes de réservation sont ouverts.</p>
      </section>

      <section aria-label="Vue d’ensemble" className="mb-6">
        <div className="mb-4">
          <h2 className="text-xl font-black text-animeo-dark">Vue d’ensemble</h2>
          <p className="mt-1 text-sm text-animeo-muted">Tous vos indicateurs importants sont regroupés ici.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AppointmentStatCards />
          {stats.map((stat) => <StatCard key={stat.title} {...stat} />)}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <SmallCard title="Consultations du mois" value="28" detail="+12 % vs mois dernier" />
          <SmallCard title="Animaux vus" value="64 % chiens" detail="28 % chats · 8 % chevaux" />
          <SmallCard title="Kilomètres du mois" value="386 km" detail="Déplacements professionnels" />
        </div>
      </section>

      <DashboardAgendaOverview />

      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
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

          <Card className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-bold text-animeo-muted">Prestations</p>
                <h2 className="mt-2 text-xl font-extrabold text-animeo-dark">3 prestations actives</h2>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-animeo-soft text-animeo-dark">
                <Icon name="services" className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-1 text-sm text-animeo-muted">Tarifs Cabinet, Domicile et déplacements</p>
            <Link href="/dashboard/prestations" className="mt-5 flex w-full items-center justify-center rounded-2xl bg-animeo-soft px-4 py-3 text-sm font-extrabold text-animeo-dark transition hover:bg-[#dceee9]">
              Gérer les prestations
            </Link>
          </Card>
      </div>

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

function SmallCard({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <Card className="p-5 sm:p-6">
      <p className="text-sm font-bold text-animeo-muted">{title}</p>
      <p className="mt-3 text-2xl font-black text-animeo-dark">{value}</p>
      <p className="mt-1 text-sm text-animeo-muted">{detail}</p>
    </Card>
  );
}
