# Audit 2026-10 — Phase 2 : sécurité du code (boîte blanche)

*Établi le 9 octobre 2026 sur le commit `f579765`. Lecture du code uniquement : aucune attaque n'a été lancée dans cette phase. Les constats marqués « à prouver en phase 3 » sont établis par la lecture ; la simulation d'attaque dira s'ils sont exploitables tels quels.*

**Méthode.** Celle de la compétence `.claude/skills/security-review` : un constat n'est retenu que si le défaut est dans le code **et** si la donnée vient bien de l'extérieur. Chaque constat cite `fichier:ligne`. Les points vérifiés et jugés sains sont listés aussi : une barrière qui tient est un résultat.

**Identifiants.** `SEC-xx`, numérotés dans l'ordre de lecture. Les identifiants `SEC-01` à `SEC-08` de l'audit de pré-production (21 septembre) sont cités sous la forme « pré-production `SEC-04` » pour éviter toute confusion.

---

## A. Authentification et sessions

### Ce qui tient

| Point | Constat | Preuve |
|---|---|---|
| Jeton de session | JWT signé HS256, 7 jours, algorithme imposé à la vérification | `src/lib/auth/session.ts:27-41` |
| Révocation | Chaque requête relit la session en base : révoquée, expirée, compte désactivé, espace suspendu, mot de passe changé depuis → refus | `src/lib/auth/dal.ts:61-70` |
| Déconnexion | La session est marquée révoquée en base, puis le cookie effacé. **Pré-production `SEC-04` (jeton valable 7 jours après déconnexion) : corrigé.** | `src/lib/auth/session-store.ts:23-28` |
| Changement de mot de passe | Tout jeton émis avant est refusé | `dal.ts:70` (`payload.iat < passwordChangedAt`) |
| Cookie | `httpOnly`, `Secure` en production, `SameSite=Lax`, chemin `/` | `session.ts:45-51` |
| Mots de passe | bcrypt, coût 12 ; 10 caractères, minuscule, majuscule, chiffre, caractère spécial | `src/lib/auth/credentials.ts:13`, `password-policy.ts:5-9` |
| Réinitialisation | Jeton de 32 octets aléatoires, stocké haché (SHA-256), valable 30 minutes, à usage unique ; message identique que le compte existe ou non ; 5 demandes par adresse et par demi-heure | `tokens.ts:5`, `password-reset-actions.ts:20-22`, `:27-32`, `:70-73` |
| Double authentification | Aucune session n'est ouverte avant la validation du code : le cookie d'attente porte un autre nom et n'ouvre rien. Appeler directement une action d'après-connexion ne contourne pas l'étape. | `two-factor-actions.ts:19-62`, `dal.ts:62-63` |
| Invitation | Jeton de 64 caractères hexadécimaux, stocké haché, 7 jours, réservé par une écriture conditionnelle dans une transaction (un seul usage possible) | `src/lib/platform/invitations.ts:33`, `invitation-actions.ts:137-142` |
| Compte de plateforme | Désigné par une variable d'environnement, jamais par un écran ; l'accès à `/plateforme` exige la double authentification | `src/lib/platform/grants.ts:20-30`, `access.ts:18-25` |
| Premier administrateur | Créé seulement si aucun administrateur n'existe ; le mot de passe arrive déjà haché | `prisma/bootstrap-admin.ts:13-21` |
| Journaux | En production, ni code ni lien n'est écrit dans le journal (destinataire masqué et sujet seulement) | `src/lib/email/provider.ts:49-52` |

### Constats

**`SEC-01` · P1 · Le code de double authentification peut être deviné par essais automatiques** — *à prouver en phase 3*
- *En clair* : la double authentification sert quand le mot de passe a fuité. Or quelqu'un qui a le mot de passe peut essayer des codes sans fin : la protection ne tient alors que quelques heures.
- *Preuve* : `src/lib/auth/two-factor-actions.ts`.
  - Cinq essais par code (`:16`, `:40`), mais le compteur est lu puis augmenté en deux temps (`:40`, `:45`) : des requêtes envoyées en même temps passent toutes le contrôle avant que le compteur ne bouge.
  - `resendTwoFactorCode` (`:66-79`) crée un nouveau code, compteur à zéro, **sans aucune limite**, et renouvelle le cookie d'attente de 10 minutes : la fenêtre ne se referme jamais.
  - Aucune limitation de débit sur `verifyTwoFactorCode` ni sur `resendTwoFactorCode`.
