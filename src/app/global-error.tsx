"use client";

import "./globals.css";

/**
 * Dernier recours, quand la mise en page racine elle-même échoue (audit
 * 2026-10, FONC-02) : elle remplace alors tout, <html> compris. Volontairement
 * sans composant de l'application, qui pourrait être la cause de la panne.
 */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="fr">
      <body className="bg-animeo-bg text-animeo-text">
        <main className="flex min-h-screen items-center justify-center px-4 py-12">
          <div role="alert" className="w-full max-w-md text-center">
            <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-animeo">1002 Pattes</p>
            <h1 className="mt-4 text-2xl font-black text-animeo-dark">Le service est momentanément indisponible</h1>
            <p className="mt-2 text-sm leading-6 text-animeo-muted">Réessayez dans un instant. Si le problème continue, revenez dans quelques minutes.</p>
            <button type="button" onClick={() => retry()} className="mt-6 rounded-xl bg-animeo px-5 py-3 text-sm font-extrabold text-white">
              Réessayer
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
