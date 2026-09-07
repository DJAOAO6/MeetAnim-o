export type Box = { x: number; y: number; width: number; height: number };
export type SmartGuide = { orientation: "vertical" | "horizontal"; position: number };
export type GuideComputation = { guides: SmartGuide[]; x: number; y: number };

type XFeatureName = "left" | "centerX" | "right";
type YFeatureName = "top" | "centerY" | "bottom";

/**
 * Repères intelligents (étape 15) — fonction pure, appelée à chaque frame de
 * `onDragMove` (canvas-stage.tsx) à partir de la position LIVE du nœud Konva
 * en cours de déplacement, jamais du store (zéro re-render React par frame).
 * Un seul candidat gagnant par axe (le plus proche sous le seuil), jamais
 * plusieurs repères coïncidents — volontairement plus simple que Figma/Canva,
 * suffisant pour l'usage réel (voir le plan).
 */
export function computeGuides(movingBox: Box, pageSize: { width: number; height: number }, otherBoxes: Box[], thresholdPx: number): GuideComputation {
  const xCandidates = [0, pageSize.width / 2, pageSize.width, ...otherBoxes.flatMap((box) => [box.x, box.x + box.width / 2, box.x + box.width])];
  const yCandidates = [0, pageSize.height / 2, pageSize.height, ...otherBoxes.flatMap((box) => [box.y, box.y + box.height / 2, box.y + box.height])];

  const xFeatures: { name: XFeatureName; value: number }[] = [
    { name: "left", value: movingBox.x },
    { name: "centerX", value: movingBox.x + movingBox.width / 2 },
    { name: "right", value: movingBox.x + movingBox.width },
  ];
  const yFeatures: { name: YFeatureName; value: number }[] = [
    { name: "top", value: movingBox.y },
    { name: "centerY", value: movingBox.y + movingBox.height / 2 },
    { name: "bottom", value: movingBox.y + movingBox.height },
  ];

  const bestX = bestMatch(xCandidates, xFeatures, thresholdPx);
  const bestY = bestMatch(yCandidates, yFeatures, thresholdPx);

  const guides: SmartGuide[] = [];
  let x = movingBox.x;
  let y = movingBox.y;

  if (bestX) {
    guides.push({ orientation: "vertical", position: bestX.candidate });
    x = bestX.feature === "left" ? bestX.candidate : bestX.feature === "centerX" ? bestX.candidate - movingBox.width / 2 : bestX.candidate - movingBox.width;
  }
  if (bestY) {
    guides.push({ orientation: "horizontal", position: bestY.candidate });
    y = bestY.feature === "top" ? bestY.candidate : bestY.feature === "centerY" ? bestY.candidate - movingBox.height / 2 : bestY.candidate - movingBox.height;
  }

  return { guides, x, y };
}

function bestMatch<Name extends string>(
  candidates: number[],
  features: { name: Name; value: number }[],
  thresholdPx: number,
): { candidate: number; feature: Name; delta: number } | null {
  let best: { candidate: number; feature: Name; delta: number } | null = null;
  for (const candidate of candidates) {
    for (const feature of features) {
      const delta = candidate - feature.value;
      if (Math.abs(delta) <= thresholdPx && (!best || Math.abs(delta) < Math.abs(best.delta))) {
        best = { candidate, feature: feature.name, delta };
      }
    }
  }
  return best;
}
