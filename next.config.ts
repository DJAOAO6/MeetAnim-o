import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Le serveur de test (Playwright) compile dans son propre dossier : Next
  // refuse deux serveurs de développement sur le même dossier de compilation,
  // et les tests doivent pouvoir tourner pendant que le serveur de
  // développement sert l'application sur la base de développement.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  // Ne pas annoncer le framework à qui le demande (SEC-27).
  poweredByHeader: false,
  // En-têtes de sécurité posés par l'application elle-même (SEC-27), pour ne
  // plus dépendre du seul serveur frontal de l'hébergeur. La politique de
  // contenu se limite pour l'instant à ce qui ne touche pas aux scripts
  // (cadres, objets, base, formulaires) : une politique stricte des scripts
  // demande des nonces et des essais, à mener à part.
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        // La carte demande la position (« autour de moi ») ; rien d'autre.
        { key: "Permissions-Policy", value: "camera=(), microphone=(), payment=(), usb=(), geolocation=(self)" },
      ],
    }];
  },
  experimental: {
    serverActions: {
      // Les images (photo de profil, couverture, images de compte rendu)
      // voyagent en base64 dans le corps des actions, et un document est
      // enregistré en entier à chaque sauvegarde. Elles sont réduites dans
      // le navigateur avant l'envoi (src/lib/images/compress-image.ts), mais
      // un compte rendu avec plusieurs photos dépasse vite 1 Mo, la limite
      // par défaut. nginx, devant, accepte bien plus (vérifié : 20 Mo).
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