- *Scénario* : mot de passe obtenu par hameçonnage → connexion → boucle « 5 essais, nouveau code » (ou rafales parallèles sur un même code). 900 000 codes possibles : quelques centaines de milliers de requêtes suffisent en moyenne. La victime reçoit un e-mail à chaque renvoi, ce qui l'alerte mais ne bloque rien.
- *Correctif* : limiter les renvois (3 par quart d'heure) et les vérifications (par compte, en base), rendre l'essai atomique (`updateMany … where attempts < 5`), ne pas renouveler le cookie d'attente au renvoi, verrouiller la connexion après N codes épuisés.
- *Effort* : S. *Audits précédents* : non relevé.

**`SEC-02` · P2 · L'adresse IP du visiteur est lue dans un en-tête qu'il peut écrire lui-même**
- *En clair* : plusieurs protections comptent les tentatives « par adresse IP ». Le logiciel lit cette adresse dans une information envoyée par le navigateur ; un attaquant la change à chaque requête et n'est jamais compté.
- *Preuve* : premier élément de `x-forwarded-for`, à trois endroits — `src/lib/auth/actions.ts:28`, `src/lib/appointments-actions.ts:1297`, `src/lib/audit.ts:70`. Derrière un serveur frontal qui *ajoute* l'adresse réelle à la suite, le premier élément est celui fourni par le client. **Non vérifié** : la configuration du serveur frontal de l'hébergeur (hors dépôt).
- *Scénario* : contournement de la limite par IP à la connexion (la limite par adresse e-mail tient toujours) et, surtout, de celles de la réservation publique ; adresses fausses dans le journal d'audit. À défaut d'en-tête, toutes les requêtes partagent la clé « unknown ».
- *Correctif* : prendre l'adresse posée par le serveur frontal (dernier élément, ou `x-real-ip`) après avoir confirmé avec l'hébergeur lequel est fiable ; le centraliser dans une seule fonction.
- *Effort* : S. *Audits précédents* : non relevé (la limitation elle-même date d'août, `P2-15`, `P2-26`).

**`SEC-03` · P2 · Un seul secret sert à trois usages, sans exigence de longueur ni moyen de le changer sans dégâts**
- *En clair* : la clé qui signe les sessions sert aussi à masquer les adresses dans les compteurs et à fabriquer le mot de passe du compte de base de données. La changer après une fuite a des effets en chaîne.
- *Preuve* : signature des sessions (`src/lib/auth/session.ts:12-14`, aucune longueur minimale) ; pseudonymes des clés de limitation (`src/lib/privacy.ts:3-5`) ; mot de passe du compte `app_runtime` à défaut de `RUNTIME_DB_SECRET` (`scripts/runtime-role.mjs:45`).
- *Scénario* : un secret court se retrouve par essais hors ligne à partir d'un seul cookie. L'attaquant doit encore connaître un identifiant de session valide pour entrer (contrôle en base), ce qui limite la portée ; il peut en revanche fabriquer le cookie d'attente de la double authentification pour n'importe quel compte.
- *Correctif* : refuser de démarrer avec un secret de moins de 32 octets ; un secret par usage (`RUNTIME_DB_SECRET` obligatoire en production) ; accepter deux secrets pendant une rotation.
- *Effort* : S à M. *Audits précédents* : non relevé.

**`SEC-04` · P2 · La double authentification est facultative, y compris pour l'administrateur d'un cabinet**
- *En clair* : un espace créé par invitation démarre sans double authentification, et seul son administrateur peut l'activer, compte par compte.
- *Preuve* : `invitation-actions.ts:158` (compte créé sans l'option) ; `prisma/bootstrap-admin.ts:24` (`twoFactorEnabled: false`) ; activation réservée à l'administrateur (`src/lib/admin/actions.ts:130`).
- *Correctif* : la proposer à la fin de l'onboarding, laisser chaque compte l'activer pour lui-même, l'imposer aux administrateurs.
- *Effort* : M. *Audits précédents* : non relevé.

**`SEC-05` · P3 · Le temps de réponse révèle si une adresse e-mail a un compte**
- *Preuve* : à la connexion, le mot de passe n'est comparé (opération lente) que si le compte existe et est actif (`src/lib/auth/actions.ts:50`) ; au mot de passe oublié, l'e-mail est envoyé avant de répondre (`password-reset-actions.ts:40-43`).
- *Correctif* : comparer contre un hachage factice quand le compte n'existe pas ; envoyer l'e-mail après la réponse.
- *Effort* : S. *Audits précédents* : l'audit de pré-production jugeait l'énumération impossible (messages identiques) ; le temps de réponse n'avait pas été regardé.

**`SEC-06` · P3 · N'importe qui peut bloquer la connexion d'un compte dont il connaît l'adresse**
- *Preuve* : dix tentatives par adresse et par quart d'heure, comptées avant toute vérification (`src/lib/auth/actions.ts:41-45`).
- *Scénario* : dix mauvais mots de passe toutes les quinze minutes empêchent un professionnel d'entrer.
- *Correctif* : ne compter par adresse que les échecs, allonger progressivement le délai plutôt que bloquer net, prévenir le titulaire.
- *Effort* : S. *Audits précédents* : compromis d'origine (août), jamais discuté.

**`SEC-07` · P3 · Durcissements de session et de jetons**
- Une session dure 7 jours quoi qu'il arrive : pas d'expiration après inactivité, pas de liste des sessions ni de « déconnecter partout » (`session.ts:5`).
- Utiliser un lien de réinitialisation n'annule pas les autres liens encore valides du même compte (`password-reset-actions.ts:81-84`).
- Le jeton du flux d'agenda est stocké en clair (`User.icsFeedToken`, `src/lib/calendar-actions.ts:83-84`) ; sa désactivation n'est pas inscrite au journal (`:93-97`).
- Le cookie de session ne porte pas le préfixe `__Host-`.
- *Effort* : S chacun. *Audits précédents* : la liste des sessions était notée absente en pré-production.

---

## B. Contrôle d'accès et cloisonnement entre cabinets

### Comment le cloisonnement est construit

1. **Première barrière, dans le logiciel.** Le code métier obtient sa base par `currentDb()` (`src/lib/organization.ts:76`) : un client qui ajoute le cabinet du compte connecté à toute lecture, le pose sur toute création et refuse de déplacer une ligne (`src/lib/db-scope.ts:126-145`). Vingt et un modèles sont couverts (`TENANT_MODELS`, `:39`).
2. **Seconde barrière, dans la base.** Des règles (RLS) forcées sur ces mêmes tables n'autorisent que les lignes du cabinet déclaré par la connexion (`prisma/migrations/20260922170000_row_level_security/migration.sql:23-32` et suivantes ; `src/lib/db.ts:95-104`).

Deux limites structurelles, voulues et documentées, cadrent tout ce qui suit :

- **La première barrière ne regarde que le premier niveau d'une requête.** Les écritures imbriquées et les relations lues par `include` ne sont pas réécrites (`db-scope.ts:118-125`).
- **La seconde barrière laisse tout passer à une connexion qui ne déclare aucun cabinet** (`COALESCE(current_setting('app.organization_id', true), '') = ''`, `migration.sql:26`). Le client `prisma` nu — celui de la connexion, de la plateforme, des tâches de fond — voit donc toutes les lignes de tous les cabinets. Et elle est **inerte sous un compte superutilisateur**.

### Ce qui tient

| Point | Constat | Preuve |
|---|---|---|
| Comptes de l'équipe | Chaque action exige l'administrateur du cabinet, puis vérifie que le compte visé appartient à **son** espace ; un compte de plateforme ne se modifie que par lui-même | `src/lib/admin/actions.ts:44-50`, `:112-216` |
| Liste des comptes et journal | Filtrés sur le cabinet du compte connecté | `src/lib/admin/users.ts:10-22` |
| Agenda Google, flux d'agenda | La connexion est toujours celle du compte connecté (`userId` de la session, jamais reçu du navigateur) | `src/lib/calendar-actions.ts:16-97` |
| Préférences | Idem | `dashboard-layout-actions.ts:18-73`, `agenda-preferences-actions.ts:13-30` |
| Zones d'une tournée | Les identifiants reçus sont relus dans le cabinet avant d'être reliés | `src/lib/tours-actions.ts:105-108` |
| Lieu d'un animal | Idem | `src/lib/clients-actions.ts:401-405` |
| Relance | L'animal est relu dans le cabinet et rattaché au bon client | `src/lib/reminders-actions.ts:79-82` |
| Plateforme | Les douze actions passent par `platformAccess` (compte de plateforme, double authentification, hors assistance) | `src/lib/platform/*-actions.ts`, `access.ts:18-25` |

### Constats

**`SEC-08` · P1 · Si le compte restreint de la base n'est pas créé au démarrage, le site tourne sans seconde barrière, et rien ne l'arrête** 
- *En clair* : la protection « même si le logiciel se trompe, la base refuse » repose sur un script lancé au démarrage. S'il échoue, le site démarre quand même sous le compte tout-puissant, avec un simple avertissement dans un journal que personne ne lit (voir `EXP-02`).
- *Preuve* : `Dockerfile`, ligne `CMD` (`node scripts/runtime-role.mjs || true`, puis `${RUNTIME_DATABASE_URL:-$DATABASE_URL}`) ; `scripts/runtime-role.mjs:23-24` (« le moindre échec : l'adresse d'origine est rendue ») ; `src/instrumentation.ts` (avertissement seul).
- *Scénario* : un changement chez l'hébergeur ou une erreur de migration fait échouer le script ; tous les constats ci-dessous qui « ne tiennent que grâce à la seconde barrière » deviennent des fuites entre cabinets.
- *Correctif* : en production, refuser de démarrer (ou fermer l'accès) quand la seconde barrière est inactive ; l'exposer dans une route de santé surveillée.
- *Effort* : S. *Audits précédents* : mécanisme postérieur à la pré-production ; le compromis est noté dans `docs/PLAN-MULTI-COMPTES.md`.

**`SEC-09` · P1 · Les communes d'une zone sont enregistrées au nom du premier cabinet** — *à prouver en phase 3*
- *En clair* : quand un professionnel crée une zone de tournée avec des communes, ces communes ne reçoivent pas son cabinet mais une valeur par défaut : celui du tout premier espace.
- *Preuve* : `src/lib/tours-actions.ts:254` et `:256` (`cities: { create: cities }`, écriture imbriquée) ; la première barrière ne pose le cabinet qu'au premier niveau (`db-scope.ts:118-125`) ; la colonne a pour valeur par défaut `"org-1002-pattes"` (`prisma/schema.prisma`, modèle `City`).
- *Scénario* : avec la seconde barrière active, la base refuse l'écriture — **un deuxième cabinet ne peut alors pas créer de zone avec des communes** (défaut fonctionnel). Avec la seconde barrière inactive (`SEC-08`), les communes sont rangées chez le premier cabinet.
- *Correctif* : poser le cabinet explicitement sur chaque commune créée ; retirer la valeur par défaut de la base, comme le prévoit `docs/PLAN-MULTI-COMPTES.md`, pour qu'un oubli échoue franchement.
- *Effort* : S (zone) + M (retrait de la valeur par défaut). *Audits précédents* : la valeur par défaut est un « reste de la phase 1 » déclaré.

**`SEC-10` · P2 · Des identifiants reçus du navigateur sont enregistrés comme liens sans être revérifiés** — *à prouver en phase 3*
- *En clair* : en créant un rendez-vous ou un document, le navigateur envoie l'identifiant du client et de l'animal. Le logiciel les enregistre tels quels ; rien ne vérifie qu'ils appartiennent au même cabinet.
- *Preuve* : `saveAppointmentAction` (`src/lib/appointments-actions.ts:450`, `:452` — `clientId`, `animalId`) ; `createDocumentAction` (`src/lib/documents-actions.ts:191-193` — `clientId`, `animalId`, `appointmentId`). La première barrière ne filtre pas les relations lues ensuite par `include`.
- *Scénario* : un professionnel du cabinet A qui connaîtrait l'identifiant d'un client du cabinet B crée un rendez-vous qui le référence, puis relit ce rendez-vous. Avec la seconde barrière active, la fiche liée reste invisible ; sans elle (`SEC-08`), elle s'affiche. Les identifiants sont aléatoires et non devinables, ce qui limite beaucoup le risque.
- *Correctif* : relire chaque identifiant dans le cabinet avant de l'enregistrer, comme le font déjà les relances, les lieux et les zones.
- *Effort* : S. *Audits précédents* : non relevé.

**`SEC-11` · P1 · Des fonctions de lecture répondent sans connexion tant qu'il n'existe qu'un seul cabinet** — *à prouver en phase 3*
- *En clair* : plusieurs fonctions qui lisent le profil, les horaires, les prestations ou les réglages de rappel n'exigent pas de compte. Sans compte, elles se rabattent sur « le seul cabinet existant ». Tant que la base n'en contient qu'un, un inconnu qui sait les appeler lit ses réglages, y compris ce que le professionnel n'affiche pas.
- *Preuve* : `readDb()` puis `publicDb()` (`src/lib/organization.ts:129-149`) ; fonctions exportées qui s'en servent sans autre contrôle : `getBusinessProfile` (`src/lib/business-profile-actions.ts:48-51`), `getAvailability` (`:228-231`), `getReminderSettings` (`:337-339`), `getServices` et `getPublicServices` (`src/lib/services-actions.ts:86-103`), `getPublishedPublicPage` sans lien (`src/lib/public-page-actions.ts:55`).
- *Scénario* : appel direct de `getBusinessProfile` → ligne complète du profil (e-mail, téléphone, adresse, point de départ des tournées, numéro d'enregistrement, modèles de messages). Dès qu'un deuxième cabinet existe, ces appels échouent — la fuite ne concerne donc que la période à un seul cabinet, mais c'est la situation décrite par `docs/PLAN-MULTI-COMPTES.md` pour le premier professionnel. **À établir en phase 3** : ces fonctions sont-elles réellement atteignables depuis un navigateur (le framework n'expose que les actions référencées par du code client).
- *Correctif* : supprimer `publicDb()` et `readDb()` ; ces fonctions exigent soit un compte, soit un client de base déjà résolu par le lien public.
- *Effort* : M. *Audits précédents* : l'audit de pré-production notait ces fonctions « sans contrôle d'identité, non atteignables » ; le repli sur le cabinet unique date du chantier multi-comptes.

**`SEC-12` · P2 · L'assistance de la plateforme n'est pas en lecture seule**
- *En clair* : quand le compte de plateforme « assiste » un professionnel, il agit à sa place pendant 30 minutes, écritures comprises, sur toutes ses fiches et ses comptes rendus. Le professionnel n'est pas prévenu ; il le voit s'il ouvre son journal.
- *Preuve* : `src/lib/platform/assistance-actions.ts:31-66` (session ouverte au nom du compte visé, `ASSISTANCE_DURATION_MS` = 30 minutes, `:15`) ; seules sont refusées la gestion des comptes de l'équipe (`src/lib/admin/actions.ts:31-33`) et toute écriture dans un espace suspendu (`src/lib/db.ts:113-119`). Le début et la fin sont inscrits au journal avec le motif (`assistance-actions.ts:52-59`, `:92-99`) ; les écritures faites entre les deux ne le sont que là où l'action journalise déjà (voir partie G).
- *Scénario* : pas une faille au sens strict, mais un pouvoir large : un compte de plateforme compromis donne accès en écriture à tous les cabinets, un par un.
- *Correctif* : choisir et écrire la règle (lecture seule par défaut, écriture sur demande explicite) ; prévenir le professionnel par e-mail à chaque assistance ; journaliser chaque écriture faite pendant une assistance.
- *Effort* : M. *Audits précédents* : fonction postérieure. Le volet « information du professionnel » est repris en phase 4.

**`SEC-13` · P3 · Un administrateur peut laisser son cabinet sans administrateur ; la création de compte révèle l'existence d'une adresse ailleurs**
- *Preuve* : le garde-fou « dernier administrateur » n'existe que pour la suppression (`src/lib/admin/actions.ts:183-188`), pas pour le changement de rôle ni la désactivation (`:112-127`). `createUser` répond « un compte existe déjà avec cet email » pour une adresse d'un autre cabinet (`:75-78`) et enregistre le rôle reçu du formulaire sans le valider (`:69`).
- *Correctif* : même garde-fou sur le rôle et la désactivation ; message neutre ; validation du rôle.
- *Effort* : S. *Audits précédents* : non relevé.

**`SEC-14` · P3 · Le rôle « secrétariat » ne restreint presque rien par lui-même**
- *En clair* : les droits tiennent en quatre permissions (supprimer des clients, voir les finances, gérer les réglages publics, gérer les documents). En dehors d'elles, un compte secrétariat lit et modifie tout comme un praticien : antécédents, traitements, notes.
- *Preuve* : `src/lib/auth/permissions.ts:3` ; colonnes « rôle, permission » du tableau de la phase 0 : la plupart des actions de fiches, de rendez-vous, d'import, de lieux et d'envoi de relances ne contrôlent aucune permission.
- *Correctif* : décider si les données de soin doivent être fermées au secrétariat ; si oui, une permission dédiée.
- *Effort* : M. *Audits précédents* : non relevé ; l'essai d'élévation de privilèges est en phase 3.

---

## C. Surface publique sans connexion

### Ce qui tient

| Point | Constat | Preuve |
|---|---|---|
| Désignation du cabinet | Toujours par le lien de l'adresse, jamais par un identifiant envoyé par le visiteur ; un lien inconnu, un espace suspendu, non vérifié ou non configuré ne mènent à rien | `src/lib/organization.ts:158-170` |
| Réservation | Chaque champ est revalidé (zod) ; le prix et la durée sont relus en base ; horaires, mode, fenêtre de dates et conflits sont revérifiés | `src/lib/appointments-actions.ts:1323-1420` |
| Concurrence | Écriture sous verrou par journée, vérification rejouée sous verrou | `appointments-actions.ts` (`withSlotLock`) ; tests `tests/audit/audit-security.spec.ts:97`, `:107` |
| Calendrier public | Ne rend que des créneaux candidats calculés à partir des horaires ; aucun nom, aucune adresse | `src/lib/public-schedule.ts:47-68` |
| Recherche d'adresse | Adresse du service fixée dans le code (pas d'appel vers une adresse fournie par le visiteur), délai d'attente, entrée et réponse validées | `src/app/api/address-search/route.ts:16-50` |
| Contours de territoire | Réservés aux comptes connectés | `src/app/api/territory/route.ts:84` |
| Jetons | Invitation : 256 bits, haché. Réinitialisation : 256 bits, haché. Flux d'agenda : 192 bits, révocable | `tokens.ts:5`, `calendar-actions.ts:83` |

### Constats

**`SEC-15` · P1 · Le téléphone et l'adresse masqués par le professionnel sont quand même envoyés au navigateur du visiteur** — *à prouver en phase 3*
- *En clair* : un professionnel peut décocher « afficher mon téléphone » ou « afficher mon adresse ». L'écran les cache, mais ces informations restent dans la page reçue par le navigateur : il suffit d'afficher le code source. Pour quelqu'un qui exerce depuis chez lui, c'est son adresse personnelle.
- *Preuve* : `loadPublicProfessional` renvoie `phone`, `cabinetAddress`, `cabinetPostalCode`, `cabinetCity`, `cabinetLatitude`, `cabinetLongitude` sans condition (`src/lib/public-professional.ts:38-46`), avec les réglages `showPhonePublicly` et `showAddressPublicly` à côté (`:63-64`). Le masquage est fait par le composant d'affichage, dans le navigateur (`src/components/booking/sidebar/professional-sidebar.tsx:60`, `:95`).
- *Correctif* : vider ces champs côté serveur quand le réglage est décoché.
- *Effort* : S. *Audits précédents* : non relevé. Le test existant (`public-booking-profile.spec.ts`, « désactiver une bascule d'affichage ») ne regarde que l'écran.

**`SEC-16` · P2 · N'importe qui peut reconstituer l'emploi du temps complet d'un professionnel, passé et futur**
- *En clair* : la page de réservation demande au serveur les créneaux déjà pris. Cette fonction accepte n'importe quelle période et dit, pour chaque créneau, s'il s'agit du cabinet ou d'un déplacement à domicile. On peut donc savoir quand le professionnel est absent de chez lui, et mesurer son activité sur des années.
- *Preuve* : `getOccupiedSlotsAction(slug, fromDateId, toDateId)` — aucune borne sur la période, dates non validées, `mode` renvoyé pour chaque rendez-vous (`src/lib/appointments-actions.ts:1590-1626`). La seule limite est par adresse IP (voir `SEC-02`).
- *Correctif* : borner la période à la fenêtre de réservation, valider les dates, ne renvoyer que « occupé » sans le mode quand celui-ci n'est pas nécessaire au calcul.
- *Effort* : S. *Audits précédents* : la limitation de débit de cette fonction date d'août (`P2-15`) ; l'étendue de la période n'avait pas été regardée.

**`SEC-17` · P2 · La réservation en ligne n'a pas de vraie protection contre les robots**
- *En clair* : un script peut envoyer des demandes de rendez-vous en série. Chacune crée une fiche client, bloque jusqu'à trois horaires et fait partir un e-mail à l'adresse saisie.
- *Preuve* : deux barrières seulement — un délai minimal de remplissage calculé à partir d'une heure fournie par le navigateur (`src/lib/booking-validation.ts:225-228`, `appointments-actions.ts:1337`), et des compteurs par adresse IP et par e-mail (`:1298-1301`), le premier contournable (`SEC-02`), le second en changeant d'adresse.
- *Scénario* : agenda saturé de fausses demandes ; e-mails « demande envoyée » adressés à des tiers au nom du cabinet, avec un prénom et un nom d'animal choisis par l'attaquant.
- *Correctif* : corriger `SEC-02`, ajouter un plafond de demandes en attente par cabinet et par jour, et un défi invisible (preuve de travail ou service anti-robot respectueux de la vie privée) ; ne pas envoyer d'e-mail de confirmation à une adresse non vérifiée au-delà d'un seuil.
- *Effort* : M. *Audits précédents* : limitation de débit ajoutée en août ; l'absence d'anti-robot n'était pas relevée.

**`SEC-18` · P2 · Le lien du flux d'agenda donne accès à tous les rendez-vous du cabinet, sans limite de date**
- *En clair* : le lien d'abonnement à l'agenda contient les noms des clients et l'adresse des visites à domicile, pour tout le cabinet et tout l'historique. Quiconque obtient ce lien les lit ; un abonnement dans Google Agenda ou Outlook les confie à ce service.
- *Preuve* : `src/app/api/calendar/feed/[token]/route.ts:19-40` — tous les rendez-vous non annulés de l'espace (`db.appointment.findMany` sans borne de date ni filtre sur le compte), `clientName` dans la description, `location` pour le domicile. Le jeton est dans l'adresse, n'expire pas, et se régénère à la main.
- *Correctif* : borner aux rendez-vous récents et à venir ; permettre un flux sans nom de client ; prévenir dans l'écran que le lien vaut mot de passe.
- *Effort* : S. *Audits précédents* : jugé sain en pré-production (jeton aléatoire) ; le contenu n'avait pas été regardé.

**`SEC-19` · P3 · La recherche d'adresse sert de relais ouvert vers le service de l'IGN**
- *Preuve* : `/api/address-search` — ni compte ni limitation de débit (`src/app/api/address-search/route.ts:27-50`).
- *Correctif* : limitation par adresse IP fiable (après `SEC-02`). *Effort* : S. *Audits précédents* : relevé en pré-production, **toujours ouvert**.

**`SEC-20` · P3 · Le lien de réservation est le nom du professionnel**
- *Preuve* : `acceptInvitationAction` fabrique le lien à partir du prénom et du nom (`src/lib/platform/invitation-actions.ts:149`). La liste des professionnels inscrits se devine à partir d'un annuaire. Sans gravité en soi (la page est publique), à connaître.

---

## D. Injection et contenu

### Ce qui tient

| Point | Constat | Preuve |
|---|---|---|
| Requêtes SQL | Huit requêtes brutes, toutes paramétrées par gabarit : verrou de journée, contrôle de la seconde barrière, unicité d'un numéro, et cinq dans l'effacement d'un espace. Une seule insère un nom de table, pris dans une liste écrite dans le code, jamais dans une saisie | `src/lib/appointments-actions.ts:246`, `src/lib/db-barrier.ts:20`, `src/lib/organization-access.ts:41`, `src/lib/platform/organization-deletion.ts:66`, `:88`, `:132`, `:177`, `:223` |
| Script dans un document | Un seul `dangerouslySetInnerHTML` dans tout le code ; le contenu est nettoyé à l'enregistrement et à l'affichage. **Pré-production `SEC-02` : corrigé**, test vert | `src/components/documents/editor/text-overlay.tsx:78`, `src/lib/documents/html-policy.ts`, `tests/audit/audit-security.spec.ts:169` |
| Champs libres | Affichés par React, qui les échappe | — |
| E-mails | Chaque valeur insérée dans le HTML passe par `escapeHtml` (38 appels) ; l'envoi se fait par une interface JSON, pas par des en-têtes : pas d'injection d'en-tête | `src/lib/email/templates.ts:9`, `provider.ts:72` |
| Redirections | Le paramètre `from` de `/login` est écrit par le logiciel mais jamais lu pour rediriger ; le retour Google revient vers une adresse fixe | `src/proxy.ts:21`, `src/lib/auth/actions.ts:77`, `callback/route.ts` |
| Import | 2 000 lignes au plus, par paquets de 200, 5 imports par période, chaque ligne validée ; le fichier est lu dans le navigateur, le serveur ne reçoit que des lignes | `src/lib/clients-import-actions.ts:22-36`, `:59`, `:109` |

### Constats

**`SEC-21` · P2 · L'export en tableur n'est pas protégé contre les formules**
- *En clair* : un nom saisi sur la page de réservation et commençant par `=` devient, dans l'export ouvert avec un tableur, une formule qui s'exécute.
- *Preuve* : `csvCell` ne traite que les guillemets, points-virgules et retours à la ligne (`src/lib/csv-export.ts:2-5`).
- *Scénario* : la victime est celui qui ouvre l'export — aujourd'hui le compte de plateforme, demain le professionnel (`FONC-05`).
- *Correctif* : préfixer d'une apostrophe toute cellule commençant par `=`, `+`, `-`, `@`, tabulation ou retour chariot.
- *Effort* : S. *Audits précédents* : fonction postérieure.

**`SEC-22` · P2 · Le serveur ne vérifie ni le type ni la taille des images qu'il enregistre**
- *En clair* : photos, logos et couvertures sont réduits dans le navigateur avant l'envoi, mais le serveur accepte ce qu'on lui envoie directement : n'importe quel contenu, jusqu'à 6 Mo par requête, stocké en base.
- *Preuve* : la seule réduction est côté navigateur (`src/lib/images/compress-image.ts`) ; aucune vérification de type dans `src/lib/` (recherche de `data:image` et `startsWith("data:` : aucun contrôle d'entrée) ; limite globale à 6 Mo pour **toutes** les actions, publiques comprises (`next.config.ts`).
- *Scénario* : un compte gonfle la base ; un contenu qui n'est pas une image est servi comme telle. Les images étant affichées par une balise d'image, un SVG piégé ne s'exécute pas.
- *Correctif* : valider côté serveur (préfixe `data:image/jpeg|png|webp`, taille maximale par champ) ; ramener la limite par défaut à 1 Mo et ne la relever que pour les actions qui en ont besoin, si le framework le permet.
- *Effort* : S à M. *Audits précédents* : relevé en pré-production (« aucun contrôle serveur du type ni de la taille »), **toujours ouvert**.

---

## E. Intégrations et secrets

### Ce qui tient

| Point | Constat | Preuve |
|---|---|---|
| Google | Paramètre `state` aléatoire, signé, lié au compte, à usage unique ; périmètres limités aux événements et à la lecture des agendas | `src/lib/calendar/google-oauth-state.ts`, `google-calendar-provider.ts:16` |
| Jetons Google | Chiffrés en AES-256-GCM, vecteur aléatoire, étiquette d'authentification vérifiée | `src/lib/calendar/calendar-encryption.ts:16-44` |
| Clés de service | Aucune n'est préfixée `NEXT_PUBLIC_` ; la clé d'itinéraires reste côté serveur | relevé des variables, phase 0 |
| Appels sortants | Toutes les adresses appelées sont fixées dans le code ; aucune ne vient d'un utilisateur | phase 0, §4.2 |
| Historique git | **Aucun secret trouvé** dans les 415 commits (recherche de mots de passe de base, clés de fournisseurs, clés privées, variables `SESSION_SECRET` et `MAILJET_*` renseignées). Aucun fichier `.env`, aucune sauvegarde de base n'a jamais été suivi. | `git log --all -p` filtré ; `gitleaks` n'est pas installé sur le poste |

### Constats

**`SEC-23` · P2 · Le dépôt public contient les mots de passe de deux comptes de test rattachés au domaine d'un vrai cabinet**
- *Preuve* : `prisma/seed.ts:162-163` et une vingtaine de fichiers de `tests/` (mot de passe d'un compte praticien et d'un compte secrétariat, en clair). Ces comptes ne sont créés que par `prisma/seed.ts`, que la production n'exécute pas (`Dockerfile`).
- *Scénario* : si le peuplement de démonstration était un jour lancé sur la production (erreur de manipulation, restauration d'une base de développement), deux comptes au mot de passe public y existeraient.
- *Correctif* : faire refuser à `prisma/seed.ts` de s'exécuter si `NODE_ENV=production` ou si la base n'est pas une base de développement ; lire ces mots de passe dans l'environnement de test ; utiliser un domaine réservé (`example.fr`).
- *Effort* : S. *Audits précédents* : relevé en pré-production, **toujours ouvert**.

**`SEC-24` · P3 · Le secret de la tâche planifiée est comparé caractère par caractère**
- *Preuve* : `authHeader !== \`Bearer ${secret}\`` (`src/app/api/cron/daily/route.ts:20`). Le paramètre `?organization=` n'est lu qu'après ce contrôle.
- *Correctif* : comparaison à temps constant (`timingSafeEqual`). *Effort* : S.

**`SEC-25` · P3 · Ce que le code public apprend à un attaquant**
- La liste exacte des limites de débit et de leurs seuils, la structure des jetons, le nom du compte restreint de la base (`app_runtime`) et la façon dont son mot de passe est dérivé (`scripts/runtime-role.mjs`), l'identifiant du premier espace (`org-1002-pattes`), la marche à suivre de l'hébergement. Rien de cela n'est un secret, mais la sécurité ne peut pas compter sur la discrétion : c'est une raison de plus de traiter `SEC-03` et `SEC-08`.

---

## F. Configuration et dépendances

### Ce qui tient

| Point | Constat | Preuve |
|---|---|---|
| Requêtes forgées depuis un autre site | Les actions serveur n'acceptent que des envois dont l'origine correspond au site ; le cookie de session n'est pas joint aux envois venus d'ailleurs | comportement du framework (documentation embarquée) ; `session.ts:48` |
| Messages d'erreur | En production, le framework remplace le texte des erreurs non prévues par un message générique ; les refus prévus renvoient des phrases écrites pour l'utilisateur | comportement du framework ; lecture des actions |
| Fichier de verrouillage | `package-lock.json` suivi, installation par `npm ci` | `Dockerfile` |

### Constats

**`SEC-26` · P1 · Deux bibliothèques ont des failles classées critiques, dont le framework lui-même**
- *En clair* : la version installée du framework a sept failles publiées, corrigées dans une version plus récente. La bibliothèque de cartes en a une.
- *Preuve* : `npm audit --omit=dev` (phase 0, §6) — `next` 16.3.5, correctif `16.4.0` ; `maplibre-gl` ^5.24.0, correctif en version 6. S'y ajoutent sept failles élevées (`prisma` et sa chaîne, `sharp`, `fast-uri`, `source-map-js`).
- *Portée réelle, par lecture du code* : l'application n'utilise ni `next/og`, ni `use cache`, ni pages statiques régénérées, ni images distantes — quatre des sept avis sur `next` décrivent des fonctions qu'elle n'emploie pas. **Non vérifié** : si l'optimiseur d'images reste exposé en production. Le risque exact compte moins que la règle : un framework exposé à Internet se tient à jour.
- *Correctif* : monter `next` en 16.4.x et lancer la suite ; `npm audit fix` pour `sharp`, `fast-uri`, `source-map-js`, `dompurify` ; planifier `maplibre-gl` 6 avec les tests de la carte ; examiner la proposition de l'outil pour Prisma (elle suggère un retour en version 6, à ne pas suivre aveuglément).
- *Effort* : S (`next`, correctifs mineurs) + M (`maplibre-gl`). *Audits précédents* : pré-production `SEC-01` corrigé à l'époque (16.3.2 → 16.3.5) ; de nouveaux avis sont parus depuis. `maplibre-gl` : reporté en septembre, **toujours ouvert**.

**`SEC-27` · P2 · Aucun en-tête de sécurité n'est posé par l'application**
- *En clair* : les protections du navigateur (interdire l'affichage du site dans un cadre, limiter les scripts autorisés…) dépendent entièrement du réglage du serveur de l'hébergeur.
- *Preuve* : `next.config.ts` ne déclare aucun en-tête ; aucune autre déclaration dans `src/`. L'audit de pré-production avait observé en production HSTS, `X-Frame-Options`, `X-Content-Type-Options` et `Referrer-Policy`, posés par le serveur frontal, et l'absence de `Content-Security-Policy` et de `Permissions-Policy`. **Non revérifié** : aucune requête vers la production n'est faite dans cet audit.
- *Correctif* : déclarer les en-têtes dans l'application pour ne plus dépendre de l'hébergeur ; une politique de contenu stricte, d'abord en mode observation ; retirer `X-Powered-By`.
- *Effort* : M (la politique de contenu demande des essais). *Audits précédents* : absence de CSP relevée en pré-production, **toujours ouverte**.

**`SEC-28` · P2 · Le conteneur tourne sous le compte administrateur du système, avec les outils de développement**
- *Preuve* : `Dockerfile` — pas d'instruction `USER`, une seule étape, `npm ci` sans exclure les dépendances de développement, `COPY . .`.
- *Scénario* : une faille d'exécution de code dans une bibliothèque (voir `SEC-26`) donne d'emblée tous les droits dans le conteneur, où se trouvent aussi les variables d'environnement.
- *Correctif* : construction en deux étapes, image finale sans dépendances de développement, utilisateur non privilégié.
- *Effort* : M. *Audits précédents* : non relevé.

**`SEC-29` · P2 · Sans Mailjet, le code de connexion s'écrit dans le journal de production**
- *Preuve* : le repli écrit le sujet du message (`src/lib/email/provider.ts:50`), et le sujet de l'e-mail de double authentification commence par le code (`src/lib/email/templates.ts:230`). Les sujets des demandes de rendez-vous portent aussi le nom du client et de l'animal (`:338`, `:711`).
- *Correctif* : ne journaliser que le type de message ; ne pas mettre le code dans le sujet.
- *Effort* : S. *Audits précédents* : pré-production `SEC-08`, **partiellement corrigé** (le corps n'est plus écrit ; le sujet l'est).

---

## G. Traçabilité

### Ce qui tient

| Point | Constat | Preuve |
|---|---|---|
| Connexions | Réussites, échecs, envoi et validation du code, mot de passe oublié | `auth/actions.ts`, `two-factor-actions.ts`, `password-reset-actions.ts` |
| Comptes | Création, rôle, permissions, activation, double authentification, modification, suppression | `src/lib/admin/actions.ts` (7 inscriptions) |
| Plateforme | Invitation, modules, suspension, suppression programmée, export, assistance (début et fin, avec le motif) | `src/lib/platform/*-actions.ts`, `export/[organizationId]/route.ts:19` |
| Attribution | Toute inscription faite pendant une assistance porte l'identité de celui qui assiste, sans que l'appelant ait à y penser | `src/lib/audit.ts:96-98` |
| Intégrité | Aucun écran ni aucune action ne modifie ou ne supprime une ligne du journal ; seule l'effacement d'un espace les retire | recherche de `auditLog.update|delete` : un seul résultat, `organization-deletion.ts:116` |
| Lecture | L'administrateur d'un cabinet ne voit que le journal de son espace | `src/lib/admin/users.ts:15-25` |

### Constats

**`SEC-30` · P2 · Le journal est conservé sans limite, avec des adresses IP peu fiables**
- *Preuve* : aucune purge du journal dans les tâches de fond (`src/lib/scheduler/`, `src/lib/rate-limit.ts:17-25` ne purge que les compteurs, codes et jetons) ; l'adresse IP vient de l'en-tête de `SEC-02` (`src/lib/audit.ts:70`).
- *Correctif* : fixer une durée (voir phase 4) et une purge ; fiabiliser l'adresse.
- *Effort* : S. *Audits précédents* : l'adresse IP a été ajoutée en août (`P2-29`).

**`SEC-31` · P3 · Des actions sensibles ne laissent aucune trace**
- *Preuve* : pas d'inscription pour la désactivation du flux d'agenda (`calendar-actions.ts:93-97`), la modification des horaires, des prestations, de la page publique et des zones (aucun `logAudit` dans `business-profile-actions.ts`, `services-actions.ts`, `public-page-actions.ts`, `tours-actions.ts`), ni pour la lecture d'un compte rendu.
- *Correctif* : journaliser les changements de réglages publics et les lectures de documents. *Effort* : S.

---

## Récapitulatif

| Niveau | Constats |
|---|---|
| **P0** | aucun établi par la lecture seule — `SEC-08`, `SEC-09`, `SEC-11` et `SEC-15` peuvent le devenir selon ce que prouvera la phase 3 |
| **P1** | `SEC-01` code de double authentification devinable · `SEC-08` seconde barrière facultative au démarrage · `SEC-09` communes d'une zone rangées chez le premier cabinet · `SEC-11` lectures sans connexion · `SEC-15` téléphone et adresse masqués mais envoyés · `SEC-26` bibliothèques à failles critiques |
| **P2** | `SEC-02` adresse IP falsifiable · `SEC-03` secret unique · `SEC-04` double authentification facultative · `SEC-10` liens non revérifiés · `SEC-12` assistance en écriture · `SEC-16` emploi du temps lisible · `SEC-17` pas d'anti-robot · `SEC-18` flux d'agenda trop large · `SEC-21` formules dans l'export · `SEC-22` images non vérifiées · `SEC-23` mots de passe de test publics · `SEC-27` en-têtes · `SEC-28` conteneur · `SEC-29` code dans le journal · `SEC-30` journal sans limite |
| **P3** | `SEC-05`, `SEC-06`, `SEC-07`, `SEC-13`, `SEC-14`, `SEC-19`, `SEC-20`, `SEC-24`, `SEC-25`, `SEC-31` |

### Points des audits précédents revérifiés dans cette phase

| Point | Origine | Statut au 9 octobre 2026 |
|---|---|---|
| `SEC-01` — version du framework | pré-production | corrigé alors ; **de nouveau en retard** (`SEC-26`) |
| `SEC-02` — script dans un document | pré-production | **corrigé** |
| `SEC-04` — jeton valable après déconnexion | pré-production | **corrigé** |
| `SEC-08` — e-mails dans les journaux | pré-production | **partiellement corrigé** (`SEC-29`) |
| `BUG-02` — double réservation | pré-production | **corrigé** (verrou, tests verts) |
| `DATA-01` — suppression d'un auteur | pré-production | **corrigé** (`src/lib/admin/actions.ts:196-202`) |
| Limitation de `/api/address-search` | pré-production | **toujours ouvert** (`SEC-19`) |
| Contrôle serveur des images | pré-production | **toujours ouvert** (`SEC-22`) |
| Mots de passe de test dans le dépôt public | pré-production | **toujours ouvert** (`SEC-23`) |
| `maplibre-gl` | pré-production | **toujours ouvert** (`SEC-26`) |
| Absence de CSP | pré-production | **toujours ouverte** (`SEC-27`) |
| Fonctions de lecture sans contrôle d'identité | pré-production | **aggravé** par le repli sur le cabinet unique (`SEC-11`) |
| Isolation entre cabinets | « sans objet » en pré-production | **construite depuis** (deux barrières) ; limites : `SEC-08`, `SEC-09`, `SEC-10` |
| `P0-1` — boucle de redirection de session | août | **corrigé** (`src/proxy.ts:19-36`) |
| `P2-15`, `P2-26` — limitation de débit | août | en place ; **affaiblie** par `SEC-02` |

### Non vérifié dans cette phase

- La configuration du serveur frontal de l'hébergeur (en-têtes, transmission de l'adresse IP et de l'hôte) : hors dépôt.
- Les variables réellement posées en production (longueur de `SESSION_SECRET`, présence de `RUNTIME_DB_SECRET`, état de la seconde barrière au dernier démarrage).
- Le nombre d'espaces en production, dont dépend la portée de `SEC-11`.
- L'accessibilité réelle, depuis un navigateur, des fonctions citées par `SEC-11` : c'est l'objet de la phase 3.
