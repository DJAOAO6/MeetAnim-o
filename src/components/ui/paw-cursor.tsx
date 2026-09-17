"use client";

import { useEffect, useRef } from "react";

/** Même inclinaison qu'un pointeur classique, pour que la patte « pointe ». */
const ANGLE = -18;

const PAW_PATHS = {
  open: `
    <ellipse cx='50' cy='68' rx='24' ry='20'/>
    <ellipse cx='18' cy='40' rx='11' ry='14' transform='rotate(-15 18 40)'/>
    <ellipse cx='38' cy='20' rx='10' ry='13' transform='rotate(-5 38 20)'/>
    <ellipse cx='62' cy='20' rx='10' ry='13' transform='rotate(5 62 20)'/>
    <ellipse cx='82' cy='40' rx='11' ry='14' transform='rotate(15 82 40)'/>
  `,
  closed: `
    <ellipse cx='50' cy='60' rx='26' ry='24'/>
    <ellipse cx='34' cy='46' rx='10' ry='9' transform='rotate(-20 34 46)'/>
    <ellipse cx='44' cy='38' rx='9' ry='8' transform='rotate(-8 44 38)'/>
    <ellipse cx='56' cy='38' rx='9' ry='8' transform='rotate(8 56 38)'/>
    <ellipse cx='66' cy='46' rx='10' ry='9' transform='rotate(20 66 46)'/>
  `,
} as const;

