// Studio de documents — export PDF (étape 5). Rendu client, image par page :
// le Stage Konva (formes/images/schéma) et la surcouche DOM (texte réel,
// jamais rendu par Konva) sont capturés séparément puis composés sur un
// canvas hors-écran avant d'être assemblés en PDF. Limitation assumée et
// annoncée dans le plan : le texte du PDF exporté est rasterisé, pas
// sélectionnable — un export vectoriel réel est un chantier V2 distinct.

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image illisible."));
    image.src = src;
  });
}

/**
 * Superpose l'image du Stage (fond blanc déjà inclus, voir canvas-stage.tsx)
 * et l'image de la surcouche texte (fond transparent) sur un même canevas,
 * aux dimensions demandées (déjà multipliées par le pixelRatio d'export).
 */
export async function compositeDocumentPageImage(stageDataUrl: string, overlayDataUrl: string, width: number, height: number): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Rendu 2D indisponible dans ce navigateur.");

  const [stageImage, overlayImage] = await Promise.all([loadImage(stageDataUrl), loadImage(overlayDataUrl)]);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(stageImage, 0, 0, width, height);
  ctx.drawImage(overlayImage, 0, 0, width, height);

  return canvas.toDataURL("image/jpeg", 0.92);
}

export async function downscaleImage(dataUrl: string, maxWidth: number): Promise<string> {
  const image = await loadImage(dataUrl);
  const scale = Math.min(1, maxWidth / image.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Rendu 2D indisponible dans ce navigateur.");
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.75);
}
