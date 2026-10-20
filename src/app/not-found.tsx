import Link from "next/link";
import { AnimeoLogo } from "@/components/brand/animeo-logo";
import { buttonBaseClassName, buttonSizeClassName, buttonVariantClassName } from "@/components/ui/button";

/**
 * « Page introuvable », aux couleurs du produit (audit 2026-10, FONC-02) :
 * l'écran technique du framework n'offrait ni logo ni chemin de retour.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-animeo-bg px-4 py-12 text-animeo-text">
      <div className="w-full max-w-md text-center">
        <AnimeoLogo className="mx-auto" size="hero" />
        <h1 className="mt-8 text-2xl font-black text-animeo-dark">Page introuvable</h1>
        <p className="mt-2 text-sm leading-6 text-animeo-muted">Cette adresse ne mène à aucune page, ou plus à aucune. Vérifiez le lien, ou repartez de l’accueil.</p>
        <Link href="/" className={`mt-6 ${buttonBaseClassName} ${buttonVariantClassName.primary} ${buttonSizeClassName.md}`}>
          Revenir à l’accueil
        </Link>
      </div>
    </main>
  );
}
