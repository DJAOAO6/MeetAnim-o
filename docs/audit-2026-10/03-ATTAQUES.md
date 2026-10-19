# Audit 2026-10 — Phase 3 : simulation d'attaque (boîte noire)

*Établi le 19 octobre 2026 sur le commit `6e7e728`. Essais lancés le 9 octobre, relancés à l'identique le 19 octobre avec le même résultat.*

**Cible.** Uniquement le serveur de test local (`http://localhost:3100`, démarré par `npm run test:e2e`) branché sur la base de test. Avant le premier essai, la cible a été affichée et contrôlée :

| Contrôle | Résultat |
|---|---|
| Hôte de la base | `localhost` |
| Nom de la base | `animeo_test` (se termine par `_test`, distinct de `animeo_dev`) |
| Marque de base de test | table `_TestDatabase` présente (posée par `scripts/test-db.mjs`) |
| Compte de connexion | ni super-utilisateur, ni dispensé du filtrage par ligne (`rolsuper = false`, `rolbypassrls = false`) : **la seconde barrière est active**, comme en production |
| Production | aucune requête vers `app.1002pattes.fr` ni vers la base Iridflow |
| Serveur de développement (port 3000) | non touché |

Aucun e-mail réel n'est parti (fournisseur de développement), aucun test de charge, aucun appel massif à un service tiers.

**Méthode.** Chaque essai est un test rejouable dans `tests/audit/attaque-*.spec.ts` (fichiers nouveaux ; aucun test existant n'a été modifié). Les actions du serveur sont appelées directement, avec leur identifiant tiré du JavaScript public, comme le ferait quelqu'un de l'extérieur : l'écran n'est jamais une protection. **Le verdict vient toujours de la base, jamais du message affiché.**

- Rejouer : `npm run test:e2e -- --project=setup` (rafraîchit la session de test), puis `npm run test:e2e -- tests/audit/attaque-*.spec.ts`.
- Un test **rouge** signale un défaut, pas une erreur du test (même règle que `tests/audit/audit-security.spec.ts`). Au 19 octobre : **10 verts, 1 rouge (`SEC-15`, défaut confirmé)**.
- Tout ce qui est créé porte le marqueur `AUDIT3` (espaces `org-audit-phase3-*`, comptes `audit-phase3-*@example.fr`) et est supprimé à la fin. Contrôle après exécution : 0 espace, 0 compte, 0 rendez-vous, 0 zone résiduels ; les réglages modifiés le temps d'un essai (bascules d'affichage, rôle du compte de test) sont revenus à leur valeur.

**Barrières.** « Application » = les contrôles du code (session, rôle, `currentDb()` qui ajoute le cabinet à chaque requête). « Base » = le filtrage par ligne de PostgreSQL (RLS), qui refuse ce qui n'appartient pas au cabinet de la connexion.

---

## Synthèse

| Profil | Essais | Réussis (défaut) | Bloqués | Barrière qui a tenu |
|---|---|---|---|---|
| 1. Visiteur anonyme | 2 | 1 (`SEC-15`) | 1 | Framework (fonction non exposée) |
| 2. Client d'un cabinet | 3 (hérités, rejoués) | 0 | 3 | Application et base |
| 3. Professionnel A contre B | 3 | 1 partiel (`SEC-10`) | 2 | **Base** seule pour `SEC-09` et `SEC-10` |
| 4. Secrétariat (élévation) | 1 (+ témoin) | 0 | 1 | Application |
| 5. Compte suspendu, session ancienne | 3 | 0 | 3 | Application |
| 6. Conditions de course | 4 | 2 (`SEC-01`) | 2 | Base pour la réservation ; rien pour le code 2FA |

