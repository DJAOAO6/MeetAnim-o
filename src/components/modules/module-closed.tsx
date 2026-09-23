import Link from "next/link";
import { Card } from "@/components/ui/card";
import { MODULES, moduleClosedMessage, type ModuleKey } from "@/lib/modules";

/**
 * Ce que voit un espace qui atteint une page de module qu'il n'a pas —
 * lien recopié, favori, module retiré entre-temps. Pas une erreur : une
 * explication, et le chemin du retour.
 */
export function ModuleClosed({ moduleKey }: { moduleKey: ModuleKey }) {
  return (
    <Card className="mx-auto mt-6 max-w-xl p-6 sm:p-8">
      <h1 className="text-xl font-black text-animeo-dark">{MODULES[moduleKey].label}</h1>
      <p className="mt-2 text-sm text-animeo-muted">{moduleClosedMessage(moduleKey)}</p>
      <Link href="/dashboard" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-animeo px-5 py-2.5 text-sm font-extrabold text-white hover:bg-animeo-hover">Retour au tableau de bord</Link>
    </Card>
  );
}
