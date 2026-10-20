/**
 * Contrôle, côté serveur, d'une image reçue du navigateur (audit 2026-10,
 * SEC-22). La compression se fait dans le navigateur (compress-image.ts),
 * mais rien n'empêchait d'appeler l'action directement avec n'importe quel
 * contenu, jusqu'à la limite globale de 6 Mo. On vérifie ici le type
 * annoncé, la signature réelle du contenu (premiers octets) et la taille.
 */

const IMAGE_DATA_URL = /^data:(image\/(?:jpeg|png|webp|gif|svg\+xml));base64,([A-Za-z0-9+/]+={0,2})$/;

/** Les premiers octets attendus de chaque format. */
function contentMatches(type: string, bytes: Buffer): boolean {
  switch (type) {
    case "image/jpeg": return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case "image/png": return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case "image/webp": return bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP";
    case "image/gif": return bytes.subarray(0, 4).toString("latin1") === "GIF8";
    // Un SVG n'est affiché que par une balise <img>, où il n'exécute rien :
    // il suffit que ce soit bien un SVG.
    case "image/svg+xml": {
      const text = bytes.subarray(0, 512).toString("utf8").trimStart();
      return text.startsWith("<svg") || text.startsWith("<?xml");
    }
    default: return false;
  }
}

export type ImageRules = {
  /** Longueur maximale de l'adresse data: (≈ 4/3 de la taille du fichier). */
  maxChars: number;
  /** Adresses http(s) admises telles quelles (photos par défaut fournies). */
  allowedUrls?: readonly string[];
  /** Le profil vierge met les initiales à la place d'une photo. */
  allowInitials?: boolean;
};

/** Message d'erreur si la valeur n'est pas une image acceptable, sinon null. Vide = pas d'image. */
export function imageProblem(value: string | null | undefined, rules: ImageRules): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (rules.allowInitials && /^[\p{L}\p{N}]{1,4}$/u.test(value)) return null;
  if (rules.allowedUrls?.includes(value)) return null;
  // Fichier fourni avec l'application (public/) : un chemin local, jamais un autre site.
  if (/^\/(?!\/)[\w./-]+$/.test(value)) return null;

  const match = IMAGE_DATA_URL.exec(value);
  if (!match) return "Format d'image non reconnu : utilisez une photo JPEG, PNG ou WebP.";
  if (value.length > rules.maxChars) return "Cette image est trop lourde.";
  const [, type, base64] = match;
  if (!contentMatches(type, Buffer.from(base64.slice(0, 1024), "base64"))) return "Ce fichier n'est pas l'image qu'il prétend être.";
  return null;
}

/** Le PDF d'un compte rendu (jsPDF, « datauristring ») : vraiment un PDF, et de taille raisonnable. */
export function pdfProblem(value: string | null | undefined, maxChars: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  const match = /^data:application\/pdf(?:;[^,;]+=[^,;]*)*;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return "Le document produit n'est pas un PDF.";
  if (value.length > maxChars) return "Ce document est trop lourd.";
  if (!Buffer.from(match[1].slice(0, 64), "base64").subarray(0, 5).equals(Buffer.from("%PDF-"))) return "Le document produit n'est pas un PDF.";
  return null;
}
