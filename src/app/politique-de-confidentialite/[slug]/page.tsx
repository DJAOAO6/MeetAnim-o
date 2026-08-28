import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AnimeoLogo } from "@/components/brand/animeo-logo";
import { getBusinessProfile } from "@/lib/business-profile-actions";

export const dynamic = "force-dynamic";

async function loadProfile(slug: string) {
  const profile = await getBusinessProfile();
  if (profile.slug !== slug) return null;
  return profile;
}

export async function generateMetadata({ params }: PageProps<"/politique-de-confidentialite/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const profile = await loadProfile(slug);
  return { title: profile ? `Politique de confidentialité — ${profile.company}` : "Politique de confidentialité" };
}

export default async function PrivacyPolicyPage({ params }: PageProps<"/politique-de-confidentialite/[slug]">) {
  const { slug } = await params;
  const profile = await loadProfile(slug);
  if (!profile) notFound();

  return (
    <main className="min-h-screen bg-[#f4f9f7] text-animeo-dark">
      <header className="border-b border-[#dfe9e6] bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <AnimeoLogo size="footer" />
        </div>
      </header>
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <section className="rounded-[18px] border border-[#dfe9e6] bg-white p-6 shadow-[0_14px_45px_rgba(24,59,69,0.08)] sm:p-8">
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-animeo">Confidentialité</p>
          <h1 className="mt-2 text-2xl font-black leading-tight text-animeo-dark sm:text-3xl">Politique de confidentialité</h1>
          <p className="mt-2 text-sm leading-6 text-animeo-muted">
            Cette page décrit l’usage des informations transmises via le formulaire de prise de rendez-vous en ligne de {profile.company} ({profile.firstName} {profile.lastName}).
          </p>

          <div className="mt-6 space-y-6 text-sm leading-6 text-animeo-dark">
            <div>
              <h2 className="text-base font-black text-animeo-dark">Responsable du traitement</h2>
              <p className="mt-1.5 text-animeo-muted">
                {profile.firstName} {profile.lastName} — {profile.profession}, {profile.company}. Contact&nbsp;: {profile.email}
                {profile.phone ? <> · {profile.phone}</> : null}.
              </p>
            </div>

            <div>
              <h2 className="text-base font-black text-animeo-dark">Données collectées</h2>
              <p className="mt-1.5 text-animeo-muted">Lors d’une demande de rendez-vous, sont collectées&nbsp;:</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-animeo-muted">
                <li>Votre identité et vos coordonnées (nom, prénom, téléphone, email)</li>
                <li>Votre adresse, uniquement pour les consultations à domicile</li>
                <li>Des informations sur votre animal (nom, espèce, race, date de naissance, motif de consultation)</li>
              </ul>
            </div>

            <div>
              <h2 className="text-base font-black text-animeo-dark">Finalité et durée de conservation</h2>
              <p className="mt-1.5 text-animeo-muted">
                Ces informations sont utilisées exclusivement pour traiter votre demande de rendez-vous et assurer le suivi de la consultation. Elles sont conservées le temps nécessaire à cette relation professionnelle, puis supprimées à votre demande.
              </p>
            </div>

            <div>
              <h2 className="text-base font-black text-animeo-dark">Destinataires</h2>
              <p className="mt-1.5 text-animeo-muted">
                Vos données ne sont accessibles qu’à {profile.firstName} {profile.lastName} et ne sont ni vendues ni transmises à des tiers à des fins commerciales. Pour la recherche d’adresse (consultations à domicile), la saisie est transmise à l’API Adresse de l’IGN (Géoplateforme), un service public français, uniquement pour suggérer des adresses.
              </p>
            </div>

            <div>
              <h2 className="text-base font-black text-animeo-dark">Vos droits</h2>
              <p className="mt-1.5 text-animeo-muted">
                Conformément au RGPD, vous disposez d’un droit d’accès, de rectification et de suppression de vos données. Pour l’exercer, contactez {profile.firstName} directement à {profile.email}.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
