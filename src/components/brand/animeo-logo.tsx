import Image from "next/image";

type AnimeoLogoProps = {
  className?: string;
  priority?: boolean;
  size?: "hero" | "sidebar" | "mobile" | "footer";
  tone?: "dark" | "light";
};

const dimensions = {
  hero: { width: "clamp(256px, 80vw, 384px)", height: "clamp(51px, 16vw, 77px)" },
  sidebar: { width: "160px", height: "32px" },
  mobile: { width: "112px", height: "22px" },
  footer: { width: "64px", height: "13px" },
} satisfies Record<NonNullable<AnimeoLogoProps["size"]>, { width: string; height: string }>;

export function AnimeoLogo({ className = "", priority = false, size = "sidebar", tone = "dark" }: AnimeoLogoProps) {
  return (
    <span
      className={`relative inline-block overflow-hidden ${className}`}
      style={dimensions[size]}
    >
      <Image
        src="/animeo-logo.png"
        alt="Animéo"
        fill
        priority={priority}
        sizes="(max-width: 768px) 160px, 320px"
        className="object-cover object-center"
        style={tone === "light" ? { filter: "brightness(0) invert(1)" } : undefined}
      />
    </span>
  );
}