**Ce qu'il faut retenir.**
1. **`SEC-01` est confirmé** : 20 codes envoyés en même temps → **12 examinés au lieu de 5**, et les renvois de code sont illimités. La double authentification ne résiste pas à quelqu'un qui a le mot de passe.
2. **`SEC-15` est confirmé** : le téléphone que le professionnel a choisi de masquer est dans la page reçue par n'importe quel visiteur.
3. **Deux constats ne tiennent que grâce à la base** (`SEC-09`, `SEC-10`). Sans elle (`SEC-08`), ce seraient des fuites entre cabinets. Et `SEC-09` est, dès aujourd'hui, un **défaut bloquant** : un deuxième cabinet ne peut pas créer de zone avec des communes.
4. **`SEC-11` n'est pas atteignable** depuis un navigateur : il passe de P1 à P3 (défense en profondeur).

---

## Profil 1 — Visiteur anonyme

`tests/audit/attaque-visiteur-anonyme.spec.ts`

**1.1 · Lire le téléphone et l'adresse masqués** — *réussie* → `SEC-15` **confirmé**
- *Tenté* : les bascules « afficher mon téléphone » et « afficher mon adresse » décochées en base, puis simple chargement de `/reserver/pauline-faucillon` sans compte, comme « afficher le code source ».
- *Résultat* : le numéro masqué (`06 12 34 56 78`, donnée fictive de la base de test) est présent dans le HTML reçu. Sortie du test : `Expected substring: not "06 12 34 56 78"`.
- *Barrière* : aucune. Le masquage n'est fait que par l'écran (`professional-sidebar.tsx`), le serveur envoie tout (`src/lib/public-professional.ts:38-46`).
- *Limite de la preuve* : le test s'arrête à la première assertion en échec ; l'adresse est envoyée par le même objet (`public-professional.ts:38-43`) mais **n'a pas été constatée séparément** dans la page.

**1.2 · Appeler sans compte les fonctions de lecture qui se rabattent sur le cabinet unique** — *bloquée* → `SEC-11` **non exploitable**
- *Tenté* : recueillir l'identifiant de `getBusinessProfile`, `getAvailability`, `getReminderSettings`, `getServices`, `getPublicServices` dans le JavaScript de la page publique et de cinq pages de l'espace professionnel (agenda, bienvenue, paramètres, prestations, rappels).
- *Résultat* : aucun des cinq identifiants n'apparaît. Par lecture, aucun composant client ne les importe : elles ne sont appelées que par des composants serveur (`page.tsx`, `layout.tsx`).
- *Barrière* : le framework, qui ne publie que les actions référencées par du code client. Le test reste en place : il deviendra rouge le jour où l'une d'elles serait câblée dans un composant client.

## Profil 2 — Client d'un cabinet

Un client n'a pas de compte ni d'espace personnel : aucune page d'annulation, de confirmation ou de suivi par lien n'existe (recherche dans `src/app` et `src/lib`). Sa surface d'attaque est donc celle du visiteur (profil 1) plus le parcours de réservation, déjà couvert par `tests/audit/audit-security.spec.ts` (audit de pré-production). Ce fichier a été **rejoué sans modification** le 19 octobre : **7/7 verts**, dont :

| Essai | Résultat | Barrière |
|---|---|---|
| Deux visiteurs valident le même créneau au même instant | un seul rendez-vous | Base (verrou du jour, `lockDay`, `appointments-actions.ts:243`) |
| Deux réservations qui se chevauchent envoyées ensemble | une seule acceptée | Base |
| Demande refusée pour conflit | aucune fiche client orpheline | Application (transaction) |

Non essayé, faute de surface : usurper un autre client (il n'y a pas d'identité client à usurper).

## Profil 3 — Professionnel du cabinet A contre le cabinet B

`tests/audit/attaque-cloisonnement-pro.spec.ts`. Un cabinet B jetable, avec son propre compte, un client et un animal.

**3.1 · Le cabinet B crée une zone avec des communes** — *bloquée par la base seule* → `SEC-09` **confirmé**
- *Tenté* : connexion réelle au compte du cabinet B, puis `saveZoneAction` avec une commune.
- *Résultat* : la base refuse l'écriture — journal du serveur : `la nouvelle ligne viole la politique de sécurité au niveau ligne pour la table « City »`. Rien n'est enregistré : ni la commune chez le premier cabinet, ni la zone seule chez B (écriture imbriquée, une seule transaction).
- *Barrière* : **la base seule**. L'application, elle, demandait bien d'écrire la commune au nom de `org-1002-pattes` (valeur par défaut de la colonne, `prisma/schema.prisma`, modèle `City`).
- *Conséquence* : avec la base active, **tout nouveau cabinet est incapable de créer une zone avec des communes** — l'enregistrement échoue sur une erreur technique. Sans la base (`SEC-08`), les communes de B partiraient chez le premier cabinet.

