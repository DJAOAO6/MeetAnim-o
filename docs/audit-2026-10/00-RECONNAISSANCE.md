# Audit 2026-10 — Phase 0 : reconnaissance

*Établi le 9 octobre 2026 sur le commit `18e52a8` (branche `master`). Aucune attaque, aucun jugement : ce document dit ce qui existe. Les constats, classés P0 à P3, viendront dans les phases suivantes.*

**Méthode.** Lecture du code, du schéma et des migrations ; commandes lancées sur le poste de développement. Chaque tableau indique comment il a été obtenu. Un tableau produit par lecture automatique du texte dit « trouvé » ou « non trouvé », jamais « présent » ou « absent » : les lignes sensibles seront relues une à une en phase 2.

**Rien n'a été écrit en production, ni dans aucune base.** Aucun fichier de `src/`, `prisma/` ou `scripts/` n'a été modifié.

---

## En clair, pour Loïc

- Le logiciel expose **25 pages**, **7 routes** et **155 fonctions serveur** appelables depuis un navigateur. Ces 155 fonctions sont la vraie porte d'entrée : chacune peut être appelée directement, sans passer par l'écran qui la déclenche d'habitude.
- **16 de ces fonctions répondent sans connexion** (réservation en ligne, connexion, mot de passe oublié, invitation). C'est normal pour leur rôle, mais ce sont celles qu'un inconnu peut solliciter.
- Les données sont rangées dans **35 tables**. 21 d'entre elles portent le cabinet auquel elles appartiennent et sont protégées deux fois (par le logiciel, puis par la base elle-même).
- Six services extérieurs reçoivent des données : l'hébergeur, l'envoi d'e-mails, trois services de cartes et d'adresses, et Google Agenda quand un professionnel le connecte.
- Trois audits ont déjà eu lieu depuis août (tunnel de réservation, audit général, pré-production). Ils déclarent presque tout corrigé ; ce nouvel audit vérifiera chaque point dans le code actuel.
- Le code est sain à l'instant du relevé (types, règles de style, 410 tests unitaires). **Dix failles connues touchent des bibliothèques**, dont deux classées critiques.

---

## 1. Audits et plans existants

| Document | Date (dernier commit) | Objet | Ce qu'il déclare |
|---|---|---|---|
| `AUDIT-RESERVATION.md` | 28 août 2026 | Consigne d'audit du tunnel de réservation publique | Liste de constats à vérifier (logique, conformité, accessibilité, parcours, responsive). Ne déclare rien corrigé. |
| `AUDIT-FINDINGS.md` | 28 août 2026 | Phase 0 de cet audit du tunnel | Confirme ou infirme chaque constat ; ajoute des problèmes non listés. Aucune correction. |
| `docs/AUDIT_COMPLET.md` | 30 août 2026 | Audit général (fonctionnel, interface, accessibilité, sécurité, tests) | 3 P0, 7 P1, 19 P2 et 8 P3. **Tous les P0 et P1 déclarés « corrigés et testés »**, ainsi que les P2 et P3, sauf P2-11 et P2-17 (« ne se reproduit pas ») et P2-27 (« faux positif »). Notes après correction : fonctionnel 74/100, sécurité 80/100, tests 38/100, maturité produit 65/100. |
| `docs/FIX_PLAN.md` | 30 août 2026 | Plan de correction de l'audit précédent | 4 sprints, tous marqués terminés (29 et 30 août). |
| `docs/GOOGLE-CALENDAR-SETUP.md` | 31 août 2026 | Mode d'emploi de la connexion Google Agenda | Document de configuration : projet Google Cloud, écran de consentement, périmètres, variables. |
| `docs/TOURNEES-CARTOGRAPHIE.md` | 1er septembre 2026 | Architecture des cartes et des tournées | Décrit les fournisseurs (fond de carte, itinéraires, géocodage), les variables et une section « Confidentialité ». |
| `AUDIT-1002-PATTES-PREPROD.md` | présent sur le poste mais **absent du dépôt** (ignoré par git) ; audit daté du 21 septembre 2026, commit `c47f8c7` | Audit avant mise en production | 1 P0 (`DATA-01`), 7 P1, des P2 et P3. Lot 1 déclaré terminé le 21 septembre : `DATA-01`, `SEC-01`, `SEC-02`, `BUG-02`, `BUG-04`, `BUG-06`. Reportés : `Restrict` sur l'auteur d'un document, `maplibre-gl`, révocation des sessions. Déclare ouverts à cette date : `PERF-01`, `DATA-02`, `FONC-02`, `SEC-04`, `SEC-08`, `BUG-09`, `BUG-10`, absence de CSP, pas d'export ni d'effacement RGPD. |
| `docs/PLAN-MULTI-COMPTES.md` | 23 septembre 2026 | Passage à plusieurs cabinets | Phases 1 à 7 déclarées faites (22 et 23 septembre) : colonne de cabinet, client de base cloisonné, lien public, invitation, règles de la base (RLS), tests de cloisonnement, plateforme. Restes déclarés : valeur par défaut `org-1002-pattes` posée par la base, une connexion sans cabinet déclaré voit tout, réserve de connexions par cabinet. |
| `docs/RGPD-EFFACEMENT.md` | 5 octobre 2026 | Procédure d'effacement d'un espace | Décrit l'effacement table par table, ce qui reste (`DeletionRecord`), les sauvegardes (**durées « à compléter »**), les prestataires, et la reprise après restauration. |
| `tests/audit/audit-security.spec.ts` | 9 octobre 2026 | Preuves de l'audit de pré-production | 7 tests : double réservation, chevauchement, fiche orpheline, jeton après déconnexion, script dans un document, photo lourde, suppression d'un auteur. |

Hors liste du prompt, présents dans le dépôt : `docs/ANALYSE-LIEU-ANIMAL.md`, `PROMPT-CALENDRIER.md`, `PROMPT-NOTIFICATIONS.md`.

**Chantiers menés depuis l'audit de pré-production, sans document de synthèse dans le dépôt** (visibles dans l'historique git) : carte clients, correctifs C1 à C9 (dont archivage des clients, expiration des demandes, purge RGPD), chantier boutons B1 à B6. Leur effet sur les constats antérieurs sera vérifié point par point.

---

## 2. Surface d'attaque

### 2.1 Interception des requêtes

