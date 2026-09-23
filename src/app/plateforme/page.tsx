import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PlatformView } from "@/components/platform/platform-view";
import { InvitationsPanel } from "@/components/platform/invitations-panel";
import { getRecentInvitations } from "@/lib/platform/invitations";
import { platformAccess } from "@/lib/platform/access";
import { getPlatformOverview, getRecentAssistances } from "@/lib/platform/overview";
import { logout } from "@/lib/auth/actions";

export const metadata: Metadata = { title: "Plateforme" };
export const dynamic = "force-dynamic";

/**
 * Super-administration.
 *
 * Hors de /dashboard, qui suppose un cabinet : un compte de plateforme peut
 * n'en avoir aucun.
 */
export default async function PlatformPage() {
  const access = await platformAccess();

  if (!access.ok) {
    if (access.reason === "not-signed-in") redirect("/login");
    // Sans le rôle, cette page n'existe pas : ne pas même confirmer qu'il y
    // a quelque chose ici.
    if (access.reason === "not-platform-admin") notFound();
    return <AccessRefused reason={access.reason} />;
  }

  const [organizations, assistances, invitations] = await Promise.all([getPlatformOverview(), getRecentAssistances(), getRecentInvitations()]);

  return (
    <main className="mx-auto min-h-screen max-w-5xl bg-animeo-bg p-4 sm:p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-animeo-muted">Super-administration</p>
          <h1 className="text-2xl font-black text-animeo-dark">Espaces professionnels</h1>
          <p className="mt-1 text-sm text-animeo-muted">
            {organizations.length} espace{organizations.length > 1 ? "s" : ""} professionnel{organizations.length > 1 ? "s" : ""}. Pour voir le contenu d’un espace, assistez l’un de ses comptes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {access.user.organizationId ? (
            <Link href="/dashboard" className="rounded-xl border border-animeo-border px-3 py-2 text-sm font-extrabold text-animeo-dark hover:bg-animeo-soft">
              Mon espace
            </Link>
          ) : null}
          <form action={logout}>
            <button type="submit" className="rounded-xl border border-animeo-border px-3 py-2 text-sm font-extrabold text-animeo-dark hover:bg-animeo-soft">Se déconnecter</button>
          </form>
        </div>
      </header>

      <div className="mb-6">
        <InvitationsPanel
          invitations={invitations.map((invitation) => ({ ...invitation, createdAt: invitation.createdAt.toISOString(), expiresAt: invitation.expiresAt.toISOString() }))}
        />
      </div>

      <PlatformView
        organizations={organizations.map((organization) => ({
          ...organization,
          createdAt: organization.createdAt.toISOString(),
          accounts: organization.accounts.map((account) => ({ ...account, lastLoginAt: account.lastLoginAt?.toISOString() ?? null })),
        }))}
        assistances={assistances.map((entry) => ({ ...entry, createdAt: entry.createdAt.toISOString() }))}
      />
    </main>
  );
}

function AccessRefused({ reason }: { reason: "in-assistance" | "two-factor-required" }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center p-4">
      <div role="alert" className="w-full rounded-[18px] border border-animeo-warning-border bg-animeo-warning-soft p-6 text-animeo-dark">
        <h1 className="text-xl font-black">Super-administration indisponible</h1>
        {reason === "two-factor-required" ? (
          <p className="mt-2 text-sm">
            Ce compte ouvre les données de tous les espaces professionnels : la double authentification est obligatoire pour s’en servir. Activez-la sur votre compte, puis reconnectez-vous.
          </p>
        ) : (
          <p className="mt-2 text-sm">
            Vous êtes en train d’assister un professionnel. Terminez l’assistance, depuis le bandeau en haut de son espace, pour revenir ici.
          </p>
        )}
        <Link href="/dashboard" className="mt-4 inline-flex rounded-xl bg-animeo-dark px-4 py-2.5 text-sm font-extrabold text-white">Retour</Link>
      </div>
    </main>
  );
}
