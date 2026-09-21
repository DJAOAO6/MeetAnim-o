"use client";

/**
 * Réduit une image choisie par l'utilisateur avant de l'envoyer.
 *
 * Les images sont stockées en data URI dans la base et voyagent dans le corps
 * des Server Actions. Une photo de téléphone (3 à 5 Mo, soit 4 à 7 Mo une
 * fois en base64) dépassait la limite des actions et échouait en erreur 500
 * — constaté par tests/audit/audit-security.spec.ts. Une photo de profil ou
 * de compte rendu n'a jamais besoin de plus de ~1 600 px de côté.
 *
 * - Photos (JPEG…) → JPEG réencodé, orientation EXIF respectée.
 * - PNG (logos, souvent transparents) → WebP, qui garde la transparence ;
 *   un fond noir sur un logo serait pire qu'une image un peu lourde.
 * - SVG → inchangé (vectoriel, déjà léger), seulement borné en taille.
 */

type CompressOptions = {
  /** Plus grand côté, en pixels. */
  maxDimension?: number;
  /** Taille maximale du data URI produit, en octets. */
  maxBytes?: number;
};

export class ImageTooLargeError extends Error {}

export async function fileToCompressedDataUrl(file: File, { maxDimension = 1600, maxBytes = 700_000 }: CompressOptions = {}): Promise<string> {
  if (!file.type.startsWith("image/")) throw new ImageTooLargeError("Ce fichier n’est pas une image.");

  if (file.type === "image/svg+xml") {
    const dataUrl = await readAsDataUrl(file);
    if (dataUrl.length > maxBytes) throw new ImageTooLargeError("Cette image SVG est trop lourde.");
    return dataUrl;
  }

  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const keepsTransparency = file.type === "image/png" || file.type === "image/webp" || file.type === "image/gif";
  const format = keepsTransparency ? "image/webp" : "image/jpeg";

  let dimension = Math.min(maxDimension, Math.max(bitmap.width, bitmap.height));
  let quality = 0.85;
  try {
    // Quelques passes au plus : qualité d'abord, taille ensuite.
    for (let attempt = 0; attempt < 6; attempt++) {
      const dataUrl = draw(bitmap, dimension, format, quality);
      if (dataUrl.length <= maxBytes) return dataUrl;
      if (quality > 0.65) quality -= 0.1;
      else dimension = Math.round(dimension * 0.8);
    }
  } finally {
    bitmap.close();
  }
  throw new ImageTooLargeError("Cette image reste trop lourde même réduite. Essayez une autre image.");
}

function draw(bitmap: ImageBitmap, dimension: number, format: string, quality: number): string {
  const scale = Math.min(1, dimension / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new ImageTooLargeError("Votre navigateur ne permet pas de préparer cette image.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  // Un navigateur qui ne sait pas encoder le WebP renvoie du PNG : la boucle
  // appelante le réduira alors en taille jusqu'à passer.
  return canvas.toDataURL(format, quality);
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Lecture impossible")));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
