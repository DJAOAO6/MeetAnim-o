-- Journal : les changements de réglages visibles des clients (profil public,
-- horaires, prestations, page publique, zones) sont tracés (audit 2026-10,
-- SEC-31). Uniquement additive : une nouvelle valeur d'énumération.
ALTER TYPE "AuditAction" ADD VALUE 'SETTINGS_UPDATED';