**3.2 · Le cabinet A crée un rendez-vous rattaché à un client du cabinet B** — *réussie (écriture)* → `SEC-10` **confirmé**
- *Tenté* : `saveAppointmentAction` avec la session du cabinet A et les identifiants du client et de l'animal de B.
- *Résultat* : le rendez-vous est créé (`ok: true`), au cabinet A, avec `clientId` pointant vers le client de B. Aucune vérification n'a refusé l'identifiant étranger.
- *Barrière* : aucune à l'écriture (la clé étrangère vérifie que le client existe, pas qu'il est du même cabinet).

**3.3 · Le cabinet A relit la fiche de B à travers ce lien** — *bloquée*
- *Tenté* : `upcomingAppointmentsOfClientsAction([client de B])` avec la session du cabinet A.
- *Résultat* : `[]` — la fiche de B reste invisible.
- *Barrière* : application (`currentDb()` ajoute le cabinet à la lecture) et base. Le lien incohérent reste en base, sans fuite tant que la base filtre.

Rappel : les essais de forçage déjà en place (`tests/organization-isolation-actions.spec.ts` : modifier ou supprimer les fiches, tournées, rappels, comptes d'un autre cabinet) n'ont pas été refaits ici.

## Profil 4 — Compte Secrétariat qui tente une élévation

`tests/audit/attaque-elevation-secretariat.spec.ts`

**4.1 · Le secrétariat se donne lui-même le rôle administrateur** — *bloquée*
- *Témoin* : la même action, appelée par un administrateur, change bien un rôle (le canal d'appel fonctionne ; sans ce témoin, le refus ne prouverait rien).
- *Tenté* : connexion réelle au compte Secrétariat (double authentification comprise), puis appel direct de `setUserRole(<son propre id>, "ADMIN")` sans passer par l'écran d'administration.
- *Résultat* : rôle inchangé en base (`SECRETARY`).
- *Barrière* : application (`requireAdmin()`, `src/lib/admin/actions.ts:113`). Complète `tests/secretary-role-separation.spec.ts`, qui ne vérifiait que la page.
- *Observation* : le refus ne prend pas la forme d'une redirection HTTP : le serveur répond `200` avec la page générique « introuvable » de Next.js. Sans conséquence de sécurité ; à savoir pour les tests futurs.

## Profil 5 — Compte suspendu, session révoquée

`tests/audit/attaque-compte-suspendu.spec.ts`. Deux espaces jetables, un par cas.

**5.1 · Session ouverte, puis espace suspendu** — *bloquée*
- *Tenté* : connexion, suspension de l'espace en base, puis `createClientAction` avec le cookie toujours en main.
- *Résultat* : refusé dès la requête suivante, aucun client créé.
- *Barrière* : application (`getCurrentUser` relit l'espace à chaque requête, `src/lib/auth/dal.ts:82-83`), doublée par le refus d'écriture du client de l'espace (`src/lib/db.ts:113-121`).

**5.2 · Session révoquée, cookie inchangé** — *bloquée*
- *Tenté* : connexion, session marquée révoquée en base (équivalent d'une déconnexion faite ailleurs), puis `createClientAction` avec l'ancien cookie.
- *Résultat* : refusé, aucun client créé.
- *Barrière* : application (`dal.ts:67-68`).

**5.3 · Ancien jeton après déconnexion** — *bloquée* (essai hérité, `audit-security.spec.ts`, rejoué : vert). Pré-production `SEC-04` : **toujours corrigé**.

*Non essayés en direct, établis par lecture* : compte désactivé (`active = false` → refus, `dal.ts:76`) ; compte supprimé (sessions supprimées en cascade, `prisma/schema.prisma`, modèle `Session`) ; jeton antérieur à un changement de mot de passe (`dal.ts:89`).

## Profil 6 — Conditions de course

`tests/audit/attaque-concurrence.spec.ts`. Un espace jetable avec double authentification.

**6.1 · Vingt codes faux envoyés au même instant** — *réussie* → `SEC-01` **confirmé**
- *Tenté* : une vraie soumission du formulaire de code, interceptée pour en reprendre le corps exact, puis rejouée 20 fois en parallèle sur la même session en attente.
- *Résultat* (relevé du 19 octobre) : `20 essais simultanés : 12 traités comme « code incorrect », 8 refusés pour limite atteinte, compteur final 12`. La limite est de 5 : **sept essais de trop pour un seul code**. Le compteur final est exact (l'incrément est atomique) ; c'est le **contrôle** qui juge sur une valeur périmée (`two-factor-actions.ts:31` lit, `:40` contrôle, `:46` écrit).
- *Barrière* : aucune.
- *Note de méthode* : avec vingt onglets de navigateur, le temps de chargement espaçait les essais et la course ne se produisait pas (5 sur 20, trois fois). Le défaut n'apparaît qu'avec des requêtes réellement simultanées — ce que fait un script.

**6.2 · Renvoyer un nouveau code sans limite** — *réussie* → `SEC-01` **confirmé**
- *Tenté* : `resendTwoFactorCode` six fois de suite.
- *Résultat* : six nouveaux codes créés, aucun refus. Chaque renvoi remet le compteur à zéro et prolonge l'attente de 10 minutes.
- *Effet combiné avec 6.1* : autant d'essais qu'on veut. Le seul frein restant est l'e-mail reçu par la victime à chaque renvoi.

**6.3 et 6.4 · Double réservation au même instant** — *bloquées* (essais hérités, profil 2).

---

## Mise à jour des constats de la phase 2

| Constat | Phase 2 | Après attaque | Niveau | Preuve |
|---|---|---|---|---|
| `SEC-01` Code 2FA devinable | à prouver | **Confirmé** : 12 essais pour 5 permis, renvois illimités | **P1** (inchangé) | 6.1, 6.2 |
| `SEC-08` Seconde barrière facultative au démarrage | P1 | **Aggravé** : c'est elle seule qui bloque `SEC-09` et `SEC-10` | **P1** (inchangé) | 3.1, 3.2 |
| `SEC-09` Communes au nom du premier cabinet | à prouver | **Confirmé**, contenu par la base ; **défaut fonctionnel immédiat** pour tout nouveau cabinet | **P1** (inchangé) | 3.1 |
| `SEC-10` Identifiants étrangers non revérifiés | à prouver | **Confirmé** à l'écriture, contenu à la lecture | P2 (inchangé) | 3.2, 3.3 |
| `SEC-11` Lectures sans compte | à prouver | **Non atteignable** depuis un navigateur | **P1 → P3** (défense en profondeur) | 1.2 |
| `SEC-15` Téléphone et adresse masqués envoyés | à prouver | **Confirmé** (téléphone constaté ; adresse par lecture) | **P1** (inchangé) | 1.1 |

Aucun nouveau constat P0. Aucune attaque n'a permis de lire ou de modifier les données d'un autre cabinet **tant que la base filtre** ; c'est pourquoi `SEC-08` reste la priorité structurelle.

## Ce qui n'a pas été essayé

- Le build de production : les essais tournent sur le serveur de développement (`next dev`), seul à publier le nom des actions. Le comportement en production (messages d'erreur détaillés, notamment celui de 3.1) **n'est pas vérifié**.
- Le serveur frontal de l'hébergeur (`SEC-02`, adresse IP lue dans `x-forwarded-for`) : hors du local, **non vérifié**.
- L'assistance de la plateforme en écriture (`SEC-12`) : couverte par `tests/platform-assistance.spec.ts`, non rejouée.
- Les dépendances vulnérables (`SEC-26`) : aucun essai d'exploitation, par principe (pas d'attaque sur des failles de bibliothèque connues).
