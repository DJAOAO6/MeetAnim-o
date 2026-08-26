import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { AnimeoLogo } from "@/components/brand/animeo-logo";

export const metadata: Metadata = { title: "Nouveau mot de passe" };

type ResetPasswordPageProps = {
  searchParams: Promise<{ token?: string }>;
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const { token } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-animeo-bg px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <AnimeoLogo className="mx-auto" size="hero" priority />
          <p className="mt-4 text-sm font-semibold text-animeo-muted">Espace professionnel</p>
        </div>
        {token ? <ResetPasswordForm token={token} /> : (
          <p className="rounded-[18px] border border-[#dfe9e6] bg-white p-6 text-center text-sm font-bold text-animeo-error shadow-[0_8px_30px_rgba(24,59,69,0.05)]">
            Lien de réinitialisation invalide.
          </p>
        )}
      </div>
    </main>
  );
}
