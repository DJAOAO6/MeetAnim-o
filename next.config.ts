import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