function pawDataUri(shape: keyof typeof PAW_PATHS, color: string) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' fill='${color}'>${PAW_PATHS[shape]}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** Ton plus soutenu d'une couleur choisie, pour le tampon et la patte fermée. */
function darken(hex: string, amount = 0.22) {
  const match = /^#?([\da-f]{6})$/i.exec(hex.trim());
  if (!match) return hex;
  const value = parseInt(match[1], 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  return `#${channels.map((channel) => Math.round(channel * (1 - amount)).toString(16).padStart(2, "0")).join("")}`;
}

type PawCursorProps = {
  /** Couleur des traces et du curseur au repos (patte ouverte). */
  color?: string;
  /**
   * Couleur du tampon de clic, de la patte fermée, et de l'anneau de dépôt.
   * Par défaut, un ton plus soutenu de `color` : une couleur choisie seule
   * suffit, sans avoir à en accorder une seconde.
   */
  strongColor?: string;
  /** Traînée de traces au sol pendant le déplacement. */
  trail?: boolean;
  /**
   * Masquer la flèche du système et la remplacer par la patte. Éteint, la
   * flèche reste : on garde alors les traces au sol et le tampon au clic,
   * sans toucher au repère habituel.
   */
  replaceCursor?: boolean;
};

/**
 * Curseur en patte : ouverte au repos, fermée dès qu'on attrape et déplace
 * quelque chose, rouverte au dépôt — avec un tampon au clic et une traînée
 * optionnelle.
 *
 * Deux garde-fous par rapport au curseur système qu'il remplace :
 *
 * - il ne s'active qu'avec une vraie souris. Sur un écran tactile il n'y a
 *   pas de curseur à remplacer, et masquer celui d'un pointeur grossier
 *   (télécommande, stylet) retirerait un repère sans rien donner en échange ;
 * - le curseur de texte est préservé. Masquer le trait vertical dans un champ
 *   de saisie fait perdre l'endroit où l'on écrit — c'est le seul curseur
 *   système qui porte une information que la patte ne remplace pas.
 *
 * Il se monte uniquement là où le professionnel l'a demandé : la page
 * publique et l'espace de travail ont chacun leur réglage, tous deux éteints
 * par défaut.
 */
export function PawCursor({ color = "#7a9b6e", strongColor, trail = true, replaceCursor = true }: PawCursorProps) {
  const strong = strongColor ?? darken(color);
  const pointerRef = useRef<HTMLDivElement>(null);
  const flip = useRef(false);
  const lastSpawn = useRef(0);
  const isDown = useRef(false);
  const isDragging = useRef(false);
  const start = useRef({ x: 0, y: 0 });

  useEffect(() => {
    // Souris seulement : voir l'explication ci-dessus.
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    if (replaceCursor) document.body.classList.add("paw-cursor-active");
    const pointer = pointerRef.current;

    function setPointerShape(closed: boolean) {
      if (pointer) pointer.style.backgroundImage = pawDataUri(closed ? "closed" : "open", color);
    }
    setPointerShape(false);

    function spawnTrail(x: number, y: number, closed: boolean) {
      if (!trail) return;
      const now = Date.now();
      const interval = closed ? 70 : 110;
      if (now - lastSpawn.current < interval) return;
      lastSpawn.current = now;
      flip.current = !flip.current;

      const paw = document.createElement("div");
      paw.className = "paw-print-trail";
      paw.style.left = `${x + (flip.current ? 8 : -8)}px`;
      paw.style.top = `${y}px`;
      paw.style.setProperty("--r", `${flip.current ? -10 : -26}deg`);
      paw.style.width = closed ? "24px" : "20px";
      paw.style.height = closed ? "24px" : "20px";
      paw.style.backgroundImage = pawDataUri(closed ? "closed" : "open", closed ? strong : color);
      paw.style.animation = `pawFade ${closed ? 0.65 : 0.8}s ease-out forwards`;
      document.body.appendChild(paw);
      window.setTimeout(() => paw.remove(), closed ? 650 : 850);
    }

    function spawnStamp(x: number, y: number) {
      const stamp = document.createElement("div");
      stamp.className = "paw-stamp";
      stamp.style.left = `${x}px`;
      stamp.style.top = `${y}px`;
      stamp.style.backgroundImage = pawDataUri("open", strong);
      document.body.appendChild(stamp);
      window.setTimeout(() => stamp.remove(), 700);
    }

    function spawnDropRing(x: number, y: number) {
      const ring = document.createElement("div");
      ring.className = "paw-drop-ring";
      ring.style.left = `${x}px`;
      ring.style.top = `${y}px`;
      ring.style.borderColor = strong;
      document.body.appendChild(ring);
      window.setTimeout(() => ring.remove(), 500);
    }

    function handleDown(event: MouseEvent) {
      isDown.current = true;
      isDragging.current = false;
      start.current = { x: event.clientX, y: event.clientY };
      spawnStamp(event.clientX, event.clientY);
      pointer?.classList.add("pressed");
    }

    function handleMove(event: MouseEvent) {
      if (pointer) {
        pointer.style.left = `${event.clientX}px`;
        pointer.style.top = `${event.clientY}px`;
      }
      if (isDown.current && !isDragging.current) {
        const distance = Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y);
        if (distance > 6) {
          isDragging.current = true;
          setPointerShape(true);
        }
      }
      spawnTrail(event.clientX, event.clientY, isDragging.current);
    }

    function handleUp(event: MouseEvent) {
      pointer?.classList.remove("pressed");
      if (isDragging.current) {
        spawnDropRing(event.clientX, event.clientY);
        setPointerShape(false);
      }
      isDown.current = false;
      isDragging.current = false;
    }

    // Glisser-déposer HTML5 : le navigateur émet sa propre suite d'évènements,
    // sans passer par mousedown/mousemove.
    function handleDragStart() {
      isDown.current = true;
      isDragging.current = true;
      setPointerShape(true);
      pointer?.classList.add("pressed");
    }

    function handleDrag(event: DragEvent) {
      // Dernier évènement d'un glisser : coordonnées à zéro, sans signification.
      if (event.clientX === 0 && event.clientY === 0) return;
      if (pointer) {
        pointer.style.left = `${event.clientX}px`;
        pointer.style.top = `${event.clientY}px`;
      }
      spawnTrail(event.clientX, event.clientY, true);
    }

    function handleDragEnd(event: DragEvent) {
      pointer?.classList.remove("pressed");
      spawnDropRing(event.clientX, event.clientY);
      setPointerShape(false);
      isDown.current = false;
      isDragging.current = false;
    }

    window.addEventListener("mousedown", handleDown);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    window.addEventListener("dragstart", handleDragStart);
    window.addEventListener("drag", handleDrag);
    window.addEventListener("dragend", handleDragEnd);

    return () => {
      document.body.classList.remove("paw-cursor-active");
      // Les traces vivent hors de React : un démontage en pleine animation
      // (changement de page, réglage désactivé) les laisserait sur l'écran.
      document.querySelectorAll(".paw-print-trail, .paw-stamp, .paw-drop-ring").forEach((node) => node.remove());
      window.removeEventListener("mousedown", handleDown);
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      window.removeEventListener("dragstart", handleDragStart);
      window.removeEventListener("drag", handleDrag);
      window.removeEventListener("dragend", handleDragEnd);
    };
  }, [color, strong, trail, replaceCursor]);

  return (
    <>
      {replaceCursor ? <div ref={pointerRef} aria-hidden="true" className="paw-cursor-pointer" /> : null}
      <style>{`
        .paw-cursor-active, .paw-cursor-active * { cursor: none !important; }
        /* Le curseur de texte reste : il dit où l'on écrit, ce que la patte
           ne dit pas. */
        .paw-cursor-active input, .paw-cursor-active textarea,
        .paw-cursor-active [contenteditable="true"] { cursor: text !important; }

        .paw-cursor-pointer {
          position: fixed;
          top: -100px;
          left: -100px;
          width: 28px;
          height: 28px;
          pointer-events: none;
          z-index: 10000;
          background-repeat: no-repeat;
          background-size: contain;
          transform: translate(-30%, -22%) rotate(${ANGLE}deg);
          transition: transform 0.12s ease;
        }
        .paw-cursor-pointer.pressed {
          transform: translate(-30%, -22%) rotate(${ANGLE}deg) scale(0.82);
        }

        .paw-print-trail {
          position: fixed;
          pointer-events: none;
          z-index: 9998;
          background-repeat: no-repeat;
          background-size: contain;
        }
        @keyframes pawFade {
          from { opacity: 0.6; transform: translate(-50%, -50%) scale(1) rotate(var(--r, ${ANGLE}deg)); }
          to   { opacity: 0;   transform: translate(-50%, -50%) scale(0.5) rotate(var(--r, ${ANGLE}deg)); }
        }

        .paw-stamp {
          position: fixed;
          width: 34px;
          height: 34px;
          pointer-events: none;
          z-index: 9999;
          background-repeat: no-repeat;
          background-size: contain;
          transform: translate(-50%, -50%) rotate(${ANGLE}deg);
          animation: stamp 0.7s cubic-bezier(.2,1.4,.4,1) forwards;
        }
        @keyframes stamp {
          0%   { opacity: 0;    transform: translate(-50%, -50%) scale(0.2) rotate(${ANGLE}deg); }
          35%  { opacity: 0.9;  transform: translate(-50%, -50%) scale(1.15) rotate(${ANGLE}deg); }
          60%  { opacity: 0.75; transform: translate(-50%, -50%) scale(0.95) rotate(${ANGLE}deg); }
          100% { opacity: 0;    transform: translate(-50%, -50%) scale(0.8) rotate(${ANGLE}deg); }
        }

        .paw-drop-ring {
          position: fixed;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          border: 2px solid;
          transform: translate(-50%, -50%) scale(0.3);
          opacity: 0.8;
          pointer-events: none;
          z-index: 9999;
          animation: dropRing 0.5s ease-out forwards;
        }
        @keyframes dropRing {
          to { transform: translate(-50%, -50%) scale(1.8); opacity: 0; }
        }

        @media (prefers-reduced-motion: reduce) {
          .paw-print-trail, .paw-stamp, .paw-drop-ring { animation: none; display: none; }
        }
      `}</style>
    </>
  );
}
