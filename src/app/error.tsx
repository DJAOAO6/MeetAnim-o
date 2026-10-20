"use client";

import Link from "next/link";
import { AnimeoLogo } from "@/components/brand/animeo-logo";
import { Button, buttonBaseClassName, buttonSizeClassName, buttonVariantClassName } from "@/components/ui/button";

/**
 * Une page qui plante, aux couleurs du produit (audit 2026-10, FONC-02).
 * Rien de l'erreur n'est montré : en production, le framework n'en transmet
 * de toute façon qu'un message générique ; le détail reste au journal du
 * serveur.
 */
export default function Error({ retry }: { error: unknown; retry: () => void }) {
  return (
    <main className="flex min-h-[60vh] items-center justify-center bg-animeo-bg px-4 py-12 text-animeo-text">
      <div role="alert" className="w-full max-w-md text-center">
        <AnimeoLogo className="mx-auto" size="footer" />
        <h1 className="mt-6 text-2xl font-black text-animeo-dark">Un problème est survenu</h1>
        <p className="mt-2 text-sm leading-6 text-animeo-muted">Cette page n’a pas pu s’afficher. Réessayez ; si le problème continue, revenez dans quelques minutes.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button type="button" onClick={() => retry()}>Réessayer</Button>
          <Link href="/" className={`${buttonBaseClassName} ${buttonVariantClassName.secondary} ${buttonSizeClassName.md}`}>Revenir à l’accueil</Link>
        </div>
      </div>
    </main>
  );
}
