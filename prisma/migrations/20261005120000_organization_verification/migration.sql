-- Vérification du numéro RNA (chantier C4, phase 3).

CREATE TYPE "VerificationStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'VERIFIED', 'REJECTED');

ALTER TABLE "Organization"
  ADD COLUMN "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN "verifiedAt" TIMESTAMP(3),
  ADD COLUMN "verifiedByUserId" TEXT,
  ADD COLUMN "verificationNote" TEXT;

-- Les espaces déjà configurés sont marqués vérifiés : personne n'est
-- enfermé dehors par l'arrivée de la vérification. Ceux dont la
-- configuration n'est pas finie passeront par l'étape du numéro.
UPDATE "Organization" SET "verificationStatus" = 'VERIFIED', "verifiedAt" = CURRENT_TIMESTAMP
WHERE "onboardedAt" IS NOT NULL;

ALTER TYPE "AuditAction" ADD VALUE 'VERIFICATION_REQUESTED';

-- Un numéro par espace : comparé en majuscules et sans espaces. Index sur
-- une expression, que Prisma ne sait pas décrire dans le schéma.
--
-- Garde-fou : si deux profils portaient déjà le même numéro, seul l'espace
-- le plus ancien le garde (les autres sont vidés et nommés dans le journal de la
-- migration) plutôt que de faire échouer le démarrage.
DO $$
DECLARE
  duplicate RECORD;
BEGIN
  FOR duplicate IN
    SELECT id, "organizationId", "registrationNumber" FROM (
      SELECT profile.id, profile."organizationId", profile."registrationNumber",
             row_number() OVER (PARTITION BY upper(regexp_replace(profile."registrationNumber", '\s', '', 'g')) ORDER BY organization."createdAt", profile.id) AS rank
      FROM "BusinessProfile" profile
      JOIN "Organization" organization ON organization.id = profile."organizationId"
      WHERE regexp_replace(coalesce(profile."registrationNumber", ''), '\s', '', 'g') <> ''
    ) ranked WHERE rank > 1
  LOOP
    RAISE NOTICE 'Numéro en double retiré : profil %, espace %, numéro %', duplicate.id, duplicate."organizationId", duplicate."registrationNumber";
    UPDATE "BusinessProfile" SET "registrationNumber" = NULL WHERE id = duplicate.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX "BusinessProfile_registrationNumber_normalized_key"
ON "BusinessProfile" (upper(regexp_replace("registrationNumber", '\s', '', 'g')))
WHERE regexp_replace(coalesce("registrationNumber", ''), '\s', '', 'g') <> '';
