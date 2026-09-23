import type { Metadata } from "next";
import Link from "next/link";
import { SignupForm } from "@/components/auth/signup-form";
import { AnimeoLogo } from "@/components/brand/animeo-logo";
import { findInvitation } from "@/lib/platform/invitations";

// Le jeton est dans l'adresse : il ne doit pas partir vers un autre site
// dans l'en-tête Referer.
export const metadata: Metadata = { title: "Ouvrir votre espace", referrer: "no-referrer", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const refusals = {
  unknown: { title: "Lien d’invitation invalide", text: "Ce lien ne correspond à aucune invitation. Vérifiez qu’il a été copié en entier." },
  used: { title: "Invitation déjà utilisée", text: "Un espace a déjà été ouvert avec cette invitation. Connectez-vous avec l’adresse et le mot de passe choisis." },
  revoked: { title: "Invitation annulée", text: "Cette invitation a été annulée ou remplacée par une plus récente. Utilisez le dernier lien reçu, ou demandez-en un nouveau." },
  expired: { title: "Invitation expirée", text: "Ce lien n’est plus valable. Demandez une nouvelle invitation à l’équipe 1002 Pattes." },
} as const;

export default async function SignupPage({ params }: PageProps<"/inscription/[token]">) {
  const { token } = await params;
  const lookup = await findInvitation(token);

  return (
    <main className="flex min-h-screen items-center justify-center bg-animeo-bg px-4 py-12 sm:px-6">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <AnimeoLogo className="mx-auto" size="hero" priority />
          <p className="mt-4 text-sm font-semibold text-animeo-muted">Espace professionnel</p>
        </div>
        {lookup.ok ? (
          <SignupForm token={token} email={lookup.invitation.email} organizationName={lookup.invitation.organizationName} />
        ) : (
          <div role="alert" className="rounded-[18px] border border-animeo-border bg-white p-6 text-center shadow-[0_8px_30px_rgb(var(--theme-shadow-rgb)/0.05)]">
            <h1 className="text-lg font-extrabold text-animeo-dark">{refusals[lookup.reason].title}</h1>
            <p className="mt-2 text-sm text-animeo-muted">{refusals[lookup.reason].text}</p>
            {lookup.reason === "used" ? (
              <Link href="/login" className="mt-4 inline-flex rounded-[12px] bg-animeo-dark px-4 py-2.5 text-sm font-extrabold text-white">Se connecter</Link>
            ) : null}
          </div>
        )}
      </div>
    </main>
  );
}
