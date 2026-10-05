-- Fiche animal (chantier C3) : le sexe prend l'une de quatre valeurs —
-- Mâle, Mâle castré, Femelle, Femelle stérilisée —, la stérilisation en fait
-- partie. Pour un cheval, elles se lisent Étalon, Hongre, Jument à l'écran.
-- Migration de données seulement : les formes déjà reconnues sont ramenées à
-- ces valeurs ; toute autre saisie reste telle quelle (acceptée tant qu'on ne
-- la change pas).
UPDATE "Animal" SET "sex" = 'Mâle castré' WHERE lower(trim("sex")) IN ('hongre', 'mâle castré', 'male castre', 'mâle castre', 'male castré', 'castré', 'castre');
UPDATE "Animal" SET "sex" = 'Mâle' WHERE lower(trim("sex")) IN ('m', 'mâle', 'male', 'étalon', 'etalon', 'mâle entier', 'male entier');
UPDATE "Animal" SET "sex" = 'Femelle stérilisée' WHERE lower(trim("sex")) IN ('femelle stérilisée', 'femelle sterilisee', 'stérilisée', 'sterilisee');
UPDATE "Animal" SET "sex" = 'Femelle' WHERE lower(trim("sex")) IN ('f', 'femelle', 'jument');
