import type { ComponentProps } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

type TextLinkProps = ComponentProps<typeof Link> & {
  /** Flèche après le texte, pour un lien qui mène à une autre section. */
  arrow?: boolean;
};

/**
 * Lien de navigation (PLAN-BOUTONS, règle 1.3) : ce qui **ouvre une autre
 * page** reste un texte, à la couleur de la marque, sans soulignement. Deux
 * réglages qu'on ne voit pas : 44 px de haut pour le doigt, et le texte qui
 * fonce au survol. Ce qui **fait** quelque chose est un bouton, pas ceci.
 */
export function TextLink({ arrow = false, className = "", children, ...props }: TextLinkProps) {
  return (
    <Link {...props} className={`inline-flex min-h-11 items-center gap-1.5 text-sm font-extrabold text-animeo no-underline transition-colors hover:text-animeo-hover ${className}`}>
      {children}
      {arrow ? <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" /> : null}
    </Link>
  );
}
