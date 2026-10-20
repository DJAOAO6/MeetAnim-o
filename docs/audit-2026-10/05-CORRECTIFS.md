# Audit 2026-10 — Correctifs : où en est chaque constat

*Établi le 20 octobre 2026, après les chantiers de correction menés les 19 et 20 octobre sur la demande de Loïc (« règle tous les problèmes »). Chaque ligne renvoie au commit qui corrige et au test qui le prouve. Rien n'est encore déployé : la production tourne sur `d5d3ee3`.*

**Décisions prises par Loïc le 19 octobre** : suppression d'un client = historique anonymisé, rendez-vous à venir annulés, comptes rendus conservés ; pas de démarrage en production sans la seconde barrière ; clients inactifs depuis 3 ans signalés, jamais supprimés d'office ; purges automatiques du journal, des sessions, des invitations et des demandes jamais acceptées.

Statuts : **corrigé** (code + test) · **partiel** (le plus grave est fait, un reste est nommé) · **ouvert** (pas encore traité dans le code) · **décision** (attend un choix de Loïc) · **hors code** (document ou démarche).

---

## En clair, pour Loïc

- **Toutes les failles prouvées par l'audit sont corrigées et couvertes par un test** : code de double authentification devinable, téléphone et adresse masqués envoyés aux visiteurs, liens entre cabinets, suppression d'un client qui n'effaçait rien, annuaire des clients envoyé à chaque page, bibliothèques à failles critiques (`npm audit` : 0).
- **En route, quatre défauts de plus ont été trouvés et corrigés** : n'importe quel compte pouvait finaliser le compte rendu d'un autre ; la liste des modèles de document n'était pas filtrée par cabinet ; des horaires incomplets faisaient planter la page de réservation ; le correctif « pas de démarrage sans seconde barrière » cassait lui-même la construction (repéré avant tout envoi).
- **Les cinq tests rouges permanents sont verts** : ils dépendaient des données, de l'heure ou d'un bouton factice, jamais d'une panne de l'application.
- **Ce qui reste n'est presque plus du code** : les textes juridiques (CGU, contrat de sous-traitance, mentions légales), le registre, la procédure en cas de fuite, quelques réglages à confirmer chez l'hébergeur, et trois décisions (ci-dessous).
- **Rien n'est en ligne** tant que tu ne demandes pas le déploiement. Deux migrations, purement additives, partiront avec.

---

## 1. Phase 1 — État fonctionnel