`src/proxy.ts` (nom du fichier d'interception sous Next.js 16) ne couvre que deux chemins : `/dashboard/:path*` et `/login` (`src/proxy.ts:47`). Il vérifie la **signature** du jeton de session, pas son état en base. Toutes les autres adresses — `/plateforme`, `/api/*`, `/reserver/*`, `/inscription/*` — ne passent pas par lui et font leur propre contrôle.

La mise en page de l'espace professionnel appelle `requireUser({ allowUnverified: true })` (`src/app/dashboard/layout.tsx:57`).

### 2.2 Pages (25)

*Obtenu par : liste des `page.tsx` et recherche des fonctions de contrôle appelées dans chaque fichier. « — » : aucun contrôle dans le fichier de la page ; elle s'appuie sur la mise en page et sur les fonctions de lecture qu'elle appelle.*

| Adresse | Accès | Contrôle trouvé dans la page |
|---|---|---|
| `/` | publique | — (page d'accueil statique) |
| `/login` | publique | — (proxy : renvoie vers l'espace si déjà connecté) |
| `/login/verification` | publique | session 2FA en attente, sinon renvoi vers `/login` |
| `/mot-de-passe-oublie` | publique | — |
| `/reinitialiser-mot-de-passe` | publique | — (jeton lu par l'action) |
| `/inscription/[token]` | publique | `findInvitation` |
| `/reserver/[slug]` | publique | `notFound` si le lien ne mène à rien |
| `/politique-de-confidentialite/[slug]` | publique | `dbForSlug`, `notFound` |
| `/dashboard` | connectée | — |
| `/dashboard/agenda` | connectée | — |
| `/dashboard/clients` | connectée | — |
| `/dashboard/clients/[id]` | connectée | `notFound` |
| `/dashboard/clients/lieux` | connectée | — |
| `/dashboard/prestations` | connectée | — |
| `/dashboard/bienvenue` | connectée | `requireUser`, `currentOrganization`, permission `MANAGE_PUBLIC_SETTINGS` |
| `/dashboard/verification` | connectée | `requireUser` |
| `/dashboard/parametres` | connectée | `requireUser`, `currentOrganization` |
| `/dashboard/carte` | connectée | `requireUser`, module `TOURS` |
| `/dashboard/tournees` | connectée | `requireUser`, `currentDb`, module `TOURS` |
| `/dashboard/rappels` | connectée | `requireUser`, module `REMINDERS` |
| `/dashboard/documents` | connectée | `requireUser`, module `DOCUMENTS` |
| `/dashboard/documents/[id]` | connectée | `requireUser`, module `DOCUMENTS`, `notFound` |
| `/dashboard/statistiques` | connectée | `requireUser`, module `STATISTICS`, permission `VIEW_FINANCES` |
| `/dashboard/admin` | connectée, administrateur du cabinet | `requireAdmin` |
| `/plateforme` | plateforme | `platformAccess`, `notFound` |

### 2.3 Routes (7)

*Obtenu par lecture de chaque fichier `route.ts`.*

| Route | Méthode | Accès | Contrôle | Entrées | Appel sortant |
|---|---|---|---|---|---|
| `/api/address-search` | GET | **publique** | aucun contrôle d'identité ni limitation de débit trouvés | `q`, `type` (zod) | IGN Géoplateforme (`data.geopf.fr`), adresse fixe, délai d'attente |
| `/api/territory` | GET | connectée | `getCurrentUser`, sinon 401 (`route.ts:84`) | `type`, `code` (zod) | `geo.api.gouv.fr`, IGN (WFS) |
| `/api/calendar/feed/[token]` | GET | **publique, par jeton** | jeton `User.icsFeedToken` dans l'adresse (`route.ts:19`) | jeton | — |
| `/api/calendar/google/connect` | GET | connectée | `requireUser` | — | redirection vers Google |
| `/api/calendar/google/callback` | GET | connectée | `requireUser`, paramètre `state` vérifié et consommé (`route.ts:34`) | `code`, `state`, `error` | Google (échange du code, liste des agendas) |
| `/api/cron/daily` | GET | **publique, par secret** | en-tête comparé à `CRON_SECRET` (`route.ts:18`) | `?organization=` | — |
| `/plateforme/export/[organizationId]` | GET | plateforme | `platformAccess` (`route.ts:10`) | identifiant d'espace | — |

### 2.4 Fonctions serveur exportées (155, dans 32 fichiers)

**Écart avec le prompt.** `grep -rl '"use server"' src` rend 36 fichiers, mais quatre d'entre eux ne contiennent ces mots que dans un commentaire : `src/lib/appointments.ts`, `src/lib/booking-validation.ts`, `src/lib/client-search.ts`, `src/lib/tour-estimate.ts`. Ils ne portent pas la directive et n'exposent donc rien. **32 fichiers** la portent réellement.

**Répartition** (voir la légende sous le tableau) :

| Qui peut l'appeler (première lecture) | Fonctions |
|---|---|
| compte connecté | 118 |
| plateforme | 12 |
| administrateur du cabinet | 7 |
| public (sans session) | 9 |
| public (entrée : connexion, mot de passe, double authentification, invitation) | 6 |
| public (ne lit aucune donnée) | 1 |
| exportée, mais attend un client de base en paramètre (usage interne) | 2 |
| **Total** | **155** |

**Comment lire les tableaux.**

- *Obtenu par* un script qui lit le corps de chaque fonction exportée et celui des fonctions de `src/lib` qu'elle appelle, sur trois niveaux. « (via X) » : le contrôle n'est pas dans la fonction elle-même mais dans `X`, qu'elle appelle. « — » : rien trouvé à cette profondeur.
- **Authentification** : `requireUser` (compte connecté, sinon renvoi), `requireAdmin` (administrateur du cabinet), `getCurrentUser` (lit le compte sans rien imposer), `platformAccess` (compte de plateforme).
- **Cloisonnement** : `currentDb` (base restreinte au cabinet du compte connecté), `dbForSlug` (cabinet désigné par le lien public), `readDb` et `publicDb` (cabinet du compte connecté, **sinon le seul cabinet existant** — `src/lib/organization.ts:119` et `:137`), `dbFor` (cabinet nommé par le code), « prisma nu » (client sans restriction de cabinet), « SQL brut » (`$queryRaw` ou `$executeRaw`).
- **Validation** : « zod » quand un schéma de validation est appliqué.
- La colonne « Qui peut l'appeler » est une première lecture, à confirmer fonction par fonction en phase 2 (partie B).

#### `src/lib/admin/actions.ts` — 7 fonctions exportées

| Fonction (ligne) | Paramètres | Qui peut l'appeler | Authentification | Rôle, permission, module | Cloisonnement | Validation | Débit | Journal |
|---|---|---|---|---|---|---|---|---|
| `createUser` (59) | _prevState, formData | administrateur du cabinet | requireUser (via requireAdmin), requireAdmin, getCurrentUser (via currentOrganizationId) | rôle (via requireAdmin), requireModule | currentDb, prisma nu | — | — | audit |
| `setUserRole` (112) | userId, role | administrateur du cabinet | requireUser (via requireAdmin), requireAdmin, getCurrentUser (via logAudit) | rôle (via requireAdmin) | prisma nu | — | — | audit |
| `setUserActive` (121) | userId, active | administrateur du cabinet | requireUser (via requireAdmin), requireAdmin, getCurrentUser (via logAudit) | rôle (via requireAdmin) | prisma nu | — | — | audit |
| `setUserTwoFactor` (130) | userId, enabled | administrateur du cabinet | requireUser (via requireAdmin), requireAdmin, getCurrentUser (via logAudit) | rôle (via requireAdmin) | prisma nu | — | — | audit |
| `updateUserProfileAction` (141) | userId, input | administrateur du cabinet | requireUser (via requireAdmin), requireAdmin, getCurrentUser (via logAudit) | rôle (via requireAdmin) | prisma nu | — | — | audit |
| `deleteUserAction` (171) | userId | administrateur du cabinet | requireUser (via requireAdmin), requireAdmin, getCurrentUser (via logAudit) | rôle | prisma nu | — | — | audit |
| `setUserPermissions` (211) | userId, permissions | administrateur du cabinet | requireUser (via requireAdmin), requireAdmin, getCurrentUser (via logAudit) | rôle (via requireAdmin) | prisma nu | — | — | audit |

#### `src/lib/agenda-preferences-actions.ts` — 2 fonctions exportées

| Fonction (ligne) | Paramètres | Qui peut l'appeler | Authentification | Rôle, permission, module | Cloisonnement | Validation | Débit | Journal |
|---|---|---|---|---|---|---|---|---|
| `getAgendaDisplay` (12) | — | compte connecté | requireUser, getCurrentUser (via requireUser) | — | prisma nu | — | — | — |
| `saveAgendaDisplayAction` (25) | input | compte connecté | requireUser, getCurrentUser (via requireUser) | — | prisma nu | — | — | — |

#### `src/lib/appointment-tour-actions.ts` — 1 fonction exportée

| Fonction (ligne) | Paramètres | Qui peut l'appeler | Authentification | Rôle, permission, module | Cloisonnement | Validation | Débit | Journal |
|---|---|---|---|---|---|---|---|---|
| `listTourRunsForDateAction` (27) | dateId | compte connecté | requireUser, getCurrentUser (via currentDb) | requireModule | currentDb, dbFor (via currentDb), prisma nu (via requireUser) | — | — | — |

#### `src/lib/appointments-actions.ts` — 14 fonctions exportées

| Fonction (ligne) | Paramètres | Qui peut l'appeler | Authentification | Rôle, permission, module | Cloisonnement | Validation | Débit | Journal |
|---|---|---|---|---|---|---|---|---|
| `checkGeographicWarningAction` (282) | input | compte connecté | getCurrentUser | — | currentDb, dbFor (via currentDb), readDb (via getBusinessProfile), publicDb (via getBusinessProfile), prisma nu (via getBusinessProfile) | — | — | — |
| `getAppointmentsInRangeAction` (411) | fromId, toId | compte connecté | getCurrentUser | — | currentDb (via getAppointments), dbFor (via getAppointments), prisma nu (via getCurrentUser) | — | — | — |
| `saveAppointmentAction` (418) | input | compte connecté | getCurrentUser | requireModule (via syncAppointmentToCalendars) | currentDb, dbFor (via currentDb), readDb (via getAvailability), publicDb (via getAvailability), prisma nu (via getAvailability), SQL brut (via lockDay) | zod (via sanitizeGeoFields) | — | audit |
| `saveAppointmentsBatchAction` (557) | input | compte connecté | getCurrentUser | requireModule (via syncAppointmentToCalendars) | currentDb, dbFor (via currentDb), readDb (via getAvailability), publicDb (via getAvailability), prisma nu (via getAvailability), SQL brut (via lockDay) | zod (via sanitizeGeoFields) | — | audit |
| `getRequestOptionsAction` (685) | appointmentId | compte connecté | getCurrentUser | — | currentDb, dbFor (via currentDb), readDb (via getAvailability), publicDb (via getAvailability), prisma nu (via getAvailability) | — | — | — |
| `confirmRequestSlotAction` (711) | appointmentId, optionId | compte connecté | getCurrentUser | requireModule (via syncAppointmentToCalendars) | currentDb, dbFor (via currentDb), readDb (via getAvailability), publicDb (via getAvailability), prisma nu (via getAvailability), SQL brut (via lockDay) | — | — | audit |
| `moveVisitAction` (762) | visitGroupId, date, start | compte connecté | getCurrentUser | requireModule (via syncAppointmentToCalendars) | currentDb, dbFor (via currentDb), readDb (via getAvailability), publicDb (via getAvailability), prisma nu (via getAvailability), SQL brut (via lockDay) | — | — | audit |
| `cancelVisitAction` (824) | visitGroupId | compte connecté | getCurrentUser | requireModule (via syncAppointmentToCalendars) | currentDb, dbFor (via currentDb), prisma nu (via logAudit) | — | — | audit |
| `cancelVisitMemberAction` (850) | id | compte connecté | getCurrentUser | requireModule (via updateAppointmentStatusAction) | currentDb, dbFor (via currentDb), readDb (via updateAppointmentStatusAction), prisma nu (via currentDb) | — | — | audit (via updateAppointmentStatusAction) |
| `updateAppointmentStatusAction` (863) | id, status | compte connecté | getCurrentUser | requireModule (via syncAppointmentToCalendars) | currentDb, dbFor (via currentDb), readDb (via hasConflict), publicDb (via hasConflict), prisma nu (via logAudit) | — | — | audit |
| `completeAppointmentAction` (939) | id | compte connecté | getCurrentUser | — | currentDb, dbFor (via currentDb), prisma nu (via logAudit) | — | — | audit |
| `swapAppointmentTimesAction` (990) | appointmentIdA, appointmentIdB | compte connecté | getCurrentUser | requireModule (via syncAppointmentToCalendars) | currentDb, dbFor (via currentDb), readDb (via getAvailability), publicDb (via getAvailability), prisma nu (via getAvailability) | — | — | audit |
| `submitPublicBookingAction` (1323) | slug, input | **public (sans session)** | getCurrentUser (via getAvailability) | requireModule (via syncAppointmentToCalendars) | dbForSlug, dbFor (via dbForSlug), readDb (via getAvailability), publicDb (via getAvailability), prisma nu (via dbForSlug), SQL brut (via lockDay) | zod | débit | audit |
| `getOccupiedSlotsAction` (1590) | slug, fromDateId, toDateId | compte connecté | getCurrentUser (via currentDb) | requireModule (via getGoogleBusyPeriods) | currentDb, dbForSlug, dbFor (via currentDb), readDb (via getAvailability), publicDb (via getAvailability), prisma nu (via dbForSlug) | — | débit | — |

#### `src/lib/auth/actions.ts` — 2 fonctions exportées

| Fonction (ligne) | Paramètres | Qui peut l'appeler | Authentification | Rôle, permission, module | Cloisonnement | Validation | Débit | Journal |
|---|---|---|---|---|---|---|---|---|
| `login` (31) | _prevState, formData | **public (entrée : connexion, mot de passe, double authentification, invitation)** | getCurrentUser (via logAudit) | — | prisma nu | — | débit | audit |
| `logout` (90) | — | compte connecté | getCurrentUser | — | prisma nu (via closeCurrentSession) | — | — | audit |

#### `src/lib/auth/password-reset-actions.ts` — 2 fonctions exportées

| Fonction (ligne) | Paramètres | Qui peut l'appeler | Authentification | Rôle, permission, module | Cloisonnement | Validation | Débit | Journal |
|---|---|---|---|---|---|---|---|---|
| `requestPasswordReset` (23) | _prevState, formData | **public (entrée : connexion, mot de passe, double authentification, invitation)** | getCurrentUser (via logAudit) | — | prisma nu | — | débit | audit |
| `resetPassword` (58) | _prevState, formData | **public (entrée : connexion, mot de passe, double authentification, invitation)** | getCurrentUser (via logAudit) | — | prisma nu | zod | — | audit |

#### `src/lib/auth/two-factor-actions.ts` — 2 fonctions exportées

| Fonction (ligne) | Paramètres | Qui peut l'appeler | Authentification | Rôle, permission, module | Cloisonnement | Validation | Débit | Journal |
|---|---|---|---|---|---|---|---|---|
| `verifyTwoFactorCode` (19) | _prevState, formData | **public (entrée : connexion, mot de passe, double authentification, invitation)** | getCurrentUser (via logAudit) | — | prisma nu | — | — | audit |
| `resendTwoFactorCode` (66) | — | **public (entrée : connexion, mot de passe, double authentification, invitation)** | getCurrentUser (via logAudit) | — | prisma nu | — | — | audit |

#### `src/lib/blocked-slots-actions.ts` — 3 fonctions exportées

| Fonction (ligne) | Paramètres | Qui peut l'appeler | Authentification | Rôle, permission, module | Cloisonnement | Validation | Débit | Journal |
|---|---|---|---|---|---|---|---|---|
| `getBlockedSlots` (29) | — | compte connecté | getCurrentUser (via currentDb) | — | currentDb, dbFor (via currentDb), prisma nu (via currentDb) | — | — | — |
| `createBlockedSlotAction` (44) | input | compte connecté | requireUser, getCurrentUser (via currentDb) | — | currentDb, dbFor (via currentDb), prisma nu (via requireUser) | — | — | — |
| `deleteBlockedSlotAction` (80) | id | compte connecté | requireUser, getCurrentUser (via currentDb) | — | currentDb, dbFor (via currentDb), prisma nu (via requireUser) | — | — | — |

#### `src/lib/business-profile-actions.ts` — 11 fonctions exportées

| Fonction (ligne) | Paramètres | Qui peut l'appeler | Authentification | Rôle, permission, module | Cloisonnement | Validation | Débit | Journal |
|---|---|---|---|---|---|---|---|---|
| `businessProfileOf` (43) | db | exportée, mais attend un client de base en paramètre (usage interne) | — | — | — | — | — | — |
| `getBusinessProfile` (48) | scoped | **public (sans session)** | getCurrentUser (via readDb) | — | dbFor (via readDb), readDb, publicDb (via readDb), prisma nu (via readDb) | — | — | — |
| `updateBusinessProfileAction` (73) | input | compte connecté | requireUser, getCurrentUser (via currentDb) | hasPermission, rôle (via hasPermission) | currentDb, dbFor (via currentDb), prisma nu (via currentOrganization), SQL brut (via registrationNumberTaken) | — | — | — |
| `geocodeBusinessProfileAction` (182) | — | compte connecté | requireUser, getCurrentUser (via currentDb) | hasPermission, rôle (via hasPermission) | currentDb, dbFor (via currentDb), prisma nu (via requireUser) | — | — | — |
| `updateManualAvailabilityAction` (208) | cabinetAvailable, homeAvailable | compte connecté | requireUser, getCurrentUser (via currentDb) | hasPermission, rôle (via hasPermission) | currentDb, dbFor (via currentDb), prisma nu (via requireUser) | — | — | — |
| `getAvailability` (228) | scoped | **public (sans session)** | getCurrentUser (via readDb) | — | dbFor (via readDb), readDb, publicDb (via readDb), prisma nu (via readDb) | — | — | — |
| `updateAvailabilityAction` (290) | input, force | compte connecté | requireUser, getCurrentUser (via findAvailabilityConflicts) | hasPermission, rôle (via hasPermission) | currentDb, dbFor (via findAvailabilityConflicts), prisma nu (via requireUser) | — | — | — |
| `getReminderSettings` (337) | — | **public (sans session)** | getCurrentUser (via readDb) | — | dbFor (via readDb), readDb, publicDb (via readDb), prisma nu (via readDb) | — | — | — |
| `reminderSettingsOf` (346) | db | exportée, mais attend un client de base en paramètre (usage interne) | — | — | — | — | — | — |
| `updateReminderSettingsAction` (353) | input | compte connecté | requireUser, getCurrentUser (via currentDb) | hasPermission, rôle (via hasPermission) | currentDb, dbFor (via currentDb), prisma nu (via requireUser) | — | — | — |
| `getAppointmentsInPeriodAction` (390) | startDateId, endDateId, scope | compte connecté | requireUser, getCurrentUser (via currentDb) | — | currentDb, dbFor (via currentDb), prisma nu (via requireUser) | — | — | — |

#### `src/lib/calendar-actions.ts` — 4 fonctions exportées

| Fonction (ligne) | Paramètres | Qui peut l'appeler | Authentification | Rôle, permission, module | Cloisonnement | Validation | Débit | Journal |
|---|---|---|---|---|---|---|---|---|
| `disconnectGoogleCalendarAction` (16) | — | compte connecté | requireUser, getCurrentUser (via logAudit) | requireModule | prisma nu | — | — | audit |
| `updateGoogleCalendarSettingsAction` (51) | input | compte connecté | requireUser, getCurrentUser (via logAudit) | requireModule | prisma nu | — | — | audit |
| `regenerateIcsFeedTokenAction` (76) | — | compte connecté | requireUser, getCurrentUser (via logAudit) | requireModule | prisma nu | — | — | audit |
| `disableIcsFeedAction` (92) | — | compte connecté | requireUser, getCurrentUser (via requireModule) | requireModule | prisma nu | — | — | — |

#### `src/lib/clients-actions.ts` — 14 fonctions exportées

| Fonction (ligne) | Paramètres | Qui peut l'appeler | Authentification | Rôle, permission, module | Cloisonnement | Validation | Débit | Journal |
|---|---|---|---|---|---|---|---|---|
| `deleteClientAction` (53) | clientId | compte connecté | requireUser, getCurrentUser (via currentDb) | hasPermission, rôle (via hasPermission) | currentDb, dbFor (via currentDb), prisma nu (via logAudit) | — | — | audit |
| `upcomingAppointmentsOfClientsAction` (76) | clientIds | compte connecté | requireUser, getCurrentUser (via currentDb) | — | currentDb, dbFor (via currentDb), prisma nu (via requireUser) | — | — | — |
| `archiveClientsAction` (97) | clientIds | compte connecté (contrôle dans `setClientsArchived`) | requireUser (via setClientsArchived), getCurrentUser (via setClientsArchived) | — | currentDb (via setClientsArchived), dbFor (via setClientsArchived), prisma nu (via setClientsArchived) | — | — | audit (via setClientsArchived) |
| `restoreClientsAction` (101) | clientIds | compte connecté (contrôle dans `setClientsArchived`) | requireUser (via setClientsArchived), getCurrentUser (via setClientsArchived) | — | currentDb (via setClientsArchived), dbFor (via setClientsArchived), prisma nu (via setClientsArchived) | — | — | audit (via setClientsArchived) |
| `deleteClientsAction` (133) | clientIds | compte connecté | requireUser, getCurrentUser (via currentDb) | hasPermission, rôle (via hasPermission) | currentDb, dbFor (via currentDb), prisma nu (via logAudit) | — | — | audit |
| `createClientAction` (173) | input | compte connecté | requireUser, getCurrentUser (via currentDb) | — | currentDb, dbFor (via currentDb), prisma nu (via logAudit) | — | — | audit |
| `createClientWithAnimalsAction` (220) | input | compte connecté | requireUser, getCurrentUser (via currentDb) | — | currentDb, dbFor (via currentDb), prisma nu (via logAudit) | zod (via validateAnimal) | — | audit |
| `updateClientAction` (282) | clientId, input | compte connecté | requireUser, getCurrentUser (via currentDb) | — | currentDb, dbFor (via currentDb), prisma nu (via logAudit) | — | — | audit |
| `geocodeClientAddressAction` (340) | clientId | compte connecté | requireUser, getCurrentUser (via currentDb) | — | currentDb, dbFor (via currentDb), prisma nu (via requireUser) | — | — | — |
| `updateAnimalAction` (407) | animalId, input | compte connecté | requireUser, getCurrentUser (via currentDb) | — | currentDb, dbFor (via currentDb), prisma nu (via logAudit) | zod (via validateAnimal) | — | audit |
| `createAnimalAction` (447) | clientId, input | compte connecté | requireUser, getCurrentUser (via currentDb) | — | currentDb, dbFor (via currentDb), prisma nu (via logAudit) | zod (via validateAnimal) | — | audit |
| `deleteAnimalAction` (481) | animalId | compte connecté | requireUser, getCurrentUser (via currentDb) | hasPermission, rôle (via hasPermission) | currentDb, dbFor (via currentDb), prisma nu (via logAudit) | — | — | audit |
| `searchClientsAndAnimalsAction` (513) | rawQuery | compte connecté | getCurrentUser | — | currentDb, dbFor (via currentDb), prisma nu (via currentDb) | zod | — | — |
| `locateUnlocatedClientsAction` (561) | — | compte connecté | requireUser, getCurrentUser (via currentDb) | — | currentDb, dbFor (via currentDb), prisma nu (via logAudit) | — | — | audit |

#### `src/lib/clients-import-actions.ts` — 5 fonctions exportées

| Fonction (ligne) | Paramètres | Qui peut l'appeler | Authentification | Rôle, permission, module | Cloisonnement | Validation | Débit | Journal |
|---|---|---|---|---|---|---|---|---|
| `startClientImportAction` (42) | input | compte connecté | requireUser, getCurrentUser (via currentDb) | requireModule | currentDb, dbFor (via currentDb), prisma nu (via isRateLimited) | zod | débit | — |
| `checkClientMatchesAction` (202) | candidates | compte connecté | requireUser, getCurrentUser (via loadClientIndex) | requireModule | currentDb (via loadClientIndex), dbFor (via loadClientIndex), prisma nu (via requireUser) | zod | — | — |
| `importClientsChunkAction` (220) | importId, rows | compte connecté | requireUser, getCurrentUser (via currentDb) | requireModule | currentDb, dbFor (via currentDb), prisma nu (via requireUser) | zod | — | — |
| `finishClientImportAction` (366) | importId | compte connecté | requireUser, getCurrentUser (via currentDb) | requireModule | currentDb, dbFor (via currentDb), prisma nu (via logAudit) | — | — | audit |
| `undoClientImportAction` (413) | importId | compte connecté | requireUser, getCurrentUser (via currentDb) | hasPermission, rôle (via hasPermission), requireModule | currentDb, dbFor (via currentDb), prisma nu (via logAudit) | — | — | audit |

#### `src/lib/dashboard-layout-actions.ts` — 4 fonctions exportées

| Fonction (ligne) | Paramètres | Qui peut l'appeler | Authentification | Rôle, permission, module | Cloisonnement | Validation | Débit | Journal |
|---|---|---|---|---|---|---|---|---|
| `getDashboardLayout` (17) | — | compte connecté | requireUser, getCurrentUser (via requireUser) | — | prisma nu | — | — | — |
| `saveDashboardLayoutAction` (36) | layout | compte connecté | requireUser, getCurrentUser (via requireUser) | — | prisma nu | — | — | — |
| `resetDashboardLayoutAction` (55) | — | compte connecté | requireUser, getCurrentUser (via requireUser) | — | prisma nu | — | — | — |
| `setNewRequestAnimationAction` (70) | enabled | compte connecté | requireUser, getCurrentUser (via requireUser) | — | prisma nu | — | — | — |

#### `src/lib/documents-actions.ts` — 11 fonctions exportées

| Fonction (ligne) | Paramètres | Qui peut l'appeler | Authentification | Rôle, permission, module | Cloisonnement | Validation | Débit | Journal |
|---|---|---|---|---|---|---|---|---|
| `getDocuments` (43) | — | compte connecté | requireUser, getCurrentUser (via currentDb) | requireModule | currentDb, dbFor (via currentDb), prisma nu (via requireUser) | — | — | — |
| `getDocumentsForAnimal` (51) | animalId | compte connecté | requireUser, getCurrentUser (via currentDb) | requireModule | currentDb, dbFor (via currentDb), prisma nu (via requireUser) | — | — | — |
| `getDocumentIdForAppointment` (65) | appointmentId | compte connecté | requireUser, getCurrentUser (via currentDb) | requireModule | currentDb, dbFor (via currentDb), prisma nu (via requireUser) | — | — | — |
| `getDocumentTemplates` (73) | — | compte connecté | requireUser, getCurrentUser (via currentDb) | requireModule | currentDb, dbFor (via currentDb), prisma nu (via requireUser) | — | — | — |
| `getDocumentTemplateContent` (95) | templateId | compte connecté | requireUser, getCurrentUser (via currentDb) | requireModule | currentDb, dbFor (via currentDb), prisma nu (via requireUser) | — | — | — |
| `getDocument` (127) | id | compte connecté | requireUser, getCurrentUser (via buildVariableContext) | requireModule | currentDb, dbFor (via buildVariableContext), readDb (via buildVariableContext), publicDb (via buildVariableContext), prisma nu (via getMarkerPresets) | — | — | — |
| `createDocumentAction` (172) | input | compte connecté | requireUser, getCurrentUser (via currentDb) | requireModule | currentDb, dbFor (via currentDb), prisma nu (via logAudit) | — | — | audit |
| `saveDocumentAction` (239) | id, input | compte connecté | getCurrentUser | hasPermission, rôle (via hasPermission), requireModule | currentDb, dbFor (via currentDb), prisma nu (via currentDb) | — | — | — |
| `finalizeDocumentAction` (274) | id, input | compte connecté | requireUser, getCurrentUser (via currentDb) | requireModule | currentDb, dbFor (via currentDb), prisma nu (via logAudit) | — | — | audit |
| `duplicateDocumentAction` (305) | id | compte connecté | requireUser, getCurrentUser (via currentDb) | requireModule | currentDb, dbFor (via currentDb), prisma nu (via logAudit) | — | — | audit |
| `deleteDocumentAction` (335) | id | compte connecté | requireUser, getCurrentUser (via currentDb) | hasPermission, rôle (via hasPermission), requireModule | currentDb, dbFor (via currentDb), prisma nu (via logAudit) | — | — | audit |

#### `src/lib/documents/marker-presets-actions.ts` — 2 fonctions exportées

| Fonction (ligne) | Paramètres | Qui peut l'appeler | Authentification | Rôle, permission, module | Cloisonnement | Validation | Débit | Journal |
|---|---|---|---|---|---|---|---|---|
| `getMarkerPresets` (10) | — | compte connecté | requireUser, getCurrentUser (via currentDb) | — | currentDb, dbFor (via currentDb), prisma nu (via currentDb) | — | — | — |
| `updateMarkerPresetsAction` (27) | presets | compte connecté | requireUser, getCurrentUser (via currentDb) | — | currentDb, dbFor (via currentDb), readDb (via getBusinessProfile), publicDb (via getBusinessProfile), prisma nu (via getBusinessProfile) | — | — | — |

#### `src/lib/map-views-actions.ts` — 2 fonctions exportées

| Fonction (ligne) | Paramètres | Qui peut l'appeler | Authentification | Rôle, permission, module | Cloisonnement | Validation | Débit | Journal |
|---|---|---|---|---|---|---|---|---|
| `saveMapViewAction` (22) | input | compte connecté | requireUser, getCurrentUser (via currentDb) | requireModule | currentDb, dbFor (via currentDb), prisma nu (via requireUser) | zod | — | — |
| `deleteMapViewAction` (41) | id | compte connecté | requireUser, getCurrentUser (via currentDb) | requireModule | currentDb, dbFor (via currentDb), prisma nu (via requireUser) | — | — | — |

#### `src/lib/onboarding-actions.ts` — 1 fonction exportée

| Fonction (ligne) | Paramètres | Qui peut l'appeler | Authentification | Rôle, permission, module | Cloisonnement | Validation | Débit | Journal |
|---|---|---|---|---|---|---|---|---|
| `completeOnboardingAction` (30) | rawSlug | compte connecté | requireUser, getCurrentUser (via getAvailability) | hasPermission, rôle (via hasPermission) | currentDb, dbFor (via currentDb), readDb (via getAvailability), publicDb (via getAvailability), prisma nu (via getAvailability) | — | — | audit |

#### `src/lib/places-actions.ts` — 3 fonctions exportées

| Fonction (ligne) | Paramètres | Qui peut l'appeler | Authentification | Rôle, permission, module | Cloisonnement | Validation | Débit | Journal |
|---|---|---|---|---|---|---|---|---|
| `savePlaceAction` (35) | input | compte connecté | requireUser, getCurrentUser (via currentDb) | — | currentDb, dbFor (via currentDb), prisma nu (via logAudit) | zod | — | audit |
| `listPlacesAction` (77) | — | compte connecté | requireUser, getCurrentUser (via currentDb) | — | currentDb, dbFor (via currentDb), prisma nu (via requireUser) | — | — | — |
| `deletePlaceAction` (85) | id | compte connecté | requireUser, getCurrentUser (via currentDb) | — | currentDb, dbFor (via currentDb), prisma nu (via logAudit) | — | — | audit |

#### `src/lib/platform/assistance-actions.ts` — 2 fonctions exportées

| Fonction (ligne) | Paramètres | Qui peut l'appeler | Authentification | Rôle, permission, module | Cloisonnement | Validation | Débit | Journal |
|---|---|---|---|---|---|---|---|---|
| `startAssistanceAction` (31) | targetUserId, rawReason | plateforme | getCurrentUser (via logAudit), platformAccess | — | prisma nu | — | — | audit |
| `endAssistanceAction` (84) | — | compte connecté | getCurrentUser | — | prisma nu | — | — | audit |

#### `src/lib/platform/invitation-actions.ts` — 3 fonctions exportées

| Fonction (ligne) | Paramètres | Qui peut l'appeler | Authentification | Rôle, permission, module | Cloisonnement | Validation | Débit | Journal |
|---|---|---|---|---|---|---|---|---|
| `createInvitationAction` (36) | input | plateforme | getCurrentUser (via logAudit), platformAccess | — | prisma nu | — | — | audit |
| `revokeInvitationAction` (84) | invitationId | plateforme | getCurrentUser (via logAudit), platformAccess | — | prisma nu | — | — | audit |
| `acceptInvitationAction` (110) | _state, formData | **public (entrée : connexion, mot de passe, double authentification, invitation)** | getCurrentUser (via logAudit) | rôle | prisma nu | zod | — | audit |

#### `src/lib/platform/module-actions.ts` — 1 fonction exportée

| Fonction (ligne) | Paramètres | Qui peut l'appeler | Authentification | Rôle, permission, module | Cloisonnement | Validation | Débit | Journal |
|---|---|---|---|---|---|---|---|---|
| `setOrganizationModulesAction` (19) | organizationId, requested | plateforme | getCurrentUser (via logAudit), platformAccess | — | prisma nu | — | — | audit |

#### `src/lib/platform/organization-actions.ts` — 6 fonctions exportées

| Fonction (ligne) | Paramètres | Qui peut l'appeler | Authentification | Rôle, permission, module | Cloisonnement | Validation | Débit | Journal |
|---|---|---|---|---|---|---|---|---|
| `suspendOrganizationAction` (29) | organizationId, rawReason | plateforme | getCurrentUser (via logAudit), platformAccess | — | prisma nu | — | — | audit |
| `reactivateOrganizationAction` (58) | organizationId | plateforme | getCurrentUser (via logAudit), platformAccess | — | prisma nu | — | — | audit |
| `getDeletionInventoryAction` (76) | organizationId | plateforme | getCurrentUser (via platformAccess), platformAccess | — | prisma nu | — | — | — |
| `scheduleOrganizationDeletionAction` (112) | organizationId, reason, typedName | plateforme | getCurrentUser (via logAudit), platformAccess | rôle | prisma nu | — | — | audit |
| `cancelOrganizationDeletionAction` (159) | organizationId | plateforme | getCurrentUser (via logAudit), platformAccess | — | prisma nu | — | — | audit |
| `purgeOrganizationNowAction` (180) | organizationId, typedName, immediateConfirmed | plateforme | getCurrentUser (via platformAccess), platformAccess | — | prisma nu (via confirmedOrganization), SQL brut (via purgeOrganization) | — | — | — |

#### `src/lib/platform/verification-actions.ts` — 2 fonctions exportées

| Fonction (ligne) | Paramètres | Qui peut l'appeler | Authentification | Rôle, permission, module | Cloisonnement | Validation | Débit | Journal |
|---|---|---|---|---|---|---|---|---|
| `approveVerificationAction` (19) | organizationId | plateforme | getCurrentUser (via logAudit), platformAccess | rôle (via notifyVerificationDecision) | prisma nu | — | — | audit |
| `rejectVerificationAction` (40) | organizationId, rawReason | plateforme | getCurrentUser (via logAudit), platformAccess | rôle (via notifyVerificationDecision) | prisma nu | — | — | audit |

#### `src/lib/public-page-actions.ts` — 6 fonctions exportées

| Fonction (ligne) | Paramètres | Qui peut l'appeler | Authentification | Rôle, permission, module | Cloisonnement | Validation | Débit | Journal |
|---|---|---|---|---|---|---|---|---|
| `getPublicPageState` (28) | — | compte connecté | getCurrentUser (via currentDb) | — | currentDb, dbFor (via currentDb), prisma nu (via currentDb) | — | — | — |
| `getPublishedPublicPage` (52) | slug | **public (sans session)** | getCurrentUser (via readDb) | requireModule (via moduleOpenFor) | dbForSlug, dbFor (via dbForSlug), readDb, publicDb (via readDb), prisma nu (via dbForSlug) | — | — | — |
| `savePublicPageDraftAction` (78) | config | compte connecté | requireUser (via requireEditor), getCurrentUser (via getPublicPageState) | hasPermission (via requireEditor), rôle (via requireEditor), requireModule | currentDb, dbFor (via getPublicPageState), prisma nu (via requireEditor) | — | — | — |
| `publishPublicPageAction` (101) | config | compte connecté | requireUser (via requireEditor), getCurrentUser (via getPublicPageState) | hasPermission (via requireEditor), rôle (via requireEditor), requireModule | currentDb, dbFor (via getPublicPageState), prisma nu (via requireEditor) | — | — | — |
| `discardPublicPageDraftAction` (123) | — | compte connecté | requireUser (via requireEditor), getCurrentUser (via getPublicPageState) | hasPermission (via requireEditor), rôle (via requireEditor), requireModule | currentDb, dbFor (via getPublicPageState), prisma nu (via requireEditor) | — | — | — |
| `resetPublicPageAction` (153) | — | compte connecté | requireUser (via requireEditor), getCurrentUser (via getPublicPageState) | hasPermission (via requireEditor), rôle (via requireEditor), requireModule | currentDb, dbFor (via getPublicPageState), prisma nu (via requireEditor) | — | — | — |

#### `src/lib/public-schedule.ts` — 2 fonctions exportées

| Fonction (ligne) | Paramètres | Qui peut l'appeler | Authentification | Rôle, permission, module | Cloisonnement | Validation | Débit | Journal |
|---|---|---|---|---|---|---|---|---|
| `getBookingWindowStartId` (21) | — | **public (ne lit aucune donnée)** | — | — | — | — | — | — |
| `getPublicScheduleAction` (47) | slug, mode, durationMinutes | **public (sans session)** | getCurrentUser (via getAvailability) | — | dbForSlug, dbFor (via dbForSlug), readDb (via getAvailability), publicDb (via getAvailability), prisma nu (via dbForSlug) | — | — | — |

#### `src/lib/reminders-actions.ts` — 5 fonctions exportées

| Fonction (ligne) | Paramètres | Qui peut l'appeler | Authentification | Rôle, permission, module | Cloisonnement | Validation | Débit | Journal |
|---|---|---|---|---|---|---|---|---|
| `saveReminderAction` (73) | input | compte connecté | getCurrentUser | requireModule | currentDb, dbFor (via computeLastConsultation), prisma nu (via logAudit) | — | — | audit |
| `ignoreReminderAction` (109) | id | compte connecté | getCurrentUser | requireModule | currentDb, dbFor (via currentDb), prisma nu (via logAudit) | — | — | audit |
| `sendReminderAction` (130) | id, message | compte connecté | getCurrentUser | requireModule | currentDb, dbFor (via currentDb), readDb (via getBusinessProfile), publicDb (via getBusinessProfile), prisma nu (via getBusinessProfile) | — | — | audit |
| `sendRemindersBulkAction` (201) | ids | compte connecté | getCurrentUser | requireModule | currentDb, dbFor (via dispatchReminderEmails), readDb (via dispatchReminderEmails), publicDb (via dispatchReminderEmails), prisma nu (via dispatchReminderEmails) | — | — | audit (via dispatchReminderEmails) |
| `sendZoneReminderCampaignAction` (232) | reminderIds, zoneName, dateLabel | compte connecté | getCurrentUser | requireModule | currentDb, dbFor (via dispatchReminderEmails), readDb (via dispatchReminderEmails), publicDb (via dispatchReminderEmails), prisma nu (via dispatchReminderEmails) | — | — | audit (via dispatchReminderEmails) |

#### `src/lib/services-actions.ts` — 4 fonctions exportées

| Fonction (ligne) | Paramètres | Qui peut l'appeler | Authentification | Rôle, permission, module | Cloisonnement | Validation | Débit | Journal |
|---|---|---|---|---|---|---|---|---|
| `getServices` (86) | scoped | **public (sans session)** | getCurrentUser (via readDb) | — | dbFor (via readDb), readDb, publicDb (via readDb), prisma nu (via readDb) | — | — | — |
| `getPublicServices` (101) | scoped | **public (sans session)** | getCurrentUser (via getServices) | — | dbFor (via getServices), readDb (via getServices), publicDb (via getServices), prisma nu (via getServices) | — | — | — |
| `saveServiceAction` (135) | input | compte connecté | requireUser, getCurrentUser (via getBusinessProfile) | hasPermission, rôle (via hasPermission) | currentDb, dbFor (via getBusinessProfile), readDb (via getBusinessProfile), publicDb (via getBusinessProfile), prisma nu (via getBusinessProfile) | — | — | — |
| `deleteServiceAction` (167) | id | compte connecté | requireUser, getCurrentUser (via requireUser) | hasPermission, rôle (via hasPermission) | currentDb, dbFor (via revalidateServicePages), prisma nu (via requireUser) | — | — | — |

#### `src/lib/stats-actions.ts` — 1 fonction exportée

| Fonction (ligne) | Paramètres | Qui peut l'appeler | Authentification | Rôle, permission, module | Cloisonnement | Validation | Débit | Journal |
|---|---|---|---|---|---|---|---|---|
| `getStatsAction` (15) | filters | compte connecté | requireUser, getCurrentUser (via getStatsData) | hasPermission, rôle (via hasPermission), requireModule | currentDb (via getStatsData), dbFor (via getStatsData), readDb (via getStatsData), publicDb (via getStatsData), prisma nu (via requireUser) | — | — | — |

#### `src/lib/tour-runs-actions.ts` — 22 fonctions exportées

| Fonction (ligne) | Paramètres | Qui peut l'appeler | Authentification | Rôle, permission, module | Cloisonnement | Validation | Débit | Journal |
|---|---|---|---|---|---|---|---|---|
| `createTourRunAction` (289) | input | compte connecté | requireUser, getCurrentUser (via currentDb) | requireModule | currentDb, dbFor (via currentDb), prisma nu (via requireUser) | zod | — | — |
| `createTourFromClientsAction` (347) | input | compte connecté | requireUser, getCurrentUser (via currentDb) | requireModule | currentDb, dbFor (via currentDb), prisma nu (via requireUser) | zod | — | — |
| `updateTourRunEndpointsAction` (436) | input | compte connecté | requireUser, getCurrentUser (via requireModule) | requireModule | currentDb, dbFor (via requireOwnedTourRun), prisma nu (via requireUser) | zod | — | — |
| `updateTourRunOptionsAction` (486) | input | compte connecté | requireUser, getCurrentUser (via currentDb) | requireModule | currentDb, dbFor (via currentDb), prisma nu (via requireUser) | zod | — | — |
| `deleteTourRunAction` (519) | tourRunId | compte connecté | requireUser, getCurrentUser (via currentDb) | requireModule | currentDb, dbFor (via currentDb), prisma nu (via requireUser) | zod | — | — |
| `deleteTourRunsAction` (565) | tourRunIds | compte connecté | requireUser, getCurrentUser (via currentDb) | requireModule | currentDb, dbFor (via currentDb), prisma nu (via requireUser) | zod | — | — |
| `addAppointmentStopsAction` (593) | input | compte connecté | requireUser, getCurrentUser (via currentDb) | requireModule | currentDb, dbFor (via currentDb), prisma nu (via requireUser) | zod | — | — |
| `addManualStopAction` (649) | input | compte connecté | requireUser, getCurrentUser (via currentDb) | requireModule | currentDb, dbFor (via currentDb), prisma nu (via requireUser) | zod | — | — |
| `updateStopAction` (702) | input | compte connecté | requireUser, getCurrentUser (via currentDb) | requireModule | currentDb, dbFor (via currentDb), prisma nu (via requireUser) | zod | — | — |
| `updateStopScheduleAction` (764) | input | compte connecté | requireUser, getCurrentUser (via requireModule) | requireModule | currentDb, dbFor (via saveAppointmentAction), readDb (via saveAppointmentAction), publicDb (via saveAppointmentAction), prisma nu (via requireUser), SQL brut (via saveAppointmentAction) | zod | — | audit (via saveAppointmentAction) |
| `removeStopAction` (842) | input | compte connecté | requireUser, getCurrentUser (via currentDb) | requireModule | currentDb, dbFor (via currentDb), prisma nu (via requireUser) | zod | — | — |
| `cancelStopAppointmentAction` (875) | input | compte connecté | requireUser, getCurrentUser (via currentDb) | requireModule | currentDb, dbFor (via currentDb), readDb (via updateAppointmentStatusAction), prisma nu (via requireUser) | zod | — | audit (via updateAppointmentStatusAction) |
| `reorderStopsAction` (915) | input | compte connecté | requireUser, getCurrentUser (via requireModule) | requireModule | currentDb, dbFor (via saveAppointmentAction), readDb (via saveAppointmentAction), publicDb (via saveAppointmentAction), prisma nu (via requireUser), SQL brut (via saveAppointmentAction) | zod | — | audit (via saveAppointmentAction) |
| `moveStopAction` (976) | input | compte connecté | requireUser, getCurrentUser (via currentDb) | requireModule | currentDb, dbFor (via currentDb), readDb (via reorderStopsAction), prisma nu (via reorderStopsAction), SQL brut (via reorderStopsAction) | zod | — | audit (via reorderStopsAction) |
| `recomputeRouteAction` (1006) | tourRunId | compte connecté | requireUser, getCurrentUser (via requireModule) | requireModule | currentDb (via recomputeAndPersistRoute), dbFor (via requireOwnedTourRun), prisma nu (via isRateLimited) | zod | débit | — |
| `optimizeTourRunAction` (1040) | tourRunId | compte connecté | requireUser, getCurrentUser (via currentDb) | requireModule | currentDb, dbFor (via currentDb), readDb (via resolveTourEndpoints), prisma nu (via isRateLimited) | zod | débit | — |
| `applyOptimizationProposalAction` (1125) | tourRunId, confirmed | compte connecté | requireUser, getCurrentUser (via currentDb) | requireModule | currentDb, dbFor (via currentDb), readDb (via reorderStopsAction), prisma nu (via reorderStopsAction), SQL brut (via reorderStopsAction) | zod | — | audit (via reorderStopsAction) |
| `dismissOptimizationProposalAction` (1159) | tourRunId | compte connecté | requireUser, getCurrentUser (via currentDb) | requireModule | currentDb, dbFor (via currentDb), prisma nu (via requireUser) | zod | — | — |
| `upsertSavedPlaceAction` (1194) | input | compte connecté | requireUser, getCurrentUser (via currentDb) | requireModule | currentDb, dbFor (via currentDb), prisma nu (via requireUser) | zod | — | — |
| `deleteSavedPlaceAction` (1240) | id | compte connecté | requireUser, getCurrentUser (via currentDb) | requireModule | currentDb, dbFor (via currentDb), prisma nu (via requireUser) | zod | — | — |
| `updateTourPreferencesAction` (1278) | input | compte connecté | requireUser, getCurrentUser (via currentDb) | requireModule | currentDb, dbFor (via currentDb), prisma nu (via requireUser) | zod | — | — |
| `reverseGeocodeAction` (1305) | input | compte connecté | requireUser, getCurrentUser (via requireModule) | requireModule | prisma nu (via isRateLimited) | zod | débit | — |

#### `src/lib/tour-suggestions.ts` — 1 fonction exportée

| Fonction (ligne) | Paramètres | Qui peut l'appeler | Authentification | Rôle, permission, module | Cloisonnement | Validation | Débit | Journal |
|---|---|---|---|---|---|---|---|---|
| `getSuggestedToursForAddressAction` (71) | slug, input | **public (sans session)** | getCurrentUser (via getAvailability) | requireModule (via moduleOpenFor) | dbForSlug, dbFor (via dbForSlug), readDb (via getAvailability), publicDb (via getAvailability), prisma nu (via dbForSlug) | — | — | — |

#### `src/lib/tours-actions.ts` — 9 fonctions exportées

| Fonction (ligne) | Paramètres | Qui peut l'appeler | Authentification | Rôle, permission, module | Cloisonnement | Validation | Débit | Journal |
|---|---|---|---|---|---|---|---|---|
| `saveTourAction` (94) | input | compte connecté | requireUser, getCurrentUser (via requireModule) | hasPermission, rôle (via hasPermission), requireModule | currentDb, dbFor (via toTour), readDb (via toTour), publicDb (via toTour), prisma nu (via requireUser) | — | — | — |
| `toggleTourStatusAction` (151) | id | compte connecté | requireUser, getCurrentUser (via requireModule) | hasPermission, rôle (via hasPermission), requireModule | currentDb, dbFor (via toTour), readDb (via toTour), publicDb (via toTour), prisma nu (via requireUser) | — | — | — |
| `deleteTourAction` (180) | id | compte connecté | requireUser, getCurrentUser (via currentDb) | hasPermission, rôle (via hasPermission), requireModule | currentDb, dbFor (via currentDb), prisma nu (via requireUser) | — | — | — |
| `saveZoneAction` (216) | input | compte connecté | requireUser, getCurrentUser (via currentDb) | hasPermission, rôle (via hasPermission), requireModule | currentDb, dbFor (via currentDb), prisma nu (via requireUser) | — | — | — |
| `deleteZoneAction` (274) | id | compte connecté | requireUser, getCurrentUser (via currentDb) | hasPermission, rôle (via hasPermission), requireModule | currentDb, dbFor (via currentDb), prisma nu (via requireUser) | — | — | — |
| `reassignAndDeleteZoneAction` (303) | zoneId, targetZoneId | compte connecté | requireUser, getCurrentUser (via currentDb) | hasPermission, rôle (via hasPermission), requireModule | currentDb, dbFor (via currentDb), prisma nu (via requireUser) | — | — | — |
| `addTourStopAction` (355) | input | compte connecté | requireUser, getCurrentUser (via getPublicZones) | hasPermission, rôle (via hasPermission), requireModule | currentDb, dbFor (via getPublicZones), readDb (via getPublicServices), publicDb (via getPublicZones), prisma nu (via getPublicZones), SQL brut (via saveAppointmentAction) | zod (via geocodeAddress) | — | audit (via saveAppointmentAction) |
| `findTourPatternForDateAction` (426) | dateId | compte connecté | requireUser, getCurrentUser (via currentDb) | requireModule | currentDb, dbFor (via currentDb), prisma nu (via requireUser) | — | — | — |
| `searchZonesAction` (468) | rawQuery | compte connecté | getCurrentUser | requireModule | currentDb, dbFor (via currentDb), prisma nu (via moduleOpen) | — | — | — |

#### `src/lib/verification-actions.ts` — 1 fonction exportée

| Fonction (ligne) | Paramètres | Qui peut l'appeler | Authentification | Rôle, permission, module | Cloisonnement | Validation | Débit | Journal |
|---|---|---|---|---|---|---|---|---|
| `resubmitVerificationAction` (19) | rawNumber | compte connecté | requireUser, getCurrentUser (via logAudit) | hasPermission, rôle (via hasPermission) | dbFor, prisma nu (via logAudit), SQL brut (via registrationNumberTaken) | — | — | audit |

---

## 3. Modèle de données (35 modèles)

*Obtenu par lecture de `prisma/schema.prisma`, de la liste `TENANT_MODELS` (`src/lib/db-scope.ts:39`), des migrations (61 dossiers, dont `20260922170000_row_level_security`), de `src/lib/platform/organization-deletion.ts`, `src/lib/deletion-plan.ts` et `src/lib/platform/organization-export.ts`. Les colonnes « Effacement » et « Export » indiquent que le modèle est **cité** dans ces fichiers ; ce que chacun en fait réellement sera vérifié en phase 4. `tests-unit/purge-coverage.test.ts` échoue si un modèle du schéma n'est classé ni « purgé » ni « exclu avec sa raison » ; il passe à ce jour.*

| Modèle | `organizationId` | `userId` | Client cloisonné | Règle RLS | Effacement | Export |
|---|---|---|---|---|---|---|
| Client | oui | — | oui | oui | oui | oui |
| Animal | oui | — | oui | oui | oui | oui |
| AnimalPlace | oui | — | oui | oui | oui | oui |
| Consultation | oui | — | oui | oui | oui | oui |
| AnimalDocument | oui | — | oui | oui | oui | oui |
| StudioDocument | oui | — | oui | oui | oui | oui |
| Appointment | oui | — | oui | oui | oui | oui |
| AppointmentSlotOption | oui | — | oui | oui | oui | oui |
| AppointmentCalendarEvent | oui | — | oui | oui | oui | oui |
| BlockedSlot | oui | oui | oui | oui | oui | oui |
| Reminder | oui | — | oui | oui | oui | oui |
| Zone | oui | — | oui | oui | oui | oui |
| City | oui | — | oui | oui | oui | oui |
| Tour | oui | — | oui | oui | oui | oui |
| TourRun | oui | oui | oui | oui | oui | oui |
| TourStop | oui | — | oui | oui | oui | oui |
| SavedPlace | oui | oui | oui | oui | oui | oui |
| MapView | oui | oui | oui | oui | oui | oui |
| BusinessProfile | oui | — | oui | oui | oui | oui |
| Service | oui | — | oui | oui | oui | oui |
| ClientImport | oui | oui | oui | oui | oui | oui |
| **User** | oui | — | **—** | **—** | oui | oui |
| **AuditLog** | oui | oui | **—** | **—** | oui | **—** |
| **StudioDocumentTemplate** | oui | — | **—** | **—** | oui | oui |
| **Invitation** | oui | — | **—** | **—** | oui | **—** |
| **CalendarConnection** | — | oui | **—** | **—** | oui | oui |
| **Session** | — | oui | **—** | **—** | oui | **—** |
| **PasswordResetToken** | — | oui | **—** | **—** | oui | **—** |
| **TwoFactorCode** | — | oui | **—** | **—** | oui | **—** |
| **AgendaPreferences** | — | oui | **—** | **—** | oui | **—** |
| **TourPreferences** | — | oui | **—** | **—** | oui | **—** |
| **DashboardPreferences** | — | oui | **—** | **—** | oui | **—** |
| **RateLimitEvent** | — | — | **—** | **—** | oui | **—** |
| **Organization** | — | — | **—** | **—** | oui | oui |
| **DeletionRecord** | — | — | **—** | **—** | oui (conservé volontairement, `docs/RGPD-EFFACEMENT.md`) | **—** |

**Modèles absents d'au moins une colonne** (signalés, sans jugement à ce stade) :

- **Ni client cloisonné ni règle RLS, alors qu'ils portent un cabinet** : `User`, `AuditLog`, `StudioDocumentTemplate`, `Invitation`. Leur protection repose uniquement sur le code qui les lit.
- **Rattachés à un compte et non à un cabinet** : `CalendarConnection` (jetons Google chiffrés), `Session`, `PasswordResetToken`, `TwoFactorCode`, les trois modèles de préférences.
- **Absents de l'export** : `AuditLog`, `Invitation`, `Session`, `PasswordResetToken`, `TwoFactorCode`, `AgendaPreferences`, `TourPreferences`, `DashboardPreferences`, `RateLimitEvent`, `DeletionRecord`.
- **Sans cabinet ni compte** : `RateLimitEvent` (une clé et une date), `DeletionRecord` (empreintes), `Organization`.

---

## 4. Données personnelles

*Obtenu par lecture des champs de `prisma/schema.prisma` et des appels sortants de `src/`.*

### 4.1 Qui, quoi, où

| Personnes | Données | Tables |
|---|---|---|
| **Clients des professionnels** (propriétaires d'animaux) | nom, prénom, téléphone, e-mail, adresse, code postal, ville, position GPS et précision du géocodage | `Client` |
| | nom du client recopié en texte, adresse et position du rendez-vous, notes libres | `Appointment` |
| | adresse et position des arrêts d'une tournée, notes | `TourStop` |
| | adresse et position des lieux où vivent les animaux, notes | `AnimalPlace` |
| | note libre et dates de relance | `Reminder` |
| **Leurs animaux** (données rattachées à une personne) | nom, espèce, race, âge, date de naissance, poids, sexe, photo, antécédents, pathologies, traitements, notes | `Animal` |
| | comptes rendus de consultation, résumé, prix | `Consultation`, `StudioDocument` (contenu, PDF, vignette), `AnimalDocument` |
| **Visiteurs de la page de réservation** | les mêmes données qu'un client, saisies dans le formulaire ; jusqu'à trois horaires proposés | `Client`, `Animal`, `Appointment`, `AppointmentSlotOption` |
| | adresse IP, sous une forme à préciser en phase 2 | `RateLimitEvent.key` (`src/lib/privacy.ts:19`) |
| **Professionnels et leurs équipes** | e-mail, nom, prénom, mot de passe haché, rôle, permissions, date de dernière connexion, jeton du flux d'agenda | `User` |
| | navigateur utilisé, motif d'assistance | `Session` |
| | identité professionnelle, téléphone, e-mail, adresse, position, point de départ des tournées, biographie, photo, logo, réseaux sociaux, **numéro d'enregistrement professionnel** | `BusinessProfile` |
| | compte Google relié (e-mail, jetons chiffrés) | `CalendarConnection` |
| | actions effectuées, adresse IP | `AuditLog` |
| **Personnes invitées** | e-mail, nom du futur espace | `Invitation` |
| **Fichiers importés** | nom du fichier et compteurs (pas les lignes) | `ClientImport` |

Aucune catégorie particulière de données au sens du RGPD (santé d'une personne, etc.) n'a été repérée dans le schéma : les données de santé concernent des animaux. Les champs libres (`notes`, `history`, comptes rendus) peuvent en contenir si un professionnel en saisit ; ce point sera repris en phase 4.

### 4.2 Services extérieurs

| Service | Hôte | Appelé depuis | Données transmises (première lecture) |
|---|---|---|---|
| Hébergeur de l'application et de la base (Iridflow, d'après `Dockerfile`, `scripts/deploy-iridflow.mjs` et `docs/PLAN-MULTI-COMPTES.md`) | — | — | toutes |
| Mailjet (envoi d'e-mails) | `api.mailjet.com` | serveur (`src/lib/email/provider.ts:72`, `:121`, `:126`) | adresses e-mail, contenu des messages ; suppression d'un contact à l'effacement |
| IGN Géoplateforme (recherche d'adresse, géocodage) | `data.geopf.fr` | serveur (`src/app/api/address-search/route.ts:16`, `src/lib/maps/geocoding-provider.ts:12`) | adresses saisies, adresses de clients |
| IGN Géoplateforme (photos aériennes) | `data.geopf.fr` | **navigateur** (`src/components/tours/real-map.tsx:53`) | adresse IP et zone regardée |
| API Découpage administratif | `geo.api.gouv.fr` | serveur (`src/lib/geo-search.ts:53`, `src/app/api/territory/route.ts:64`) | noms et codes de communes |
| openrouteservice (itinéraires, optimisation) | `api.heigit.org` | serveur (`src/lib/maps/routing-provider.ts:12`, `optimization-provider.ts:8`) | positions des arrêts d'une tournée |
| OpenStreetMap (fond de carte « Plan ») | `tile.openstreetmap.org` | **navigateur** (`real-map.tsx:48`) | adresse IP et zone regardée |
| OpenFreeMap (fond de carte des tournées) | `tiles.openfreemap.org` | **navigateur** (`src/lib/maps/map-utils.ts:7`) | adresse IP et zone regardée |
| Google (agenda) | `accounts.google.com`, `oauth2.googleapis.com`, `www.googleapis.com` | serveur, si le professionnel connecte son agenda | contenu des rendez-vous synchronisés (à préciser) |
| Unsplash (photos par défaut des prestations) | `images.unsplash.com` | **navigateur** (`src/data/service-photos.ts:7-11`) | adresse IP du visiteur de la page de réservation |
| Google Maps, Waze, Plans (liens « Y aller ») | liens ouverts par l'utilisateur | navigateur | la destination, quand l'utilisateur clique |
| GitHub | `github.com` | — | le code source, **dépôt public** |

Les polices sont servies par l'application elle-même (`next/font/google`, `src/app/layout.tsx:23`) : aucun appel à Google au chargement d'une page, à confirmer en phase 4 par observation du réseau.

---

## 5. Hébergement

*Obtenu par lecture de `Dockerfile`, `scripts/deploy-iridflow.mjs`, `scripts/runtime-role.mjs`, `vercel.json`, `src/instrumentation.ts`.*

- **Application** : image `node:22-slim`. Au démarrage, la commande du conteneur enchaîne : choix de l'adresse de la base (`DB_URL`, à défaut `DATABASE_URL`), `prisma migrate deploy`, modèles de documents, création du premier administrateur (`prisma/bootstrap-admin.ts`), création du compte restreint (`scripts/runtime-role.mjs`), puis `npm start` (`Dockerfile`, ligne `CMD`). L'adresse publique `https://app.1002pattes.fr` est fixée à la construction (`ARG PUBLIC_APP_URL`).
- **Base** : PostgreSQL. Le compte fourni par l'hébergeur est un superutilisateur ; `runtime-role.mjs` crée un compte ordinaire `app_runtime` (`NOSUPERUSER NOBYPASSRLS`, ligne 68) sous lequel le site tourne. **En cas d'échec du script, le site démarre quand même sous le compte d'origine** (`runtime-role.mjs:23-24` ; `|| true` dans le `Dockerfile`).
- **Tâches de fond** : un planificateur interne démarre avec le serveur (`src/instrumentation.ts`, `src/lib/scheduler/`), commandé par `SCHEDULER_ENABLED`. Une route `/api/cron/daily` existe aussi, protégée par `CRON_SECRET`.
- **Localisation du serveur et de la base** : **non vérifié** — rien dans le dépôt ne l'établit. À demander à l'hébergeur (déjà noté « à confirmer » dans l'audit de pré-production).
- **Sauvegardes** : durées de conservation « à compléter » dans `docs/RGPD-EFFACEMENT.md` (§3).

**Restes d'une configuration abandonnée ou d'une étape intermédiaire** :

| Élément | Constat |
|---|---|
| `vercel.json` | Déclare une tâche planifiée Vercel (`/api/cron/daily`, chaque jour à 6 h). L'application n'est pas hébergée chez Vercel. |
| `scripts/deploy-iridflow.mjs` (`npm run deploy`) | Pousse vers un dépôt distant nommé `gitea`. Ce distant n'est pas configuré : `git remote -v` ne montre que `origin` (GitHub). D'après les notes de travail des sessions précédentes, le site tire désormais GitHub directement — **non vérifiable dans le dépôt**. |
| `publicDb()` et `readDb()` (`src/lib/organization.ts:119`, `:137`) | Accès hérités de l'époque à un seul cabinet : sans compte connecté, ils désignent « le seul cabinet existant » et échouent s'il y en a deux. Encore appelés par des fonctions exportées (voir 2.4 : `getBusinessProfile`, `getAvailability`, `getReminderSettings`, `getServices`, `getPublishedPublicPage`). |
| Valeur par défaut `org-1002-pattes` posée par la base | Déclarée « reste de la phase 1 » dans `docs/PLAN-MULTI-COMPTES.md`. |
| `AUTH_EMAIL`, `AUTH_PASSWORD_HASH_BASE64` | Variables de l'ancien compte unique, encore lues une fois chacune ; `BOOTSTRAP_ADMIN_*` les a remplacées au démarrage. |
| Base Neon | Citée par les audits de septembre comme base de développement. Le poste de développement utilise aujourd'hui PostgreSQL en local. |

**Variables d'environnement lues par le code** (30) : `DATABASE_URL`, `DB_URL`, `SESSION_SECRET`, `RUNTIME_DB_SECRET`, `CALENDAR_TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`, `MAILJET_API_KEY`, `MAILJET_API_SECRET`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME`, `MAIL_REPLY_TO`, `SUPPORT_EMAIL`, `VERIFICATION_NOTIFICATION_EMAIL`, `OPENROUTESERVICE_API_KEY`, `PLATFORM_ADMIN_EMAILS`, `SCHEDULER_ENABLED`, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_FIRST_NAME`, `BOOTSTRAP_ADMIN_LAST_NAME`, `BOOTSTRAP_ADMIN_PASSWORD_HASH_BASE64`, `AUTH_EMAIL`, `AUTH_PASSWORD_HASH_BASE64`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_MAP_STYLE_URL`, `NEXT_PUBLIC_RUNNING_DOG`, `NODE_ENV`, `NEXT_RUNTIME`, `NEXT_DIST_DIR`, `E2E_PORT`, `E2E_WEB_SERVER`. Aucune clé de service n'est préfixée `NEXT_PUBLIC_`. Ce qui se passe quand l'une manque sera établi en phase 1.

**Fichiers d'environnement** : `.env.local` et `.env.test.local` existent sur le poste et sont ignorés par git ; seuls leurs modèles (`.env.local.example`, `.env.test.local.example`) sont suivis. L'historique complet du dépôt public (415 commits depuis le 24 août 2026) sera fouillé en phase 2, partie E.

---

## 6. État de santé de départ

*Commandes lancées le 9 octobre 2026 sur le commit `18e52a8`.*

| Commande | Résultat brut |
|---|---|
| `npx tsc --noEmit` | aucune erreur (code de sortie 0) |
| `npx eslint src tests tests-unit` | aucune erreur, aucun avertissement |
| `npm run test:unit` | 410 tests, 410 réussis, 0 échec (2,6 s) |
| `npm audit --omit=dev` | **10 vulnérabilités : 2 critiques, 7 élevées, 1 faible** |

Détail de `npm audit --omit=dev` :

| Gravité | Paquet | Versions touchées | Correctif proposé |
|---|---|---|---|
| critique | `next` (installé : 16.3.5) | 16.0.0 à 16.3.7 | `next@16.4.0` |
| critique | `maplibre-gl` (déclaré : ^5.24.0) | ≤ 6.4.0 | `maplibre-gl@6.13.0`, version majeure |
| élevée | `prisma`, `@prisma/config`, `deepmerge-ts`, `mysql2` | chaîne de dépendances de Prisma | l'outil propose `prisma@6.19.3`, soit un **retour en arrière** depuis la version 7 déclarée : à examiner |
| élevée | `sharp` | < 0.35.5 | `npm audit fix` |
| élevée | `fast-uri` | 3.0.0 à 3.1.7 | `npm audit fix` |
| élevée | `source-map-js` | 1.0.0 à 1.2.1 | `npm audit fix` |
| faible | `dompurify` | ≤ 3.4.15 | `npm audit fix` |

Les avis publiés pour `next` portent sur : exécution de code dans `next/og`, fuite de contenu via `use cache`, empoisonnement de cache des pages statiques, endpoint de développement, routes d'images de métadonnées, requêtes forgées dans l'optimiseur d'images. Lesquels touchent réellement cette application sera établi en phase 2, partie F.

**Tests de bout en bout** (pour mémoire, lancés le même jour sur la base de développement locale, avant cet audit) : 471 tests, 454 réussis, 6 échecs déjà connus, 6 ignorés, 5 non lancés. L'intégration continue (`.github/workflows/ci.yml`) ne lance que le typage, le lint, les tests unitaires et la suite de cloisonnement ; elle est verte sur `83ee976`.

**Outillage disponible pour les phases suivantes** : `npm run test:db:setup` (`scripts/test-db.mjs`) et `npm run test:e2e` (`scripts/e2e.mjs`), sur une base dont l'adresse vient de `.env.test.local`. Avant la première attaque (phase 3), l'hôte et le nom de la base visés seront affichés et contrôlés.
