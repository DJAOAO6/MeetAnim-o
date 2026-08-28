import { Icon } from "@/components/ui/icon";

const steps = ["Consultation", "Rendez-vous", "Vous & votre animal", "Confirmation"];

export function BookingProgress({ current }: { current: number }) {
  const percent = ((current - 1) / (steps.length - 1)) * 100;

  return (
    <div className="mb-6 sm:mb-8">
      <div className="mb-3 flex items-center justify-between text-xs font-extrabold text-animeo-muted sm:hidden">
        <span>Étape {current} sur {steps.length}</span>
        <span>{steps[current - 1]}</span>
      </div>

      <div
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={1}
        aria-valuemax={steps.length}
        aria-label={`Étape ${current} sur ${steps.length} : ${steps[current - 1]}`}
        className="relative"
      >
        <div className="h-1.5 rounded-full bg-[#dfe8e5]">
          {/* scaleX plutôt que width : la largeur anime la mise en page
              (layout), le scale anime seulement le rendu (compositing) — voir
              web-design-guidelines, "animate transform/opacity only". */}
          <div className="h-full origin-left rounded-full bg-animeo transition-transform duration-[280ms] ease-out" style={{ transform: `scaleX(${percent / 100})` }} />
        </div>
        <div
          aria-hidden="true"
          // left+translate (pas juste transform) : le décalage dépend de la
          // largeur du conteneur parent, que translate() seul ne peut pas
          // référencer (ses pourcentages sont relatifs à l'élément
          // lui-même) — technique standard pour un indicateur positionné en
          // pourcentage (ex. curseur de slider), pas un oubli.
          className="absolute top-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-animeo text-white shadow-[0_2px_6px_rgba(24,59,69,0.25)] transition-[left] duration-[280ms] ease-out"
          // Le centre du point (24px, donc 12px de rayon) est contraint entre
          // 12px et calc(100% - 12px) plutôt que placé directement à
          // {percent}% : sinon la moitié du point déborde du conteneur à 0 %
          // et à 100 % (le conteneur n'a pas de marge interne compensatoire).
          style={{ left: `calc(12px + (100% - 24px) * ${percent} / 100)` }}
        >
          <Icon name="paw" className="h-3.5 w-3.5" />
        </div>
      </div>

      <div className="mt-4 hidden grid-cols-4 gap-2 sm:grid">
        {steps.map((step, index) => {
          const number = index + 1;
          return (
            <p key={step} className={`truncate text-center text-xs font-extrabold ${number === current ? "text-animeo-dark" : "text-animeo-muted"}`}>{step}</p>
          );
        })}
      </div>
    </div>
  );
}
