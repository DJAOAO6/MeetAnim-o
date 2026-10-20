import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { AnimeoLogo } from "@/components/brand/animeo-logo";
import { getBusinessProfile } from "@/lib/business-profile-actions";
import { dbForSlug } from "@/lib/organization";
import { RETENTION } from "@/lib/scheduler/retention";

export const dynamic = "force-dynamic";

/**
 * Le profil de l'espace désigné par le lien — comme la page de réservation
 * dont cette page dépend —, jamais « le seul espace » : il y en a plusieurs.
 */
async function loadProfile(slug: string) {
  const db = await dbForSlug(slug);
  if (!db) return null;
  const profile = await getBusinessProfile(db);
  return profile.slug === slug ? profile : null;
}

export async function generateMetadata({ params }: PageProps<"/politique-de-confidentialite/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const profile = await loadProfile(slug);
  return { title: profile ? `Politique de confidentialité — ${profile.company}` : "Politique de confidentialité" };
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="text-base font-black text-animeo-dark">{title}</h2>
      <div className="mt-1.5 space-y-1.5 text-animeo-muted">{children}</div>
    </div>
  );
}

/**
 * Ce que deviennent les informations d'un client, dit tel que le logiciel le
 * fait réellement (audit 2026-10, RGPD-04) : la version précédente affirmait
 * que seul le professionnel y avait accès, sans durée ni prestataires. Les
 * durées viennent des règles appliquées (scheduler/retention.ts).
 *
 * Texte à faire valider par un juriste avant d'ouvrir à des professionnels
 * extérieurs.
 */
export default async function PrivacyPolicyPage({ params }: PageProps<"/politique-de-confidentialite/[slug]">) {
  const { slug } = await params;
  const profile = await loadProfile(slug);
  if (!profile) notFound();
  const name = `${profile.firstName} ${profile.lastName}`.trim();

  return (
    <main className="min-h-screen bg-animeo-surface-alt text-animeo-dark">
      <header className="border-b border-animeo-border bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <AnimeoLogo size="footer" />
        </div>
      </header>
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <section className="rounded-[18px] border border-animeo-border bg-white p-6 shadow-[0_14px_45px_rgb(var(--theme-shadow-rgb)/0.08)] sm:p-8">
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-animeo">Confidentialité</p>
          <h1 className="mt-2 text-2xl font-black leading-tight text-animeo-dark sm:text-3xl">Politique de confidentialité</h1>
          <p className="mt-2 text-sm leading-6 text-animeo-muted">
            Cette page explique ce que deviennent les informations que vous transmettez à {profile.company} ({name}), en prenant rendez-vous en ligne ou lors de vos consultations.
          </p>

          <div className="mt-6 space-y-6 text-sm leading-6 text-animeo-dark">
            <Section title="Responsable du traitement">
              <p>
                {name} — {profile.profession}, {profile.company}. Contact&nbsp;: {profile.email}
                {profile.phone ? <> · {profile.phone}</> : null}.
              </p>
              <p>Le logiciel 1002 Pattes, qui héberge et traite ces informations pour le compte de {name}, agit en tant que sous-traitant.</p>
            </Section>

            <Section title="Informations concernées">
              <ul className="list-disc space-y-1 pl-5">
                <li>Votre identité et vos coordonnées : nom, prénom, téléphone, e-mail, adresse postale.</li>
                <li>Pour les consultations à domicile : l’adresse et sa position sur la carte, pour organiser les tournées.</li>
                <li>Votre animal : nom, espèce, race, date de naissance, et les informations de suivi recueillies lors des consultations (antécédents, soins, comptes rendus).</li>
                <li>Vos rendez-vous : dates, prestations, tarifs, notes.</li>
                <li>Lors d’une demande en ligne, l’adresse IP de votre connexion, pour la sécurité du service.</li>
              </ul>
            </Section>

            <Section title="À quoi elles servent">
              <ul className="list-disc space-y-1 pl-5">
                <li>Traiter votre demande de rendez-vous et vous répondre.</li>
                <li>Assurer le suivi des soins de votre animal.</li>
                <li>Vous rappeler un rendez-vous la veille ou l’avant-veille, et vous proposer de revenir quand un suivi est prévu.</li>
                <li>Organiser les déplacements pour les consultations à domicile.</li>
                <li>Protéger le service contre les abus (limites de demandes, journal de sécurité).</li>
              </ul>
              <p>Ces traitements sont nécessaires pour répondre à votre demande et assurer le suivi que vous sollicitez.</p>
            </Section>

            <Section title="Qui y a accès">
              <ul className="list-disc space-y-1 pl-5">
                <li>{name} et, le cas échéant, les membres de son cabinet (praticiens, secrétariat).</li>
                <li>L’équipe du logiciel 1002 Pattes, uniquement pour l’assistance technique, et en en gardant la trace.</li>
                <li>Les prestataires techniques du logiciel : l’hébergeur des serveurs ; Mailjet, pour l’envoi des e-mails ; l’IGN (Géoplateforme, service public français), pour rechercher et situer les adresses ; HeiGIT (openrouteservice, Allemagne), qui reçoit les positions des arrêts d’une tournée, sans nom.</li>
                <li>Google Agenda, si {name} y a relié son agenda : vos rendez-vous y sont recopiés.</li>
                <li>En affichant la page de réservation, votre navigateur charge des fonds de carte (OpenStreetMap) et, parfois, des photos d’illustration (Unsplash) : ces services reçoivent alors votre adresse IP.</li>
              </ul>
              <p>Vos informations ne sont ni vendues ni cédées à des fins commerciales.</p>
            </Section>

            <Section title="Combien de temps">
              <ul className="list-disc space-y-1 pl-5">
                <li>Tant que vous êtes client. Après {RETENTION.inactiveClientYears} ans sans rendez-vous, votre fiche est signalée à {name}, qui l’archive ou la supprime.</li>
                <li>Une demande en ligne qui n’a jamais abouti est effacée {Math.round(RETENTION.unacceptedRequestDays / 30)} mois après.</li>
                <li>Le journal de sécurité est conservé {Math.round(RETENTION.auditLogDays / 30)} mois.</li>
                <li>Quand votre fiche est supprimée, l’historique des rendez-vous ne garde plus ni votre nom ni votre adresse ; les comptes rendus de soins peuvent être conservés par le cabinet.</li>
              </ul>
            </Section>

            <Section title="Vos droits">
              <p>
                Vous pouvez demander à accéder à vos informations et à en recevoir une copie, à les faire corriger ou effacer, à limiter leur utilisation ou vous y opposer, notamment aux rappels et propositions de rendez-vous. Pour cela, écrivez à {name} : {profile.email}.
              </p>
              <p>
                Si vous estimez que vos droits ne sont pas respectés, vous pouvez adresser une réclamation à la CNIL (www.cnil.fr).
              </p>
            </Section>
          </div>
        </section>
      </div>
    </main>
  );
}
