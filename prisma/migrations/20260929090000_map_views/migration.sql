-- Vues enregistrées de la carte clients (phase 8.6) : un nom et l'adresse
-- de la carte (mode, filtres, lieu, rayon…). Propres à un compte, dans son
-- espace professionnel ; jamais de position GPS de l'appareil.
CREATE TABLE "MapView" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org-1002-pattes',

    CONSTRAINT "MapView_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MapView_organizationId_idx" ON "MapView"("organizationId");
CREATE UNIQUE INDEX "MapView_userId_name_key" ON "MapView"("userId", "name");

ALTER TABLE "MapView" ADD CONSTRAINT "MapView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MapView" ADD CONSTRAINT "MapView_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Même cloisonnement que les autres tables d'un espace (voir
-- 20260922170000_row_level_security).
ALTER TABLE "MapView" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MapView" FORCE ROW LEVEL SECURITY;
CREATE POLICY "cloisonnement_espace" ON "MapView"
  USING (
    COALESCE(current_setting('app.organization_id', true), '') = ''
    OR "organizationId" = current_setting('app.organization_id', true)
  )
  WITH CHECK (
    COALESCE(current_setting('app.organization_id', true), '') = ''
    OR "organizationId" = current_setting('app.organization_id', true)
  );
