FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx prisma generate

# next build inlige les variables NEXT_PUBLIC_* dans le bundle client (et,
# par convention Next.js, partout où process.env.NEXT_PUBLIC_* est lu) : il
# faut donc la recevoir en argument de build, une variable d'environnement
# à l'exécution du conteneur arriverait trop tard.
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start"]
