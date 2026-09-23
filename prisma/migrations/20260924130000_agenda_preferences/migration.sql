-- Préférences d'affichage de l'agenda, une ligne par compte (au plus) :
-- absente, l'agenda prend les valeurs par défaut de src/lib/agenda-display.ts.
-- Aucun lien avec les horaires d'ouverture ni les rendez-vous.
CREATE TABLE "AgendaPreferences" (
  "id"              TEXT         NOT NULL,
  "userId"          TEXT         NOT NULL,
  "slotMinutes"     INTEGER      NOT NULL DEFAULT 30,
  "density"         TEXT         NOT NULL DEFAULT 'comfortable',
  "dayStart"        INTEGER      NOT NULL DEFAULT 8,
  "dayEnd"          INTEGER      NOT NULL DEFAULT 21,
  "showSaturday"    BOOLEAN      NOT NULL DEFAULT true,
  "showSunday"      BOOLEAN      NOT NULL DEFAULT true,
  "showClosedZones" BOOLEAN      NOT NULL DEFAULT true,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgendaPreferences_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AgendaPreferences_userId_key" ON "AgendaPreferences"("userId");
ALTER TABLE "AgendaPreferences" ADD CONSTRAINT "AgendaPreferences_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
