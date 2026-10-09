# Audit 2026-10 — Phase 1 : ce qu'il reste à faire pour que le logiciel soit fonctionnel

*Établi le 9 octobre 2026 sur le commit `29b275b`. Lecture du code et résultats des tests ; aucune attaque, aucune modification du logiciel.*

**Sources des preuves.**

- Le code, cité `fichier:ligne`.
- Les tests unitaires : 410 sur 410 réussis (`npm run test:unit`, 9 octobre).
- La suite de bout en bout complète, lancée le 9 octobre sur le poste de développement (base locale), commit `18e52a8` : **471 tests, 454 réussis, 6 échecs, 6 ignorés, 5 non lancés**. Les chiffres par pilier ci-dessous en viennent.
- Ce qui n'a pas pu être vérifié depuis le dépôt (réglages de l'hébergeur, variables réellement posées en production) est noté « non vérifié ».

---

## En clair, pour Loïc

**Le cœur du logiciel fonctionne de bout en bout** : un professionnel invité crée son espace, règle ses horaires et ses prestations, reçoit des réservations en ligne, tient son agenda, ses fiches, ses tournées, ses rappels et ses comptes rendus. Quinze des seize piliers sont réellement branchés jusqu'à la base, et couverts par des tests.

**Ce qui manque n'est pas dans les écrans, c'est autour** :

