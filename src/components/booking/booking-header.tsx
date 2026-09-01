import Image from "next/image";
import { Card } from "@/components/ui/card";
import type { PublicProfessional } from "@/data/public-booking";

function isImageValue(value: string): boolean {
  return value.startsWith("data:image") || value.startsWith("http://") || value.startsWith("https://");
}

/**
 * Badges dynamiques uniquement — jamais un badge pour un mode/une donnée
 * absente (spec refonte page publique §4 : "si cabinet est désactivé, ne
 * pas afficher Cabinet"). Les animaux viennent des vraies prestations
 * actives, jamais d'une liste figée.
 */
function computeBadges(professional: PublicProfessional): { modeBadges: string[]; animalBadges: string[] } {
  const modeBadges: string[] = [];
  if (professional.cabinetAvailable) modeBadges.push("Cabinet");
  if (professional.homeAvailable) modeBadges.push("À domicile");
  if (professional.homeAvailable && professional.location.trim()) modeBadges.push(professional.location.trim());
  if (professional.registrationNumber?.trim()) modeBadges.push(professional.registrationNumber.trim());

  const animalBadges = [...new Set(professional.services.flatMap((service) => service.animalTypes))];

  return { modeBadges, animalBadges };
}

export function BookingHeader({ professional }: { professional: PublicProfessional }) {
  const { modeBadges, animalBadges } = computeBadges(professional);
  const hasCover = Boolean(professional.coverPicture?.trim());

  const locationParts = [
    professional.location.trim() ? `Basée en ${professional.location.trim()}` : null,
    professional.cabinetAvailable && professional.cabinetCity.trim() ? professional.cabinetCity.trim() : null,
    professional.homeAvailable ? "Déplacements à domicile" : null,
  ].filter((part): part is string => Boolean(part));

  return (
    <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6 sm:pt-6">
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-6 p-5 sm:p-8 lg:flex-row lg:items-center">
          <div className="flex flex-1 items-start gap-4 sm:gap-6">
            <div className="relative shrink-0">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-animeo-dark text-lg font-black text-white shadow-sm sm:h-20 sm:w-20 sm:text-xl">
                {isImageValue(professional.logo) ? (
                  <Image src={professional.logo} alt="" width={80} height={80} unoptimized className="h-full w-full object-cover" />
                ) : professional.logo}
              </div>
              <div className="absolute -bottom-2 -right-2 flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-animeo-soft text-[10px] font-black text-animeo-dark sm:h-11 sm:w-11">
                {isImageValue(professional.photo) ? (
                  <Image src={professional.photo} alt="" width={44} height={44} unoptimized className="h-full w-full object-cover" />
                ) : professional.photo}
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-xs font-extrabold uppercase tracking-[0.14em]" style={{ color: professional.color }}>{professional.company}</p>
              <h1 className="mt-1 text-xl font-black text-animeo-dark sm:text-3xl">{professional.firstName} {professional.lastName}</h1>
              <p className="text-sm font-extrabold" style={{ color: professional.color }}>{professional.profession}</p>
              {professional.tagline?.trim() ? <p className="mt-2 max-w-2xl text-sm leading-6 text-animeo-muted">{professional.tagline}</p> : null}

              {modeBadges.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {modeBadges.map((badge) => (
                    <span key={badge} className="rounded-full border border-[#dfe9e6] px-2.5 py-1 text-xs font-bold text-animeo-dark">{badge}</span>
                  ))}
                </div>
              ) : null}
              {animalBadges.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {animalBadges.map((badge) => (
                    <span key={badge} className="rounded-full bg-animeo-bg px-2.5 py-1 text-xs font-bold text-animeo-muted">{badge}</span>
                  ))}
                </div>
              ) : null}

              {locationParts.length > 0 ? (
                <p className="mt-3 text-xs font-bold text-animeo-muted">📍 {locationParts.join(" · ")}</p>
              ) : null}
            </div>
          </div>

          {hasCover ? (
            <div className="relative h-40 w-full shrink-0 overflow-hidden rounded-2xl sm:h-48 lg:h-40 lg:w-56">
              <Image src={professional.coverPicture!} alt={`${professional.firstName} ${professional.lastName}`} fill unoptimized className="object-cover" />
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
