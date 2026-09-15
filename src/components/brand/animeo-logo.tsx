import Image from "next/image";

type AnimeoLogoProps = {
  className?: string;
  priority?: boolean;
  size?: "hero" | "sidebar" | "mobile" | "footer";
  tone?: "dark" | "light";
};

// Proportions réelles de public/1002-pattes-logo.png (560 × 328).
const LOGO_RATIO = 560 / 328;

const heights = {
  hero: "clamp(96px, 26vw, 140px)",
  sidebar: "76px",
  mobile: "40px",
  footer: "22px",
} satisfies Record<NonNullable<AnimeoLogoProps["size"]>, string>;

/**
 * Logo 1002 Pattes. Sur la barre latérale et l'en-tête mobile (tone="light"),
 * il est posé sur une pastille --theme-logo-plate : transparente sur la barre
 * claire du thème 1002 Pattes, crème sur une barre foncée (Émeraude, mode
 * sombre), où le logo en couleurs serait sinon illisible.
 */
export function AnimeoLogo({ className = "", priority = false, size = "sidebar", tone = "dark" }: AnimeoLogoProps) {
  const height = heights[size];

  const image = (
    <span className="relative inline-block" style={{ height, aspectRatio: String(LOGO_RATIO) }}>
      <Image src="/1002-pattes-logo.png" alt="1002 Pattes" fill priority={priority} sizes="(max-width: 768px) 160px, 280px" className="object-contain" />
    </span>
  );

  if (tone === "light") {
    return <span className={`inline-flex rounded-xl bg-[var(--theme-logo-plate)] px-2 py-1 ${className}`}>{image}</span>;
  }

  return <span className={`inline-flex ${className}`}>{image}</span>;
}