| Constat | Statut | Ce qui a été fait | Commit | Preuve |
|---|---|---|---|---|
| `FONC-01` boutons factices de la fiche animal | corrigé | Carte factice retirée : les vrais comptes rendus ont déjà leur section dans la fiche | `a80b2b5`, (ce lot) | `notifications-toasts.spec.ts` (réécrit), `documents-integrations.spec.ts` |
| `FONC-02` pas de page d'erreur | corrigé | `not-found`, `error`, `global-error` (signature Next 16) | `a80b2b5` | essais de la phase 3 (« Page introuvable ») |
| `FONC-03` pas de « Mon compte » | corrigé | Mot de passe, double authentification, appareils | `59c84fa` | `tests/audit/mon-compte.spec.ts` |
| `FONC-04` e-mail qui tombe en silence | partiel | Échecs Mailjet comptés et visibles (santé, `/plateforme`) ; **reste** : code de secours de la double authentification | `9b6735a` | `tests/audit/sante.spec.ts` |
| `FONC-05` le professionnel ne récupère pas ses données | partiel | Export d'un client depuis sa fiche ; **reste** : export de l'espace entier par son administrateur | `7aaafaf` | `tests/audit/export-client.spec.ts` |
| `FONC-06` pas d'annulation en ligne par le client | ouvert | P3, à concevoir (nouvelle porte d'entrée) | — | — |
| `FONC-07` Google Agenda en panne sans alerte | ouvert | La santé du système ne couvre pas encore Google | — | — |
| `FONC-08` vérifications en attente invisibles | corrigé | En tête de `/plateforme` | `9b6735a` | — |
| `FONC-09` photos par défaut chargées depuis Unsplash | corrigé | Servies par le site (`public/photos-prestations`) | (ce lot) | — |
| `FONC-10` rappel perdu sur arrêt du serveur | corrigé | « Réservé » distinct d'« envoyé », reprise après une heure | `f555f22` | `appointment-reminders.spec.ts` |
| `TEST-01` six tests rouges permanents | corrigé | Tests autonomes (données, heure, en-tête collant) ; l'appui long de l'agenda tactile évite aussi l'heure de départ d'une tournée | `853275a`, `a80b2b5`, (ce lot) | suite complète |
| *Trouvé en route* : pastille du jour illisible en thème sombre (2:1) | corrigé | Même couleur d'action que les boutons | (ce lot) | `accessibility-dashboard.spec.ts` |
| `TEST-02` parcours critiques sans test | corrigé | Réinitialisation, export plateforme, retour Google | (ce lot) | `tests/audit/parcours-critiques.spec.ts` |
| `TEST-03` suite complète hors intégration continue | corrigé, à vérifier | Parcours critiques et `tests/audit` lancés à chaque poussée | (ce lot) | vérifié au prochain push |
| `EXP-01` sauvegardes et restauration | hors code | Rétention constatée : 30 jours ; **restauration jamais essayée** | — | `docs/RGPD-EFFACEMENT.md` §3 |
| `EXP-02` aucune alerte | partiel | `/api/health` ; **reste** : poser la sonde externe | `9b6735a` | `tests/audit/sante.spec.ts` |
| `EXP-03` déploiement irréversible | corrigé (procédure) | Règle des migrations compatibles, sauvegarde avant déploiement | (ce lot) | `docs/DEPLOIEMENT.md` |
| `EXP-04` procédure de déploiement périmée | corrigé | Procédure réelle écrite ; script Gitea retiré | (ce lot) | `docs/DEPLOIEMENT.md` |
| `EXP-05` réglages indispensables non vérifiés | corrigé | Listés au démarrage, sur `/plateforme` et `/api/health` | `9b6735a` | — |
| `EXP-06` restes de configuration | partiel | `vercel.json` retiré ; `AUTH_EMAIL` gardé (sert au peuplement local) | `9b6735a` | — |

## 2. Phase 2 et 3 — Sécurité

