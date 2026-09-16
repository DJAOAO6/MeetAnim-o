"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { BookingHeader } from "@/components/booking/booking-header";
import { ProfessionalSidebar } from "@/components/booking/sidebar/professional-sidebar";
import { Card } from "@/components/ui/card";
import { buttonRadius, densitySpacing, fontStacks, type PublicPageConfig } from "@/data/public-page";
import type { PublicProfessional } from "@/data/public-booking";

export type PreviewDevice = "desktop" | "tablet" | "mobile";

/** Largeurs réelles simulées, pas des approximations : un aperçu qui ment ne sert à rien. */
const deviceWidth: Record<PreviewDevice, number> = { desktop: 1180, tablet: 820, mobile: 390 };

/**
 * Aperçu de la page publique. Deux partis pris :
 *
 * 1. Ce sont les vrais composants de la page publique qui sont rendus
 *    (en-tête, cartes d'informations), pas une imitation. Ce que le
 *    professionnel voit est donc ce que ses clients verront.
 * 2. Le thème est appliqué en redéfinissant les variables CSS que ces
 *    composants lisent déjà (--theme-*). Aucun composant n'a besoin de
 *    connaître l'éditeur, et un futur réglage se branche au même endroit.
 *
 * La largeur simulée est obtenue en rendant la page à sa vraie largeur puis
 * en la mettant à l'échelle : les points de rupture réagissent comme sur
 * l'appareil, ce qu'un simple redimensionnement de conteneur ne ferait pas.
 */
export function PublicPagePreview({ config, professional, device }: { config: PublicPageConfig; professional: PublicProfessional; device: PreviewDevice }) {
  const width = deviceWidth[device];
  const spacing = densitySpacing[config.theme.density];

  // L'échelle se déduit de la place réellement disponible, mesurée : un
  // facteur fixe finissait par déborder de la colonne centrale (aperçu rogné
  // à droite) dès que la fenêtre changeait de taille. Jamais d'agrandissement
  // au-delà de 1 : un téléphone simulé ne doit pas paraître plus grand que
  // nature.
  const containerRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(0);
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width));
    observer.observe(element);
    setAvailable(element.clientWidth);
    return () => observer.disconnect();
  }, []);

  const themeStyle = useMemo<CSSProperties>(() => ({
    "--theme-primary": config.theme.primaryColor,
    "--theme-primary-hover": config.theme.primaryColor,
    "--theme-brand": config.theme.primaryColor,
    "--theme-accent": config.theme.accentColor,
    "--theme-background": config.theme.backgroundColor,
    "--theme-surface": config.theme.surfaceColor,
    "--theme-surface-alt": config.theme.surfaceColor,
    "--theme-text": config.theme.textColor,
    "--theme-heading": config.theme.textColor,
    "--theme-card-radius": buttonRadius[config.theme.buttonShape],
    fontFamily: fontStacks[config.theme.font],
    background: config.theme.backgroundColor,
    color: config.theme.textColor,
    width,
  } as CSSProperties), [config.theme, width]);

  const sidebarSections = config.sections.filter((section) => section.id !== "header" && section.id !== "services");
  const servicesSection = config.sections.find((section) => section.id === "services");
  const headerIndex = config.sections.findIndex((section) => section.id === "header");
  const servicesIndex = config.sections.findIndex((section) => section.id === "services");

  // Facteur d'échelle et hauteur simulée par appareil. La page est rendue à
  // sa vraie largeur puis réduite : les points de rupture réagissent comme
  // sur l'appareil visé, ce qu'un simple conteneur étroit ne ferait pas.
  const scale = available > 0 ? Math.min(1, available / width) : 0.5;
  const simulatedHeight = 1000;

  return (
    <div ref={containerRef} className="flex justify-center overflow-hidden rounded-[22px] border border-animeo-border bg-animeo-bg p-4" data-testid="public-page-preview">
      {/* Boîte aux dimensions réduites : c'est elle qui occupe la place dans la
          mise en page, la transformation ne changeant pas l'encombrement de
          son contenu. Sans elle, l'aperçu débordait et se retrouvait rogné. */}
      <div style={{ width: width * scale, height: simulatedHeight * scale }} className="overflow-hidden rounded-xl shadow-[0_10px_30px_rgb(var(--theme-shadow-rgb)/0.12)]">
        <div style={{ width, height: simulatedHeight, transform: `scale(${scale})`, transformOrigin: "top left" }}>
          <div style={themeStyle} className="h-full overflow-hidden">
            <div className={`mx-auto flex max-w-[1180px] flex-col ${spacing.gap} px-4 ${spacing.section}`}>
              {headerIndex <= servicesIndex ? <BookingHeader professional={professional} /> : null}

              <div className={`grid ${spacing.gap} lg:grid-cols-[minmax(0,1.7fr)_320px]`}>
                <Card className={`${spacing.section} px-5`}>
                  <h2 className="text-lg font-black" style={{ color: config.theme.textColor }}>
                    {servicesSection?.title ?? "Prendre rendez-vous"}
                  </h2>
                  <p className="mt-1 text-sm opacity-70">Choisissez une prestation, un créneau, puis vos coordonnées.</p>
                  <ul className={`mt-4 grid ${spacing.gap} sm:grid-cols-2`}>
                    {professional.services.slice(0, 4).map((service) => (
                      <li key={service.id} className="rounded-2xl border p-4" style={{ borderColor: config.theme.accentColor }}>
                        <p className="text-sm font-extrabold">{service.name}</p>
                        <p className="mt-1 text-xs opacity-70">{service.duration} min</p>
                      </li>
                    ))}
                  </ul>
                  <span
                    className="mt-5 inline-flex min-h-11 items-center px-5 text-sm font-extrabold text-white"
                    style={{ background: config.theme.primaryColor, borderRadius: buttonRadius[config.theme.buttonShape] }}
                  >
                    Choisir ce créneau
                  </span>
                </Card>

                <ProfessionalSidebar professional={professional} sections={sidebarSections} />
              </div>

              {headerIndex > servicesIndex ? <BookingHeader professional={professional} /> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
