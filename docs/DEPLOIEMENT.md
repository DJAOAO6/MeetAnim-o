# Déployer 1002 Pattes en production

*Procédure réelle au 20 octobre 2026 (audit 2026-10, `EXP-03`, `EXP-04`). Elle remplace `scripts/deploy-iridflow.mjs`, qui poussait vers un dépôt Gitea que le site ne suit plus.*

## Comment le site est construit

- Le site Iridflow `site_ucytdox1` (`https://app.1002pattes.fr`) tire la branche **`master` du dépôt GitHub** `DJAOAO6/MeetAnim-o`.
- **Une poussée sur GitHub ne déclenche pas le déploiement** : il faut le lancer (`deploy_site`), ce qui prend environ 4 minutes.
- Au démarrage du conteneur (`Dockerfile`, ligne `CMD`) : migrations (`prisma migrate deploy`), modèles de documents, premier administrateur si besoin, compte restreint de la base (`scripts/runtime-role.mjs`), puis le serveur. **Sans la seconde barrière, le serveur refuse de démarrer** (`src/lib/db-barrier.ts`) ; issue de secours : `ALLOW_INACTIVE_DB_BARRIER=1`.

## Les étapes

1. **Intégration continue verte** sur le commit à déployer (GitHub › Actions) : typage, lint, tests unitaires, cloisonnement, parcours critiques et non-régression de l'audit.
2. **Sauvegarde de la base**, puis **relecture de la sauvegarde** (`create_backup` en `pre_deploy`, puis `verify_backup`). Noter son identifiant : c'est le retour arrière.
3. **Lancer le déploiement** (`deploy_site`). L'outil dépasse souvent son délai d'attente alors que la construction continue : ne pas relancer, attendre 4 à 5 minutes.
4. **Vérifier que la nouvelle version tourne vraiment.** Un redémarrage dans le journal ne le prouve pas : une construction en échec laisse l'ancienne version en ligne.
   - Le journal du site (`logs_site`) doit montrer : migrations appliquées, « seconde barrière active », et aucune ligne `[réglages] CRITIQUE`.
   - Comparer un élément propre au nouveau code dans une page servie (par exemple le bouton de `/login`).
   - `GET /api/health` doit répondre `200`.
   - En cas d'échec, le journal d'audit du projet Iridflow (`list_project_audit`) donne le message de construction.
5. **Retour arrière** : redéployer le commit précédent. Si une migration est passée entre-temps, restaurer la sauvegarde de l'étape 2, puis rejouer les effacements postérieurs (`docs/RGPD-EFFACEMENT.md`, §3).

## Règles pour que tout déploiement se défasse

- **Une migration reste compatible avec la version précédente du code** : ajouter une colonne ou une valeur, jamais renommer ni supprimer dans le même déploiement que le code qui l'utilise. Les migrations du 20 octobre (`SETTINGS_UPDATED`, `reminderClaimedAt`) sont purement additives.
- **Le serveur garde les fichiers supprimés du dépôt** (constaté le 19 octobre) : il n'applique que les ajouts et modifications. Ne jamais renommer un fichier en gardant le même nom avec une autre extension (`.ts` → `.tsx`) : l'ancien resterait et serait chargé en priorité. Supprimer un fichier ne l'efface pas du serveur ; c'est sans conséquence s'il n'est plus importé.

## Surveillance

- Une sonde externe (par exemple un service de surveillance gratuit) interroge `https://app.1002pattes.fr/api/health` toutes les 5 minutes et prévient par e-mail quand la réponse n'est plus `200`.
- Le détail des contrôles s'obtient avec l'en-tête `Authorization: Bearer <CRON_SECRET>`, et s'affiche en tête de `/plateforme`.