| Constat | Statut | Ce qui a été fait | Commit | Preuve |
|---|---|---|---|---|
| `SEC-01` code 2FA devinable | corrigé | Essai compté avant d'être jugé ; 10 essais et 3 renvois par quart d'heure | `ba87710` | `attaque-concurrence.spec.ts` (1 essai jugé sur 20, contre 12) |
| `SEC-02` adresse IP falsifiable | partiel | Lecture unique (`X-Real-IP`, sinon dernier élément) ; **à confirmer avec l'hébergeur** | `c76e56b` | — |
| `SEC-03` un secret pour trois usages | partiel | Longueur et secret propre au compte restreint contrôlés ; **reste** : rotation à deux secrets | `9b6735a` | — |
| `SEC-04` double authentification facultative | partiel | Chacun l'active lui-même ; **décision** : l'imposer aux administrateurs ? | `59c84fa` | `mon-compte.spec.ts` |
| `SEC-05` temps de réponse révélateur | corrigé | Comparaison factice ; e-mail envoyé après la réponse | `c76e56b` | — |
| `SEC-06` blocage d'un compte par un tiers | corrigé | Seuls les échecs comptent par adresse | `c76e56b` | — |
| `SEC-07` durcissements de session | partiel | Appareils, déconnexion des autres, liens de réinitialisation annulés, flux d'agenda tracé ; **reste** : expiration d'inactivité, préfixe `__Host-`, jeton du flux en clair | `c76e56b`, `59c84fa` | `parcours-critiques.spec.ts` |
| `SEC-08` démarrage sans seconde barrière | corrigé | Refus de démarrer en production (issue de secours documentée) | `b752154`, `30873a8` | `tests-unit/barrier-policy.test.ts` |
| `SEC-09` communes au nom du premier cabinet | corrigé | Cabinet posé explicitement | `58c24fc` | `attaque-cloisonnement-pro.spec.ts` |
| `SEC-10` identifiants étrangers enregistrés | corrigé | Relus dans le cabinet avant écriture | `58c24fc` | `attaque-cloisonnement-pro.spec.ts` |
| `SEC-11` lectures sans compte | corrigé | Plus de repli sur « le seul cabinet » ; la proposition de tournée de la page publique lit les horaires du cabinet de son lien | (ce lot) | `tour-suggestions.spec.ts`, suite complète |
| `SEC-12` assistance en écriture | partiel | Le professionnel est prévenu à chaque assistance ; **décision** : lecture seule par défaut ? | `f58b09d` | `tests-unit/email-information.test.ts` |
| `SEC-13` dernier administrateur, rôle non validé | corrigé | Garde-fou étendu, rôle validé, message neutre | `c76e56b` | — |
| `SEC-14` le secrétariat voit tout | décision | Fermer les données de soin au secrétariat ? | — | — |
| `SEC-15` téléphone et adresse masqués envoyés | corrigé | Vidés côté serveur | `81d2b58` | `attaque-visiteur-anonyme.spec.ts` |
| `SEC-16` emploi du temps lisible | corrigé | Fenêtre de réservation seulement | `4ac92f7` | `tests/audit/surface-publique.spec.ts` |
| `SEC-17` pas de protection contre les robots | partiel | Plafond de 30 demandes par cabinet et par jour ; **reste** : défi anti-robot | `ab77f0c` | `tests/audit/reservation-protections.spec.ts` |
| `SEC-18` flux d'agenda sans limite | partiel | 3 mois en arrière, 18 mois en avant ; **reste** : flux sans nom de client | `4ac92f7` | `surface-publique.spec.ts` |
| `SEC-19` recherche d'adresse ouverte | corrigé | Limite par adresse IP | `4ac92f7` | — |
| `SEC-21` formules dans l'export | corrigé | Cellules gardées en texte | `4ac92f7` | `tests-unit/deletion-plan.test.ts` |
| `SEC-22` images non vérifiées | corrigé | Type, signature et taille vérifiés ; **reste** : limite globale de 6 Mo (le framework ne la règle pas action par action) | `aecda77` | `tests-unit/validate-image.test.ts` |
| `SEC-23` mots de passe de test publics | partiel | Le peuplement refuse toute base non locale ; **reste** : voir `RGPD-15` | `ab77f0c` | — |
| `SEC-24` secret comparé caractère par caractère | corrigé | Temps constant | `c76e56b` | — |
| `SEC-26` bibliothèques à failles critiques | corrigé | `next` 16.4.2, `maplibre-gl` 6 ; `npm audit --omit=dev` : 0 | `5377ad3`, `6af641e` | construction de production, tests de la carte |
| `SEC-27` aucun en-tête de sécurité | partiel | En-têtes posés par l'application ; **reste** : politique stricte des scripts (nonces) | `4ac92f7` | `surface-publique.spec.ts` |
| `SEC-28` conteneur en administrateur | ouvert | Reporté : demande de pouvoir construire l'image pour la tester | — | — |
| `SEC-29` code de connexion au journal | corrigé | Ni sujet ni code journalisés | `c76e56b` | — |
| `SEC-30` journal sans limite | corrigé | 12 mois ; adresse IP fiabilisée | `250711c`, `c76e56b` | `tests/audit/conservation.spec.ts` |
| `SEC-31` actions sensibles sans trace | corrigé | Réglages visibles des clients journalisés | `f555f22` | — |
| `SEC-20`, `SEC-25` | information | Rien à corriger | — | — |
| *Trouvé en route* : finalisation d'un compte rendu par un autre compte | corrigé | Réservée à l'auteur ou à un compte qui gère les documents | `aecda77` | — |
| *Trouvé en route* : modèles de document non filtrés par cabinet | corrigé | Communs + ceux de l'espace | `58c24fc` | — |

