import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TwoFactorForm } from "@/components/auth/two-factor-form";
import { AnimeoLogo } from "@/components/brand/animeo-logo";
import { getPendingTwoFactorSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Vérification" };

export default async function TwoFactorVerificationPage() {
  const pending = await getPendingTwoFactorSession();
  if (!pending) redirect("/login");

  return (
    <main className="flex min-h-screen items-center justify-center bg-animeo-bg px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <AnimeoLogo className="mx-auto" size="hero" priority />
          <p className="mt-4 text-sm font-semibold text-animeo-muted">Espace professionnel</p>
        </div>
        <TwoFactorForm />
      </div>
    </main>
  );
}
