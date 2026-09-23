FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx prisma generate

# next build inlige les variables NEXT_PUBLIC_* dans le bundle client (et,
# par convention Next.js, partout où process.env.NEXT_PUBLIC_* est lu) : il
# faut donc la recevoir en argument de build, une variable d'environnement
# à l'exécution du conteneur arriverait trop tard. Argument volontairement
# nommé autrement que la variable : l'hébergeur transmet déjà un argument
# NEXT_PUBLIC_APP_URL pointant sur l'URL de staging, qui écraserait sinon le
# domaine de production dans tous les liens (page de réservation, emails).
ARG PUBLIC_APP_URL=https://app.1002pattes.fr
ENV NEXT_PUBLIC_APP_URL=$PUBLIC_APP_URL
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

# Au démarrage, avant de servir : migrations en attente (sans effet si la
# base est à jour), modèles de documents fournis (idempotent), puis premier
# compte administrateur d'une base vierge (prisma/bootstrap-admin.ts, sans
# effet hors configuration dédiée ou si un administrateur existe déjà).
# Un échec arrête le démarrage plutôt que de servir l'application sur une
# base au schéma incomplet.
#
# DB_URL (injectée par Iridflow quand une base de la plateforme est rattachée
# au site) prend le pas sur DATABASE_URL : exportée avant toute commande pour
# que l'application, les migrations et les scripts visent la même base.
#
# Enfin, le site lui-même tourne sous un compte restreint, sans droit de
# contourner le cloisonnement de la base (scripts/runtime-role.mjs) — quand
# l'hébergeur ne fournit qu'un superutilisateur. Le script rend l'adresse à
# utiliser ; s'il échoue, même complètement, le site démarre avec l'adresse
# d'origine : jamais pas du tout.
CMD ["sh", "-c", "export DATABASE_URL=\"${DB_URL:-$DATABASE_URL}\" && npx prisma migrate deploy && npx tsx prisma/seed-document-templates.ts && npx tsx prisma/bootstrap-admin.ts && RUNTIME_DATABASE_URL=\"$(node scripts/runtime-role.mjs || true)\" && export DATABASE_URL=\"${RUNTIME_DATABASE_URL:-$DATABASE_URL}\" && npm start"]
