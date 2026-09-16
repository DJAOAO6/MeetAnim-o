import Image from "next/image";

type AnimeoLogoProps = {
  className?: string;
  priority?: boolean;
  size?: "hero" | "sidebar" | "mobile" | "footer" | "mark";
  tone?: "dark" | "light";
};

// Proportions réelles de public/1002-pattes-logo.png (560 × 329), détouré de
// ses marges transparentes : sans ce détourage, le logo paraîtrait plus petit
// que la hauteur demandée, les marges vides comptant dans le cadre.
const LOGO_RATIO = 560 / 329;

const heights = {
  hero: "clamp(96px, 26vw, 140px)",
  sidebar: "76px",
  mobile: "40px",
  footer: "22px",
  // Marque seule (la tête du teckel), pour la barre latérale repliée : le
  // logo complet réduit à cette largeur deviendrait illisible.
  mark: "40px",
} satisfies Record<NonNullable<AnimeoLogoProps["size"]>, string>;

const MARK_RATIO = 128 / 155;

/**
 * Logo 1002 Pattes. Sur la barre latérale et l'en-tête mobile (tone="light"),
 * il est posé sur une pastille --theme-logo-plate : transparente sur la barre
 * claire du thème 1002 Pattes, crème sur une barre foncée (Émeraude, mode
 * sombre), où le logo en couleurs serait sinon illisible.
 */
export function AnimeoLogo({ className = "", priority = false, size = "sidebar", tone = "dark" }: AnimeoLogoProps) {
  const height = heights[size];
  const isMark = size === "mark";

  const image = (
    <span className="relative inline-block" style={{ height, aspectRatio: String(isMark ? MARK_RATIO : LOGO_RATIO) }}>
      <Image
        src={isMark ? "/1002-pattes-mark.png" : "/1002-pattes-logo.png"}
        alt="1002 Pattes"
        fill
        priority={priority}
        sizes={isMark ? "48px" : "(max-width: 768px) 160px, 280px"}
        className="object-contain"
      />
    </span>
  );

  if (tone === "light") {
    return <span className={`inline-flex rounded-xl bg-[var(--theme-logo-plate)] px-2 py-1 ${className}`}>{image}</span>;
  }

  return <span className={`inline-flex ${className}`}>{image}</span>;
}
