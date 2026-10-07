"use client";

import type { ComponentProps } from "react";
import { X } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";

type CloseButtonProps = Omit<ComponentProps<typeof IconButton>, "label" | "children" | "variant"> & { label?: string };

/**
 * La croix de fermeture (PLAN-BOUTONS, modèle 5) : la même partout, en haut
 * à droite. Son infobulle s'ouvre dessous et calée à droite — au-dessus ou
 * centrée, le bord de la fenêtre la couperait.
 */
export function CloseButton({ label = "Fermer", tooltipSide = "bottom", tooltipAlign = "end", ...props }: CloseButtonProps) {
  return (
    <IconButton {...props} label={label} tooltipSide={tooltipSide} tooltipAlign={tooltipAlign}>
      <X aria-hidden="true" className="h-5 w-5" />
    </IconButton>
  );
}