## 3. Phase 4 — Protection des données

| Constat | Statut | Ce qui a été fait | Commit | Preuve |
|---|---|---|---|---|
| `RGPD-01` pas de CGU ni de contrat de sous-traitance | hors code | Textes à rédiger ; la case d'acceptation sera ajoutée quand ils existeront | — | — |
| `RGPD-02` pas de mentions légales | hors code | Il faut l'identité de l'éditeur et de l'hébergeur pour écrire la page | — | — |
| `RGPD-03` suppression d'un client incomplète | corrigé | Règle de Loïc appliquée | `f0fa7d6` | `tests/audit/rgpd-donnees-client.spec.ts` |
| `RGPD-04` politique de confidentialité inexacte | corrigé, à valider | Texte fidèle au logiciel | `f58b09d` | — |
| `RGPD-05` case « J'accepte » | décision | Base légale à choisir (vraisemblablement 6.1.b) | — | — |
| `RGPD-06` aucune durée de conservation | corrigé, à valider | Purges et signalement | `250711c` | `tests/audit/conservation.spec.ts` |
| `RGPD-07` pas d'export d'un client | corrigé | Bouton sur la fiche | `7aaafaf` | `tests/audit/export-client.spec.ts` |
| `RGPD-08` annuaire envoyé à chaque page | corrigé | Chargé à la demande | `334dd16` | `tests/audit/rgpd-donnees-client.spec.ts` |
| `RGPD-09` sous-traitants non établis | partiel | Photos servies par le site ; **reste** : liste et contrats (hors code), fonds de carte OpenStreetMap | (ce lot) | — |
| `RGPD-10` Google reçoit les coordonnées | corrigé | Ni téléphone ni e-mail | `f555f22` | — |
| `RGPD-11` assistance sans information | corrigé | E-mail aux administrateurs | `f58b09d` | `tests-unit/email-information.test.ts` |
| `RGPD-12` photos d'animaux dans le navigateur | corrigé | En base, reprise des anciennes | `a80b2b5` | `tests/audit/photo-animal.spec.ts` |
| `RGPD-13` ni détection ni procédure de fuite | partiel | Santé du système ; **reste** : procédure écrite (hors code) | `9b6735a` | — |
| `RGPD-14` pas de registre | hors code | — | — | — |
| `RGPD-15` identité nommée dans le dépôt public | décision | Accord de la personne, données fictives, ou dépôt privé | — | — |
| `RGPD-16` rattachement par e-mail seul | corrigé | E-mail et nom | `ab77f0c` | `reservation-protections.spec.ts` |
| `RGPD-17` pas d'opposition aux rappels | partiel | Mention dans les messages ; **reste** : marque « ne plus contacter » sur la fiche | `f58b09d` | `tests-unit/email-information.test.ts` |

---

## 4. Ce qui attend Loïc

**Trois décisions** : imposer la double authentification aux administrateurs (`SEC-04`) ; assistance en lecture seule par défaut (`SEC-12`) ; fermer les données de soin au secrétariat (`SEC-14`). Et la base légale de la réservation (`RGPD-05`), avec un juriste.

**Documents** : CGU/CGV et contrat de sous-traitance (`RGPD-01`), identité pour les mentions légales (`RGPD-02`), registre des traitements (`RGPD-14`), procédure en cas de fuite (`RGPD-13`), validation des durées de conservation et de la politique de confidentialité. Données de démonstration au nom d'une personne réelle (`RGPD-15`).

**Chez l'hébergeur** : en-tête qui porte l'adresse IP réelle (`SEC-02`), localisation des serveurs et des sauvegardes, fréquence des sauvegardes, un essai de restauration (`EXP-01`), une sonde sur `/api/health` (`EXP-02`).

**Déploiement** : sur ta demande, en suivant `docs/DEPLOIEMENT.md`. Deux migrations additives partiront avec (`SETTINGS_UPDATED`, `reminderClaimedAt`).