1. **Personne n'est prévenu quand quelque chose casse.** Pas d'alerte, pas de page d'erreur soignée, pas de tableau de santé. Une panne se découvre quand un client appelle.
2. **Rien ne prouve qu'une sauvegarde se restaure.** Les durées de conservation sont encore « à compléter » dans la documentation, et aucun essai de restauration n'est consigné.
3. **Un déploiement ne se défait pas.** La base est modifiée au démarrage de la nouvelle version ; revenir en arrière demande une restauration.
4. **Tout repose sur l'e-mail, sans filet.** Si l'envoi tombe, la double authentification et le mot de passe oublié ne marchent plus, et l'écran continue d'afficher « e-mail envoyé ».
5. **Trois boutons de la fiche animal ne font rien** (« Téléverser un document », « Voir tous les documents », ouverture d'un document) : ils affichent « sera ajouté ici ».
6. **Les tests complets ne tournent que sur votre poste.** L'intégration continue ne lance que le cloisonnement entre cabinets.

Aucune fonction centrale n'est cassée. **Il n'y a pas de P0 fonctionnel** ; les P0 éventuels viendront de la sécurité (phases 2 et 3) et de la conformité (phase 4).

---

## 1. État par pilier

Statuts : **fonctionnel** (de l'écran à la base, testé) · **partiel** (branché, avec un manque qui gêne) · **décoratif** (l'écran existe, rien derrière) · **absent**.

| # | Pilier | Statut | Tests de bout en bout (9 oct.) |
|---|---|---|---|
| 1 | Authentification et comptes | fonctionnel | 2 specs, 13 réussis |
| 2 | Onboarding d'un nouveau cabinet | fonctionnel | 9 specs avec la plateforme, 35 réussis, 3 ignorés |
| 3 | Agenda et rendez-vous | fonctionnel | 19 specs, 61 réussis, **3 échecs** |
| 4 | Disponibilités et moteur de créneaux | fonctionnel | 5 specs, 13 réussis |
| 5 | Réservation publique | fonctionnel | 10 specs, 32 réussis |
| 6 | Clients et animaux | fonctionnel, **documents d'animal décoratifs** | 7 specs, 19 réussis |
| 7 | Import de clients | fonctionnel | 1 spec, 5 réussis |
| 8 | Tournées et carte | fonctionnel | 32 specs, 82 réussis |
| 9 | Rappels | fonctionnel (envoi des relances manuel, par choix) | 2 specs, 3 réussis, **1 échec**, 3 ignorés |
| 10 | Documents (Studio) | fonctionnel | 23 specs, 94 réussis |
| 11 | Prestations | fonctionnel | 1 spec, 2 réussis |
| 12 | Statistiques | fonctionnel, peu testé | 1 spec, 2 réussis |
| 13 | Intégrations calendrier | **partiel** | 1 spec, 2 réussis |
| 14 | Notifications et e-mails | fonctionnel si Mailjet est configuré | 2 specs, 12 réussis, **2 échecs** |
| 15 | Paramètres | fonctionnel | 11 specs, 36 réussis |
| 16 | Plateforme | fonctionnel, export non testé | (compté avec le pilier 2) |

### 1. Authentification et comptes — fonctionnel

- **Chemin** : `/login` → `login` (`src/lib/auth/actions.ts:31`) → table `Session` (`src/lib/auth/session-store.ts:10`) ; code à 6 chiffres par e-mail (`two-factor-actions.ts:19`) ; mot de passe oublié (`password-reset-actions.ts:23`, `:58`) ; comptes de l'équipe créés par l'administrateur du cabinet (`src/lib/admin/actions.ts:59`), qui reçoivent un lien pour choisir leur mot de passe.
- **Tests** : `tests/auth-login-2fa.spec.ts` (connexion, double authentification, verrouillage), `tests/audit/audit-security.spec.ts:136` (jeton refusé après déconnexion).
- **Ce qui manque** : voir `FONC-03` (pas de changement de mot de passe une fois connecté), `FONC-04` (dépendance à l'e-mail), `TEST-02` (page de réinitialisation sans test).

### 2. Onboarding d'un nouveau cabinet — fonctionnel

- **Chemin** : invitation depuis `/plateforme` (`src/lib/platform/invitation-actions.ts:36`) → `/inscription/[token]` → `acceptInvitationAction` (`:110`) crée l'espace et son administrateur → assistant `/dashboard/bienvenue` (`src/lib/onboarding-actions.ts`) → pour un ostéopathe animalier, attente de la vérification du numéro RNA (`src/lib/verification-actions.ts`, `src/lib/platform/verification-actions.ts:19`) → la page de réservation s'ouvre.
- **Tests** : `tests/onboarding.spec.ts` (7 tests, dont « un professionnel invité ouvre son espace, le configure et reçoit sa première réservation », ligne 93).
- **Ce qui manque** : l'ouverture d'un espace dépend de deux gestes de Loïc (inviter, puis valider le numéro) ; c'est un choix, mais rien n'alerte si une demande de vérification attend (`FONC-08`). Aucune condition d'utilisation n'est présentée à l'inscription : traité en phase 4.

### 3. Agenda et rendez-vous — fonctionnel

- **Chemin** : `/dashboard/agenda` → `saveAppointmentAction` (`src/lib/appointments-actions.ts:418`), sous verrou par journée → `Appointment`. Demandes à plusieurs horaires, expiration automatique, clôture automatique des rendez-vous passés (`src/lib/scheduler/`).
- **Tests** : 19 specs. Trois échecs : `agenda-events.spec.ts:10`, `agenda-slot-selection.spec.ts:197`, `appointment-requests-cancel.spec.ts:35` (`TEST-01`).

### 4. Disponibilités et moteur de créneaux — fonctionnel

- **Chemin** : Paramètres et « Gérer les disponibilités » → `updateAvailabilityAction` (`src/lib/business-profile-actions.ts`) → `BusinessProfile.availability` ; créneaux bloqués (`blocked-slots-actions.ts`) ; calcul des créneaux publics (`src/lib/public-schedule.ts:47`, `src/lib/booking-validation.ts`).
- **Tests** : `availability-manager`, `availability-modes`, `exceptional-opening`, `schedule-calendar` ; tests unitaires `availability`, `appointment-buffers`, `exceptional-openings`.

### 5. Réservation publique — fonctionnel

- **Chemin** : `/reserver/[slug]` → `getPublicScheduleAction` → `submitPublicBookingAction` (`src/lib/appointments-actions.ts:1323`, validation zod, limitation de débit, verrou) → `Client`, `Animal`, `Appointment` → e-mails au client et au professionnel (`src/lib/email/templates.ts:269`, `:330`).
- **Tests** : 10 specs, plus trois tests de concurrence (`tests/audit/audit-security.spec.ts:97`, `:107`, `:123`).
- **Ce qui manque** : le client ne peut ni annuler ni déplacer son rendez-vous en ligne (`FONC-06`).

### 6. Clients et animaux — fonctionnel, sauf les documents d'animal

- **Chemin** : `/dashboard/clients` → `src/lib/clients-actions.ts` (créer, modifier, archiver, restaurer, supprimer) → `Client`, `Animal`, `AnimalPlace`.
- **Tests** : 7 specs (`client-animal-crud`, `clients-archive`, `clients-bulk-delete`, `animal-places`…).
- **Décoratif** : la carte « Documents » de la fiche animal (`FONC-01`).
- **Ce qui manque** : exporter les données d'un seul client à sa demande — traité en phase 4.

### 7. Import de clients — fonctionnel

- **Chemin** : `client-import-modal.tsx` → `src/lib/clients-import-actions.ts` (5 fonctions, dont l'annulation d'un import) → `ClientImport`, `Client`, `Animal`.
- **Tests** : `tests/clients-import.spec.ts` (5), `tests-unit/client-import.test.ts`.

### 8. Tournées et carte — fonctionnel

- **Chemin** : `/dashboard/tournees` et `/dashboard/carte` → `tour-runs-actions.ts`, `tours-actions.ts`, `map-views-actions.ts` → `TourRun`, `TourStop`, `Tour`, `Zone`.
- **Tests** : 15 specs de tournées, 17 de carte.
- **Repli assumé et affiché** : sans clé openrouteservice, les trajets sont estimés à vol d'oiseau et l'écran le dit (`src/components/tours/tour-run-editor.tsx`, « Estimation à vol d'oiseau »). Un client mal localisé est signalé comme tel (`Client.geocodePrecision`, détail « Localisation : % fiable »).

### 9. Rappels — fonctionnel

- **Chemin** : `/dashboard/rappels` → `src/lib/reminders-actions.ts` → `Reminder` ; e-mail de relance (`templates.ts:387`).
- **Deux mécanismes distincts** : le **rappel de rendez-vous** part tout seul, 24 ou 48 heures avant selon le réglage du cabinet, s'il est activé (`src/lib/scheduler/appointment-reminders.ts:33-38`) ; la **relance** d'un client à revoir est seulement *marquée* « à relancer » par la tâche de fond (`src/lib/scheduler/jobs.ts:21`), l'envoi reste un geste du professionnel.
- **Tests** : `reminders-flow`, `appointment-reminders`. Un échec : `running-dog-notification.spec.ts:38` (`TEST-01`).
- **Absent** : l'envoi par SMS (aucune trace dans `src/`).

### 10. Documents (Studio) — fonctionnel

- **Chemin** : `/dashboard/documents` → `src/lib/documents-actions.ts` (11 fonctions) → `StudioDocument` ; le PDF est fabriqué **dans le navigateur** (`src/components/documents/document-editor-view.tsx:8`, `:199`) puis enregistré en base (`finalizeDocumentAction`).
- **Tests** : 23 specs, 94 tests.
- **Ce qui manque** : envoyer le compte rendu au client depuis le logiciel (aucune fonction ne le fait ; le professionnel télécharge puis envoie lui-même).

### 11. Prestations — fonctionnel

- **Chemin** : `/dashboard/prestations` → `src/lib/services-actions.ts` → `Service`. **Tests** : `services-cards.spec.ts`.

### 12. Statistiques — fonctionnel, peu testé

- **Chemin** : `/dashboard/statistiques` (module `STATISTICS`, permission `VIEW_FINANCES`) → `src/lib/stats-actions.ts`, `src/lib/stats.ts` (requêtes réelles). **Tests** : 2 seulement (`TEST-03`).

### 13. Intégrations calendrier — partiel

- **Flux d'agenda (ICS)** : fonctionnel. `src/lib/calendar-actions.ts` → `User.icsFeedToken` → `/api/calendar/feed/[token]`. Test : `calendar-integrations-settings.spec.ts`.
- **Google Agenda** : le code est complet (`src/lib/calendar/google-calendar-provider.ts`, routes `connect` et `callback`), mais il dépend de trois réglages hors du code — `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `CALENDAR_TOKEN_ENCRYPTION_KEY` — et de la publication de l'application chez Google (`docs/GOOGLE-CALENDAR-SETUP.md`, §9). **Non vérifié** : si ces réglages sont posés en production. Aucun test ne parcourt la connexion réelle (`FONC-07`).

### 14. Notifications et e-mails — fonctionnel si Mailjet est configuré

- **Chemin** : `src/lib/email/provider.ts` (Mailjet) et 17 modèles (`src/lib/email/templates.ts`) ; cloche de l'en-tête (`src/components/dashboard/notifications-bell.tsx`).
- **Tests** : `notifications-bell` (réussi), `notifications-toasts` (2 échecs, `TEST-01`) ; tests unitaires `request-expiry-emails`, `verification-emails`.
- **Repli silencieux** : `FONC-04`.

### 15. Paramètres — fonctionnel

- **Chemin** : `/dashboard/parametres` → `business-profile-actions.ts`, `public-page-actions.ts`, `dashboard-layout-actions.ts`, `agenda-preferences-actions.ts`. **Tests** : 11 specs.

### 16. Plateforme — fonctionnel

| Fonction | Chemin | Test |
|---|---|---|
| Invitations | `src/lib/platform/invitation-actions.ts:36`, `:84` | `onboarding.spec.ts:76`, `:252` |
| Modules par espace | `module-actions.ts:19` | `onboarding.spec.ts:272` |
| Vérification du numéro RNA | `verification-actions.ts:19`, `:40` | `onboarding.spec.ts:400` |
| Suspension | `organization-actions.ts:29`, `:58` | `organization-suspension.spec.ts` |
| Suppression programmée et effacement | `organization-actions.ts:112`, `:180` ; `organization-deletion.ts:43` | `organization-deletion.spec.ts`, `organization-erasure-canary.spec.ts` |
| Export | `src/app/plateforme/export/[organizationId]/route.ts`, `organization-export.ts:65` | **aucun** (`TEST-02`) |
| Assistance | `assistance-actions.ts:31`, `:84` | `platform-assistance.spec.ts` |

---

## 2. Recherches particulières

### 2.1 Données de démonstration servies en production

- `src/data/` ne contient plus que des types, des libellés et des valeurs par défaut vides. Le profil d'un nouvel espace est vierge (`src/data/settings.ts:207-222`, `src/lib/blank-profile.ts`). **`DATA-02` de l'audit de pré-production (« une base neuve reçoit l'identité de Pauline Faucillon ») : corrigé.**
- Le conteneur ne lance que les modèles de documents et la création du premier administrateur (`Dockerfile`, ligne `CMD`) ; `prisma/seed.ts` n'est pas exécuté en production.
- Restent : les photos par défaut des prestations, chargées depuis Unsplash par le navigateur du visiteur (`src/data/service-photos.ts:7-11`, `FONC-09`) ; `src/data/normandy-cities.ts`, qui n'est plus importé nulle part (code mort).
- `prisma/seed.ts` et plusieurs tests portent l'identité d'une personne nommée (nom, lien de réservation, domaine d'e-mail). Le dépôt étant public, ce point est repris en phase 4.

### 2.2 Replis silencieux

| Repli | Comportement | Constat |
|---|---|---|
| E-mail sans Mailjet (`src/lib/email/provider.ts:47-52`) | En production, rien ne part ; seuls le destinataire masqué et le sujet vont au journal. Un avertissement est écrit **au démarrage** (`src/instrumentation.ts`). L'utilisateur, lui, voit « e-mail envoyé ». | `FONC-04` |
| Envoi Mailjet en échec à la création d'un compte (`src/lib/admin/actions.ts:100-104`) | L'erreur est avalée ; le lien reste affiché à l'administrateur. | acceptable, noté |
| Géocodage | La précision est enregistrée et affichée ; une adresse introuvable laisse le client hors carte, et l'écran le dit. | traité depuis septembre |
| Itinéraires sans clé openrouteservice | Estimation à vol d'oiseau, signalée à l'écran. | acceptable |
| Google Agenda en erreur | La dernière erreur est enregistrée (`CalendarConnection.lastError`) et affichée dans Paramètres (`integrations-settings-tab.tsx:121`). Rien ne prévient le professionnel s'il n'ouvre pas cet onglet. | `FONC-07` |
| Adresse du site absente (`NEXT_PUBLIC_APP_URL`) | 18 endroits retombent sur `http://localhost:3000` ; les liens des e-mails seraient alors faux. Le `Dockerfile` la fixe à la construction. | `EXP-05` |

### 2.3 Tâches de fond

- **Elles tournent sur l'hébergement actuel.** Le serveur démarre son propre planificateur, toutes les heures, en production (`src/instrumentation.ts`, `src/lib/scheduler/start.ts`). **`FONC-02` de l'audit de pré-production (« la tâche quotidienne n'est jamais déclenchée ») : corrigé.**
- **Redémarrage du conteneur** : le planificateur repart, premier passage deux minutes après (`start.ts:6`). Chaque tâche relit la base : rien n'est perdu, sauf un rappel réservé juste avant un arrêt brutal (`FONC-10`).
- **Deux instances en même temps** (le temps d'un déploiement) : pas de double envoi. Le rappel de rendez-vous est réservé en base par une écriture conditionnelle avant l'envoi (`appointment-reminders.ts:66-67`), libéré si l'envoi échoue (`:86`) ; l'expiration d'une demande n'annule que si elle est encore en attente (`expire-requests.ts:34`).
- **Un cabinet en échec n'arrête pas les autres** (`jobs.ts:62`, `Promise.allSettled`) ; les erreurs sont écrites au journal, sans adresse e-mail (`redactEmails`).
- `vercel.json` déclare encore une tâche planifiée Vercel qui ne sert plus (`EXP-06`).

### 2.4 Variables d'environnement

| Variable | Si elle manque |
|---|---|
| `DATABASE_URL` / `DB_URL` | le site ne démarre pas |
| `SESSION_SECRET` | toute connexion échoue (`src/lib/auth/session.ts:13`) |
| `MAILJET_API_KEY`, `MAILJET_API_SECRET`, `MAIL_FROM_ADDRESS` | aucun e-mail ne part, sans erreur visible (`FONC-04`) |
| `NEXT_PUBLIC_APP_URL` | liens des e-mails vers `localhost` (`EXP-05`) |
| `PLATFORM_ADMIN_EMAILS` | aucun compte de plateforme n'est désigné : plus personne ne peut inviter ni vérifier (`src/lib/platform/grants.ts:21-22`) |
| `CALENDAR_TOKEN_ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | la connexion Google Agenda échoue avec une erreur ; le reste fonctionne |
| `OPENROUTESERVICE_API_KEY` | trajets estimés à vol d'oiseau |
| `CRON_SECRET` | la route de déclenchement manuel répond 401 ; le planificateur interne n'en dépend pas |
| `RUNTIME_DB_SECRET` | repli sur `SESSION_SECRET` pour le mot de passe du compte restreint |
| `SUPPORT_EMAIL`, `VERIFICATION_NOTIFICATION_EMAIL`, `MAIL_REPLY_TO`, `MAIL_FROM_NAME` | valeurs par défaut ou message non envoyé — à préciser en phase 2 |

*Complément à la phase 0* : `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` sont lues par une fonction intermédiaire (`google-calendar-provider.ts:18`) et n'apparaissaient pas dans la liste des 30 variables. **Aucun contrôle au démarrage ne vérifie que les variables indispensables sont présentes**, hormis l'avertissement Mailjet (`EXP-05`).

### 2.5 Tests

| Suite | Résultat | Lancée en intégration continue |
|---|---|---|
| Unitaires (54 fichiers, 410 tests) | 410 réussis | oui |
| Cloisonnement (3 specs) | réussis | oui |
| Bout en bout complète (135 specs, 471 tests) | 454 réussis, 6 échecs | **non** — sur le poste de développement seulement (`.github/workflows/ci.yml`) |

Les six échecs étaient déjà là avant le 7 octobre (début du chantier précédent) : `agenda-events:10`, `agenda-slot-selection:197`, `appointment-requests-cancel:35`, `notifications-toasts:135` et `:150`, `running-dog-notification:38`. Trois dépendent des données présentes dans la base locale ou d'un bouton factice ; **la cause des deux tests d'agenda n'a pas été établie** (`TEST-01`).

Parcours critiques sans test : la page de réinitialisation du mot de passe, l'export d'un espace, la connexion réelle à Google, l'envoi réel d'un e-mail, le démarrage du conteneur (migrations, compte restreint), la restauration d'une sauvegarde (`TEST-02`).

### 2.6 Exploitation

| Sujet | État constaté | Constat |
|---|---|---|
| Sauvegardes | Aucune planification dans le dépôt. Les durées de conservation sont « à compléter » (`docs/RGPD-EFFACEMENT.md`, §3). **Non vérifié** : ce que l'hébergeur fait de lui-même. | `EXP-01` |
| Restauration | Aucun essai consigné. Une procédure existe pour rejouer les effacements après restauration (`scripts/replay-deletions.mjs`), pas pour la restauration elle-même. | `EXP-01` |
| Erreurs | Écrites sur la console du conteneur (33 appels `console.*` dans `src/`). Aucun outil de collecte ni d'alerte. | `EXP-02` |
| Supervision | Aucune route de santé, aucune sonde. | `EXP-02` |
| Pages d'erreur | Aucun `error.tsx`, `global-error.tsx` ni `not-found.tsx` dans `src/app/` : en cas d'erreur, l'utilisateur voit la page brute du framework. | `FONC-02` |
| Retour arrière | Les migrations s'appliquent au démarrage (`Dockerfile`, `prisma migrate deploy`) et ne se défont pas. Revenir à la version précédente après une migration demande une restauration. | `EXP-03` |
| Déploiement | Manuel. `npm run deploy` vise un dépôt distant qui n'est plus configuré (`scripts/deploy-iridflow.mjs`). | `EXP-04` |

---

## 3. Constats

### Fonctionnel

**`FONC-01` · P1 · Trois boutons de la fiche animal ne font rien**
- *En clair* : sur la fiche d'un animal, « Téléverser un document », « Voir tous les documents » et le clic sur un document affichent seulement un message « sera ajouté ici ». Un professionnel croira à une panne.
- *Preuve* : `src/components/clients/animal-side-cards.tsx:43`, `:60`, `:63`. La table `AnimalDocument` n'est écrite par aucun code de `src/` (recherche de `animalDocument.create|update|upsert` : aucun résultat hors du client généré).
- *Échec* : le professionnel clique, rien ne se passe ; deux tests s'appuient sur ce message (`notifications-toasts:135`, `:150`).
- *Correctif* : retirer la carte tant que la fonction n'existe pas, ou la brancher sur les comptes rendus du Studio, qui portent déjà les documents réels.
- *Effort* : S (retrait) ou M (branchement). *Audits précédents* : non relevé.

**`FONC-02` · P2 · Aucune page d'erreur ni de « page introuvable »**
- *En clair* : quand une page plante ou n'existe pas, l'utilisateur voit l'écran technique du framework, sans le logo ni un moyen de revenir.
- *Preuve* : `find src/app -name "error.tsx" -o -name "global-error.tsx" -o -name "not-found.tsx"` ne rend rien ; seul `src/app/dashboard/loading.tsx` existe.
- *Correctif* : trois fichiers (`error.tsx`, `global-error.tsx`, `not-found.tsx`) aux couleurs du produit, avec un lien de retour.
- *Effort* : S. *Audits précédents* : non relevé.

**`FONC-03` · P2 · Un compte ne peut pas changer son mot de passe ni activer sa double authentification lui-même**
- *En clair* : pour changer de mot de passe, il faut se déconnecter et passer par « mot de passe oublié ». La double authentification ne s'active que par l'administrateur du cabinet.
- *Preuve* : le mot de passe n'est écrit qu'à trois endroits — création par l'administrateur (`src/lib/admin/actions.ts:84`), réinitialisation (`password-reset-actions.ts:80`), invitation (`invitation-actions.ts:129`). `setUserTwoFactor` et `updateUserProfileAction` exigent `requireAdmin` (`admin/actions.ts:130`, `:141`).
- *Correctif* : une page « Mon compte » (mot de passe actuel requis, double authentification, sessions ouvertes).
- *Effort* : M. *Audits précédents* : l'absence de liste des sessions était notée (`SEC-04`) ; la révocation à la déconnexion est faite depuis.

**`FONC-04` · P1 · Si l'envoi d'e-mails tombe, la connexion se bloque sans que personne le sache**
- *En clair* : le code de connexion, le lien de mot de passe oublié, les confirmations de rendez-vous passent tous par un seul prestataire. S'il n'est pas configuré, l'écran dit « envoyé » et rien ne part.
- *Preuve* : `src/lib/email/provider.ts:47-52` (en production : un avertissement au journal, puis `return`) ; `src/instrumentation.ts` ne prévient qu'au démarrage.
- *Échec* : une variable Mailjet retirée ou mal saisie lors d'un changement de configuration : les comptes avec double authentification ne peuvent plus entrer, les clients ne reçoivent plus de confirmation, et le professionnel l'apprend par téléphone. Le cas d'une clé présente mais refusée par Mailjet n'a pas été vérifié dans cette phase.
- *Correctif* : refuser de démarrer en production sans Mailjet (ou afficher une alerte dans `/plateforme`), journaliser chaque échec d'envoi avec un compteur consultable, prévoir un code de secours pour la double authentification.
- *Effort* : M. *Audits précédents* : `SEC-08` — partiellement corrigé (le corps des e-mails ne part plus dans les journaux en production) ; le silence côté utilisateur reste.

**`FONC-05` · P2 · Un professionnel ne peut pas récupérer ses propres données**
- *En clair* : l'export complet d'un espace existe, mais seul le compte de plateforme (Loïc) peut le lancer. Un professionnel qui veut ses données, ou celles d'un client, doit le demander.
- *Preuve* : `src/app/plateforme/export/[organizationId]/route.ts:10` (`platformAccess`) ; `src/lib/csv-export.ts` n'est importé que par `organization-export.ts`.
- *Correctif* : ouvrir l'export à l'administrateur du cabinet pour son propre espace ; ajouter l'export d'un client (repris en phase 4).
- *Effort* : M. *Audits précédents* : « export des données d'un client : absent » (pré-production, §10) — toujours ouvert pour le client, fait pour l'espace entier.

**`FONC-06` · P3 · Le client ne peut ni annuler ni déplacer son rendez-vous en ligne**
- *En clair* : après avoir réservé, le client doit appeler ou répondre à l'e-mail.
- *Preuve* : aucun lien ni jeton d'annulation dans `src/` (recherche de `cancelToken`, `manageToken`, « annuler mon/votre rendez-vous » : aucun résultat) ; les 17 modèles d'e-mails n'en contiennent pas.
- *Correctif* : lien signé à usage limité dans l'e-mail de confirmation — à concevoir avec soin (c'est une porte d'entrée de plus, voir phase 3).
- *Effort* : M. *Audits précédents* : non relevé.

**`FONC-07` · P2 · Google Agenda : prêt dans le code, non vérifié en production, sans alerte**
- *En clair* : la synchronisation avec Google dépend de réglages faits chez Google et chez l'hébergeur. Si elle casse, l'erreur n'apparaît que dans un onglet des Paramètres.
- *Preuve* : `src/lib/calendar/google-calendar-provider.ts:18-22`, `:59`, `:81-82` ; `integrations-settings-tab.tsx:121` ; aucun test du retour OAuth (recherche de `google/callback` et `exchangeCodeForTokens` dans `tests/` : aucun résultat).
- *Correctif* : vérifier les trois variables et l'état de publication chez Google ; signaler une synchronisation en échec dans la cloche.
- *Effort* : S à M. *Audits précédents* : non relevé.

**`FONC-08` · P2 · Une demande de vérification peut attendre sans que personne soit prévenu**
- *En clair* : un nouvel ostéopathe ne peut ouvrir sa page de réservation qu'après validation de son numéro par la plateforme. Si l'e-mail d'alerte n'arrive pas, il attend.
- *Preuve* : l'alerte part vers `VERIFICATION_NOTIFICATION_EMAIL` (`src/lib/platform/verification-notify.ts:42` ; sans cette variable, aucune alerte ne part) par le même prestataire d'e-mails que `FONC-04`.
- *Correctif* : compteur des vérifications en attente en tête de `/plateforme`, et relance au-delà d'un délai.
- *Effort* : S. *Audits précédents* : fonction ajoutée depuis.

**`FONC-09` · P3 · Les photos par défaut des prestations viennent d'un site tiers**
- *En clair* : tant qu'un professionnel n'a pas mis sa propre photo, sa page de réservation affiche une image chargée depuis Unsplash. Si ce site change ou tombe, l'image disparaît ; et le navigateur de chaque visiteur le contacte (repris en phase 4).
- *Preuve* : `src/data/service-photos.ts:7-11`, importé par `location-service-steps.tsx` et `service-modal.tsx`.
- *Correctif* : héberger ces cinq images dans `public/`.
- *Effort* : S. *Audits précédents* : non relevé.

**`FONC-10` · P3 · Un rappel de rendez-vous peut être perdu si le serveur s'arrête au mauvais moment**
- *En clair* : le rappel est marqué « envoyé » juste avant l'envoi, pour éviter les doublons. Si le serveur est coupé entre les deux, ce rappel ne partira jamais.
- *Preuve* : `src/lib/scheduler/appointment-reminders.ts:66` (réservation) puis envoi ; la libération (`:86`) n'a lieu que si l'envoi lève une erreur.
- *Correctif* : distinguer « réservé » et « envoyé », et reprendre les réservations de plus d'une heure.
- *Effort* : S. *Audits précédents* : non relevé (mécanisme postérieur).

### Tests

**`TEST-01` · P2 · Six tests de bout en bout échouent de façon permanente**
- *En clair* : une suite qui a toujours six rouges habitue à les ignorer ; un vrai défaut peut s'y cacher.
- *Preuve* : suite du 9 octobre — `agenda-events:10`, `agenda-slot-selection:197`, `appointment-requests-cancel:35`, `notifications-toasts:135`, `:150`, `running-dog-notification:38`.
- *Cause* : `appointment-requests-cancel` et `running-dog-notification` supposent des données présentes dans la base locale ; `notifications-toasts` s'appuie sur le bouton factice de `FONC-01` ; **les deux tests d'agenda : cause non établie**.
- *Correctif* : rendre chaque test autonome (il crée ce dont il a besoin), élucider les deux tests d'agenda.
- *Effort* : M. *Audits précédents* : `TEST-01` de la pré-production (22 tests rouges) — réduit à 6.

**`TEST-02` · P2 · Des parcours critiques n'ont aucun test**
- *Preuve* : aucune spec ne cite `reinitialiser-mot-de-passe`, `plateforme/export`, `google/callback` ; rien ne teste le démarrage du conteneur ni une restauration.
- *Correctif* : un test par parcours ; pour le conteneur, une construction de l'image en intégration continue.
- *Effort* : M. *Audits précédents* : non relevé.

**`TEST-03` · P2 · La suite complète ne tourne pas en intégration continue**
- *En clair* : rien n'empêche de pousser un code qui casse la réservation ; seul le cloisonnement est vérifié automatiquement.
- *Preuve* : `.github/workflows/ci.yml` (deux travaux : « Typage, lint, tests unitaires » et « Cloisonnement entre cabinets »). La suite dure environ 50 minutes sur le poste de développement.
- *Correctif* : lancer en intégration continue un sous-ensemble court (connexion, réservation, rendez-vous, client), et la suite complète la nuit.
- *Effort* : M. *Audits précédents* : note « tests 38/100 » en août ; la couverture a beaucoup progressé, pas son automatisation.

### Exploitation

**`EXP-01` · P1 · Sauvegardes et restauration : rien n'est établi**
- *En clair* : si la base est perdue ou abîmée, personne ne sait aujourd'hui combien de jours de travail seraient perdus, ni si la sauvegarde se recharge.
- *Preuve* : `docs/RGPD-EFFACEMENT.md` §3, trois lignes « **À compléter** » ; aucun script ni planification de sauvegarde dans le dépôt ; aucun compte rendu d'essai de restauration.
- *Correctif* : faire confirmer par l'hébergeur la fréquence et la durée ; programmer une sauvegarde quotidienne hors du serveur ; faire un essai de restauration sur une base vide et l'écrire.
- *Effort* : S (démarche) + M (essai). *Audits précédents* : non traité.

**`EXP-02` · P1 · Aucune alerte en cas de panne**
- *En clair* : une erreur en production s'écrit dans un journal que personne ne regarde.
- *Preuve* : aucune dépendance de collecte d'erreurs dans `package.json` ; aucune route de santé dans `src/app/api/`.
- *Correctif* : une route `/api/health` (base joignable, e-mail configuré, seconde barrière active), une sonde externe qui prévient par e-mail, et la collecte des erreurs serveur.
- *Effort* : M. *Audits précédents* : non relevé.

**`EXP-03` · P2 · Un déploiement qui modifie la base ne se défait pas**
- *Preuve* : `Dockerfile`, ligne `CMD` (`prisma migrate deploy` avant `npm start`) ; 61 migrations, aucune de retour.
- *Correctif* : sauvegarde automatique avant chaque déploiement (aujourd'hui faite à la main), et règle écrite : toute migration reste compatible avec la version précédente du code.
- *Effort* : S (procédure). *Audits précédents* : non relevé.

**`EXP-04` · P2 · La procédure de déploiement écrite ne correspond plus à la réalité**
- *Preuve* : `scripts/deploy-iridflow.mjs` pousse vers le distant `gitea`, absent de `git remote -v` ; aucun document du dépôt ne décrit la procédure actuelle.
- *Correctif* : écrire la procédure réelle (sauvegarde, intégration continue verte, déploiement, contrôle) et retirer ou corriger le script.
- *Effort* : S. *Audits précédents* : non relevé.

**`EXP-05` · P2 · Rien ne vérifie au démarrage que les réglages indispensables sont là**
- *Preuve* : seule l'absence de Mailjet est signalée (`src/instrumentation.ts`) ; `NEXT_PUBLIC_APP_URL` retombe sur `http://localhost:3000` à 18 endroits ; `PLATFORM_ADMIN_EMAILS` absent ne produit aucun message (`grants.ts:21-22`).
- *Correctif* : un contrôle unique au démarrage, qui liste ce qui manque et refuse de démarrer en production pour les réglages vitaux.
- *Effort* : S. *Audits précédents* : non relevé.

**`EXP-06` · P3 · Restes de configurations abandonnées**
- *Preuve* : `vercel.json` (tâche planifiée Vercel) ; variables `AUTH_EMAIL` et `AUTH_PASSWORD_HASH_BASE64` ; `src/data/normandy-cities.ts` importé nulle part.
- *Correctif* : supprimer. *Effort* : S. *Audits précédents* : `P2-27` (août) jugeait `AUTH_EMAIL` encore utile ; `BOOTSTRAP_ADMIN_*` l'a remplacée depuis.

---

## 4. Points des audits précédents revérifiés dans cette phase

| Point | Origine | Statut au 9 octobre 2026 |
|---|---|---|
| `DATA-02` — identité d'une personne posée dans toute base neuve | pré-production | **corrigé** (`src/data/settings.ts:207-222`) |
| `FONC-02` — tâche quotidienne jamais déclenchée | pré-production | **corrigé** (planificateur interne) |
| `SEC-08` — e-mails écrits dans les journaux | pré-production | **partiellement corrigé** (voir `FONC-04`) |
| `TEST-01` — 22 tests de bout en bout rouges | pré-production | **réduit à 6** (voir `TEST-01`) |
| `P0-2` — tournées non enregistrées | août | **corrigé** (32 specs vertes) |
| `P2-23`, `P2-24` — rappels et statistiques factices | août | **corrigé** (requêtes réelles) |
| Export et effacement d'un espace | pré-production, §10 | **fait** pour l'espace entier ; **ouvert** pour un client seul |
| `BUG-09` (date du jour en UTC), `BUG-10` (horaire hors grille accepté), `PERF-01` (téléphones de tous les clients dans chaque page) | pré-production | **non vérifié dans cette phase** — repris en phases 2 à 4 |

---

## 5. Avant d'ouvrir à un premier professionnel extérieur

*Liste fonctionnelle et d'exploitation seulement. Les constats de sécurité et de conformité s'y ajouteront dans les phases suivantes, et pourront y placer des P0.*

**P0** — aucun à ce stade.

**P1**

1. `EXP-01` — faire établir les sauvegardes et réussir une restauration.
2. `EXP-02` — être prévenu d'une panne : route de santé, sonde, collecte des erreurs.
3. `FONC-04` — ne plus dépendre en silence de l'envoi d'e-mails.
4. `FONC-01` — retirer ou brancher les trois boutons factices de la fiche animal.

**P2**

5. `EXP-03`, `EXP-04` — procédure de déploiement écrite, sauvegarde automatique avant déploiement.
6. `EXP-05` — contrôle des réglages au démarrage.
7. `FONC-02` — pages d'erreur.
8. `FONC-03` — page « Mon compte ».
9. `FONC-05` — export par le professionnel lui-même.
10. `FONC-07`, `FONC-08` — Google Agenda vérifié ; vérifications en attente visibles.
11. `TEST-01`, `TEST-02`, `TEST-03` — suite entièrement verte, parcours critiques couverts, exécution automatique.

**P3**

12. `FONC-06` — annulation en ligne par le client.
13. `FONC-09` — photos par défaut hébergées sur place.
14. `FONC-10` — reprise d'un rappel interrompu.
15. `EXP-06` — ménage des restes.

**Hors du logiciel, à décider par Loïc** : l'absence de facturation ou d'abonnement dans le produit (aucune trace dans `src/`), et l'absence d'aide en ligne pour un professionnel qui débute.
