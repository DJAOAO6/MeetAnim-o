/**
 * Écran d'attente du tableau de bord.
 *
 * La page est rendue dynamiquement à chaque visite (données live en base) :
 * sans cet écran, le passage d'une page à l'autre laissait un blanc, puis
 * tout arrivait d'un coup. Les blocs sont ici aux **mêmes largeurs** que les
 * vrais — c'est la seule façon d'éviter que la page ne saute au moment où les
 * données arrivent.
 *
 * Aucune animation de squelette sur le contenu textuel : une seule pulsation
 * douce sur l'ensemble, plus reposante qu'une dizaine de barres clignotant
 * chacune de son côté.
 */
function Block({ className = "", height }: { className?: string; height: string }) {
  return (
    <div
      className={`rounded-[var(--theme-card-radius,18px)] border border-animeo-border bg-white ${className}`}
      style={{ height }}
    />
  );
}

export default function DashboardLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="animate-pulse">
      <span className="sr-only">Chargement de votre tableau de bord…</span>

      <div className="mb-[var(--dashboard-gap)]">
        <Block height="168px" className="rounded-[calc(var(--theme-card-radius)+6px)]" />
      </div>

      <div className="grid grid-cols-1 gap-[var(--dashboard-gap)] md:grid-cols-12">
        <Block height="195px" className="md:col-span-12 lg:col-span-6" />
        <Block height="195px" className="md:col-span-12 lg:col-span-6" />

        <div className="grid grid-cols-2 gap-[var(--dashboard-gap)] sm:grid-cols-3 md:col-span-12 xl:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => <Block key={index} height="150px" />)}
        </div>

        <Block height="260px" className="md:col-span-12" />
        <Block height="300px" className="md:col-span-12 xl:col-span-8" />
        <Block height="300px" className="md:col-span-12 lg:col-span-6 xl:col-span-4" />
        <Block height="260px" className="md:col-span-12 lg:col-span-6 xl:col-span-4" />
        <Block height="260px" className="md:col-span-12 lg:col-span-6 xl:col-span-4" />
        <Block height="260px" className="md:col-span-12 lg:col-span-6 xl:col-span-4" />
      </div>
    </div>
  );
}
