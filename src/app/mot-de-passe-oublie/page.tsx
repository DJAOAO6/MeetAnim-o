import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { AnimeoLogo } from "@/components/brand/animeo-logo";

export const metadata: Metadata = { title: "Mot de passe oublié" };

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-animeo-bg px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <AnimeoLogo className="mx-auto" size="hero" priority />
          <p className="mt-4 text-sm font-semibold text-animeo-muted">Espace professionnel</p>
        </div>
        <ForgotPasswordForm />
      </div>
    </main>
  );
}
