"use client";

import { useRef } from "react";
import { hexToHsv, hsvToHex } from "@/components/documents/editor/color-math";

const WHEEL_SIZE = 140;

/**
 * Roue chromatique (étape 21) — anneau CSS (conic-gradient pour la teinte +
 * radial-gradient blanc→transparent par-dessus pour la saturation), point
 * indicateur déplaçable au pointeur, curseur de Luminosité séparé en
 * dessous. `conic-gradient(red,yellow,lime,cyan,blue,magenta,red)` sans
 * `from` place le rouge (teinte 0) en haut (0deg CSS), sens horaire — les 7
 * arrêts tombent exactement sur 0/60/120/180/240/300/360°, les teintes pures
 * HSV à ces fractions, donc la rampe est une vraie interpolation de teinte
 * linéaire. Le calcul pointeur→angle (atan2(dx,-dy)) utilise la même
 * convention (0°=haut, sens horaire) pour que le point cliqué corresponde
 * exactement à la couleur affichée sous le doigt/curseur.
 */
export function ColorWheel({
  hex,
  onChange,
  onChangeEnd,
}: {
  hex: string;
  onChange: (hex: string) => void;
  // Appelé une fois au relâchement du pointeur (pas à chaque frame de drag)
  // — pour committer dans "Couleurs récentes" sans spammer l'historique ni
  // fermer le popover à chaque pixel déplacé, voir color-picker.tsx.
  onChangeEnd?: (hex: string) => void;
}) {
  const wheelRef = useRef<HTMLDivElement>(null);
  const hsv = hexToHsv(hex);

  function colorFromPointer(clientX: number, clientY: number): string | null {
    const wheel = wheelRef.current;
    if (!wheel) return null;
    const rect = wheel.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const radius = rect.width / 2;
    const distance = Math.min(Math.sqrt(dx * dx + dy * dy), radius);
    let angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
    if (angle < 0) angle += 360;
    const saturation = (distance / radius) * 100;
    return hsvToHex(angle, saturation, hsv.v);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const color = colorFromPointer(event.clientX, event.clientY);
    if (color) onChange(color);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (event.buttons !== 1) return;
    const color = colorFromPointer(event.clientX, event.clientY);
    if (color) onChange(color);
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const color = colorFromPointer(event.clientX, event.clientY);
    if (color) onChangeEnd?.(color);
  }

  const angleRad = (hsv.h * Math.PI) / 180;
  const radiusFraction = hsv.s / 100;
  const dotLeft = 50 + Math.sin(angleRad) * radiusFraction * 50;
  const dotTop = 50 - Math.cos(angleRad) * radiusFraction * 50;

  return (
    <div className="space-y-2">
      <div
        ref={wheelRef}
        // Pas de role="slider" : c'est un contrôle à 2 axes (teinte +
        // saturation), pas une seule valeur — aucun rôle ARIA standard ne
        // décrit correctement un vrai sélecteur 2D. Le champ Hex texte reste
        // la voie d'entrée clavier-only pour choisir une couleur précise.
        aria-label="Roue chromatique (teinte et saturation) — utilisez le champ Hex pour une saisie au clavier"
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          width: WHEEL_SIZE,
          height: WHEEL_SIZE,
          borderRadius: "50%",
          position: "relative",
          cursor: "crosshair",
          touchAction: "none",
          background: "radial-gradient(circle, white, transparent 70%), conic-gradient(red, yellow, lime, cyan, blue, magenta, red)",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: `${dotLeft}%`,
            top: `${dotTop}%`,
            width: 12,
            height: 12,
            borderRadius: "50%",
            border: "2px solid white",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.35)",
            transform: "translate(-50%, -50%)",
            backgroundColor: hex,
            pointerEvents: "none",
          }}
        />
      </div>

      <label className="flex items-center gap-2">
        <span className="w-16 shrink-0 text-[10px] font-bold uppercase tracking-wide text-neutral-500">Luminosité</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(hsv.v)}
          onChange={(event) => onChange(hsvToHex(hsv.h, hsv.s, Number(event.target.value)))}
          onMouseUp={(event) => onChangeEnd?.(hsvToHex(hsv.h, hsv.s, Number(event.currentTarget.value)))}
          onTouchEnd={(event) => onChangeEnd?.(hsvToHex(hsv.h, hsv.s, Number(event.currentTarget.value)))}
          aria-label="Luminosité"
          style={{ background: `linear-gradient(to right, #000000, ${hsvToHex(hsv.h, hsv.s, 100)})` }}
          className="h-2 flex-1 appearance-none rounded-full outline-none"
        />
      </label>
    </div>
  );
}
