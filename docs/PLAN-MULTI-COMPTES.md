# Plan — 1002 Pattes multi-comptes

*Décision du 21 septembre 2026 : chaque professionnel s'inscrit et ne voit que ses données, sur une seule application.*

## Le problème en une phrase

Aujourd'hui, 15 tables métier n'ont pas de propriétaire, et il n'existe qu'un seul profil de cabinet (`findFirst`). Tout compte voit tout. Le chantier touche **environ 600 appels à la base répartis dans 28 fichiers** : une seule requête oubliée suffit pour qu'un professionnel voie les clients d'un autre.

## Principe directeur : ne jamais compter sur la vigilance

Réécrire 600 requêtes à la main garantit d'en oublier une. Le cloisonnement doit donc être **automatique**, et **vérifié deux fois** :

1. **Dans l'application** — un client Prisma « cloisonné » (extension `$extends`) ajoute d'office le filtre du cabinet courant à toute lecture, et le cabinet courant à toute écriture. Le code métier ne manipule plus `prisma` directement, mais `db()`, obtenu à partir de la session. Une requête sans cabinet devient impossible à écrire par mégarde.
2. **Dans la base** — PostgreSQL *Row-Level Security* : chaque table métier refuse les lignes d'un autre cabinet, même si l'application se trompait. Le cabinet courant est posé en début de transaction (`SET LOCAL app.organization_id`).
3. **Par les tests** — une suite dédiée crée deux cabinets A et B, et vérifie, pour chaque entité et chaque route, que A ne lit, ne modifie ni ne supprime rien de B, y compris en forçant les identifiants dans les URL et les actions.

## Unité de cloisonnement : l'espace professionnel

Le propriétaire des données est l'**activité** du professionnel — son « espace professionnel » (`Organization` dans le code) —, pas un lieu. Beaucoup de professionnels animaliers n'ont **pas de cabinet** et n'exercent qu'à domicile ; d'autres n'exercent qu'au cabinet ; d'autres font les deux, ou ouvrent un cabinet après des années d'itinérance. L'espace existe dès l'invitation, avec ou sans cabinet.

Un espace peut avoir plusieurs comptes (administrateur, praticiens, secrétariat), qui partagent légitimement les mêmes clients ; chaque utilisateur appartient à un seul espace.

```
Organization (l'espace professionnel)
 ├─ User (admin, praticiens, secrétariat)
 ├─ BusinessProfile (1 par cabinet, slug public unique)
 ├─ Client → Animal → Consultation, AnimalDocument, Reminder
 ├─ Appointment → AppointmentCalendarEvent, TourStop
 ├─ Service, Zone → City, Tour, TourRun, BlockedSlot, SavedPlace
 └─ StudioDocument, StudioDocumentTemplate (modèles propres + modèles fournis partagés)
```

## Phases

| Phase | Contenu | Risque | Vérifié par |
| --- | --- | --- | --- |
| **1. Fondations — FAITE le 22/09/2026** (`3612ab3`) | Modèle `Organization` ; colonne `organizationId` sur les 15 tables métier et `User` (nullable) ; rattachement de toutes les données existantes à un premier cabinet ; puis `NOT NULL`, clés étrangères et index. Unicités à re-cadrer : index de créneau `(organizationId, date, start)`, noms de zone par cabinet. | Moyen (données) | Migration rejouée sur une copie de la base, comptages avant/après |
| **2. Accès cloisonné — FAITE le 22/09/2026** | Extension Prisma `db()` ; conversion des 28 fichiers ; `getBusinessProfile()` devient le profil *du cabinet courant* ; le planificateur (rappels, tournées) boucle sur les cabinets. | **Élevé** (volume) | Typage : `prisma` brut interdit hors du module d'accès (règle lint) ; suite E2E existante |
| **3. Page publique — FAITE le 22/09/2026** | `/reserver/[slug]` résout le cabinet par son slug ; les actions publiques reçoivent le slug, jamais un identifiant de cabinet fourni par le client ; e-mails aux couleurs et coordonnées du bon cabinet. | Moyen | Tests : deux cabinets, deux pages, réservations qui ne se croisent pas |
| **4. Invitation et onboarding — FAITE le 23/09/2026** | Un lien d'invitation crée l'espace (profil vierge + administrateur) ; vérification de l'adresse e-mail ; onboarding en 5 étapes, dont la **première est le mode d'exercice** (voir ci-dessous) : profil, horaires, prestations, déplacements, lien de réservation. Plus d'identité par défaut « Pauline Faucillon ». | Moyen | Parcours E2E « un professionnel s'inscrit et prend son premier rendez-vous » |
| **5. Seconde barrière — FAITE le 22/09/2026** | Row-Level Security sur les 15 tables ; rôle de base sans droit de la contourner. | Moyen | Tests d'isolation rejoués avec un filtre applicatif volontairement retiré |
| **6. Isolation prouvée — FAITE le 22/09/2026** | Suite « cabinet A contre cabinet B » : chaque entité, chaque route, chaque action, identifiants forcés. Obligatoire en CI. | — | Elle-même |
| **7. Super-administration — FAITE le 23/09/2026** | Compte de plateforme, hors de tout cabinet, qui liste les cabinets et leurs comptes, et peut **se connecter en tant qu'un professionnel** pour l'aider. Garde-fous : rôle attribué uniquement en base (jamais par l'interface), double authentification obligatoire, motif saisi à chaque ouverture, session d'assistance limitée dans le temps et distincte de celle du professionnel, bandeau visible pendant toute la durée, chaque accès inscrit au journal d'audit du cabinet concerné. | **Élevé** (accès à toutes les données) | Tests : sans ce rôle, aucun accès ; avec, chaque action est journalisée et attribuée au super-administrateur |

Ordre imposé : 1 → 2 → 3 → 6 avant toute ouverture de l'inscription (4) au public. Les phases 5 et 7 peuvent suivre, mais avant le premier cabinet externe : la 7 s'appuie sur le cloisonnement de la phase 2, sans lequel « se connecter en tant que » n'aurait pas de sens.

## Où en est le chantier

- **Phase 1 faite** (22 septembre 2026) : `Organization`, `organizationId` sur 18 tables métier + comptes + journal d'audit + modèles, clés étrangères, index, données existantes rattachées à un premier espace. Contrôle : `node scripts/check-organizations.mjs`.
- **Phase 2 faite** (22 septembre 2026) : client Prisma cloisonné (`src/lib/db-scope.ts`), accès nommés `currentDb()` / `readDb()` / `publicDb()`, conversion de l'ensemble du code métier, règle de lint interdisant le client non cloisonné, tâches de fond qui parcourent les cabinets, e-mails signés du bon cabinet, et un test d'isolation « cabinet A contre cabinet B ».
- **Phase 3 faite** (22 septembre 2026) : le lien public (`/reserver/<slug>`) désigne le cabinet, et il est le premier argument des quatre actions publiques. Un lien inconnu ne mène à rien, jamais à « le premier cabinet trouvé ».
- **La valeur par défaut posée par la base reste**, contrairement au plan initial. Tentée puis annulée : sans elle, le typage de Prisma exige de nommer le cabinet dans plus de soixante écritures, c'est-à-dire exactement la verbosité que le client cloisonné supprime. Conséquence assumée : une écriture qui échapperait au client cloisonné serait silencieusement rattachée au premier cabinet au lieu d'échouer. C'est la **phase 5 (Row-Level Security)** qui transformera ce silence en refus — elle compte donc plus qu'il n'y paraissait.
- **Reste de la phase 1** : la base pose l'espace par défaut (`org-1002-pattes`) sur toute écriture, ce qui laisse le code d'avant le chantier fonctionner. Tant que ce défaut existe, une écriture qui oublie son espace est silencieusement rattachée au premier cabinet. Le `DROP DEFAULT` fait donc partie de la phase 2, pas d'un nettoyage ultérieur.
- **Unicité des noms de zone par espace** : pas posée. Aucune contrainte n'existe aujourd'hui et la base de production peut contenir des doublons ; la poser ferait échouer la migration. À décider (produit) puis à faire après déduplication.

- **Phase 6 faite** (22 septembre 2026) : deux suites — ce que voit le praticien (`tests/organization-isolation.spec.ts`) et ce qu'il peut forcer, identifiants d'un autre cabinet en main (`tests/organization-isolation-actions.spec.ts`). **Tous les droits sont accordés au compte de test** pendant ces essais, et un refus pour droit manquant fait échouer le test : le seul motif de refus admis est que la donnée appartient à quelqu'un d'autre. Obligatoire en intégration continue, sur un PostgreSQL éphémère (rien d'exposé dans ce dépôt public).

- **Phase 5 faite** (22 septembre 2026) : Row-Level Security activée et *forcée* sur les 18 tables métier. Chaque connexion ouverte par l'application déclare le cabinet qu'elle sert (`app.organization_id`, posé à l'ouverture — `src/lib/db.ts`), et PostgreSQL refuse alors de lui montrer, modifier, supprimer ou insérer quoi que ce soit chez un autre. Vérifié en parlant à la base sans passer par le code (`tests/organization-rls.spec.ts`), y compris le refus d'écriture.

### Ce qui reste à faire sur cette barrière

1. **Une connexion qui ne déclare aucun cabinet voit tout.** C'est le compromis actuel, assumé : migrations, peuplement et scripts d'entretien en ont besoin, et l'application se connecte sous le propriétaire des tables. La protection porte donc sur ce qui déclare un cabinet — c'est-à-dire toute l'application. Un test l'énonce explicitement, pour que personne ne le découvre par surprise.
2. **Constaté en production le 23 septembre 2026** : le journal du serveur indique « seconde barrière inactive — le compte est superutilisateur (compte « app ») ». Le compte fourni par Iridflow est superutilisateur, et PostgreSQL ignore alors les règles, même forcées. En production, le cloisonnement ne repose donc aujourd'hui que sur l'application — ce qui suffit tant qu'il n'y a qu'un cabinet, mais pas au-delà.
3. **L'étape suivante, avant le premier cabinet extérieur** : faire tourner l'application sous un rôle dédié (sans droit de contourner ces règles), et resserrer les règles pour qu'une connexion sans cabinet déclaré ne voie plus rien. Cela demande de créer le rôle côté hébergeur et de changer l'adresse de connexion du site — une opération à faire par l'utilisateur sur Iridflow, pas depuis le dépôt.
   Iridflow ne propose pas d'outil pour créer un compte *interne* ordinaire : `create_db_user` sert aux accès nommés depuis l'extérieur et ouvre la base à Internet. La voie propre est de demander au support Iridflow un compte non superutilisateur pour l'application, propriétaire des tables, comme cela avait été fait pour le rattachement de la base. Aucune modification de code n'est nécessaire ensuite : l'application le signalera d'elle-même au démarrage (« seconde barrière active »).
4. **Une réserve de connexions par cabinet** (trois au plus). Confortable tant que les cabinets se comptent en unités ; au-delà de quelques dizaines, il faudra une réserve partagée qui repose le réglage à chaque emprunt, ou un intermédiaire type PgBouncer.

- **Phase 4 faite** (23 septembre 2026) : invitation depuis `/plateforme`, inscription, onboarding, page de réservation fermée tant que la configuration n'est pas terminée. Voir plus bas.

- **Phase 7 faite** (23 septembre 2026) : espace `/plateforme` (cabinets, comptes, volumes — jamais le contenu), et assistance d'un professionnel. Vérifiée par `tests/platform-assistance.spec.ts`.

### Super-administration : comment ça marche

**Attribuer le rôle.** Jamais par un écran. Il est décidé par la variable d'environnement du site `PLATFORM_ADMIN_EMAILS` (adresses séparées par des virgules) et appliqué à chaque démarrage : les comptes listés le reçoivent, tous les autres le perdent. Vide : plus personne. **Absente : rien ne change** — une variable oubliée lors d'une reconfiguration ne prive pas la plateforme de son administrateur. Sur Iridflow : `set_site_env`, puis redémarrage.

**Conditions d'accès**, vérifiées à chaque requête : le rôle, la double authentification activée, et ne pas être soi-même en train d'assister. Sans le rôle, `/plateforme` répond « introuvable » : rien ne confirme que la page existe.

**Une assistance** :
- exige un motif (10 caractères au moins), inscrit au journal du cabinet assisté ;
- ouvre une session **à part**, au nom du professionnel : ses propres sessions restent intactes ;
- dure 30 minutes au plus, puis s'arrête d'elle-même ;
- s'arrête aussi dès que le rôle est retiré, à la requête suivante ;
- affiche un bandeau permanent, impossible à masquer, avec le motif et l'heure de fin ;
- attribue chaque action journalisée à celui qui assiste (`AuditLog.impersonatorId`) ; le journal du cabinet l'affiche (« — par X (assistance) ») ;
- interdit de toucher aux comptes de l'équipe (création, suppression, rôle, droits, adresse, double authentification). Aider un cabinet dans son travail, oui ; décider qui peut y accéder, non — sans cette règle, changer l'adresse d'un compte puis demander un nouveau mot de passe suffirait à en prendre le contrôle.

**Compte dédié ou compte existant ?** Le rôle est indépendant du cabinet : un administrateur de cabinet peut le recevoir et garder son espace (un lien « Super-administration » apparaît dans son menu). Le plan recommandait un compte de plateforme hors de tout cabinet ; c'est préférable dès qu'il y aura plusieurs cabinets, pour que « agir chez soi » et « agir partout » ne passent pas par la même porte.

### Invitation et onboarding (phase 4) : comment ça marche

**Inviter.** Depuis `/plateforme`, encart « Inviter un professionnel » : une adresse et un nom d'activité (modifiable par l'invité). Un e-mail part avec un lien valable **7 jours**, à usage unique ; le lien est aussi affiché **une fois** à l'écran, pour le transmettre autrement si l'e-mail n'arrive pas. Seule son empreinte est gardée en base. Inviter à nouveau la même adresse annule le lien précédent ; une adresse qui a déjà un compte est refusée. Chaque invitation (envoi, annulation) est journalisée.

**S'inscrire.** `/inscription/<lien>` : prénom, nom, nom de l'activité, mot de passe. L'adresse est celle de l'invitation, affichée mais non modifiable — c'est en recevant le lien que l'invité a prouvé qu'il la détient (c'est la vérification de l'adresse prévue au plan). Le cabinet, son profil **vierge** à son nom, des horaires de départ (lundi-vendredi, 9 h-12 h et 14 h-18 h) et son compte administrateur sont créés ensemble, ou pas du tout ; deux envois simultanés du formulaire n'ouvrent jamais deux cabinets.

**Configurer.** `/dashboard/bienvenue`, six écrans au plus : façon d'exercer (et adresse du cabinet, ou point de départ privé), profil, horaires, prestations (au moins une), déplacements (seulement si l'on se déplace), lien de réservation. Chaque écran est enregistré en passant au suivant, par les mêmes actions que les Paramètres. Tant que ce n'est pas fini, un bandeau le rappelle sur tout l'espace, et **la page de réservation n'existe pas** : son lien répond « introuvable », comme un lien inconnu (`dbForSlug`). Les cabinets existants ont été marqués configurés par la migration.

**Plus d'identité par défaut.** Un cabinet sans profil en reçoit un vierge (`src/lib/blank-profile.ts`) ; un cabinet sans prestation n'en reçoit plus d'office. « Pauline Faucillon » n'existe plus que dans le jeu de données de démonstration (`prisma/seed.ts`).

**Ce que le premier vrai second cabinet a révélé** (corrigé avec la phase 4, vérifié par `tests/onboarding.spec.ts`, joué en intégration continue) :
- l'index unique des créneaux portait sur toute la base : deux cabinets ne pouvaient pas avoir un rendez-vous à la même heure. Il est désormais par cabinet (migration `20260924100000_appointment_slot_per_cabinet`) ;
- la vérification de conflit d'une réservation lisait la base sans cloisonnement — les rendez-vous de tous les cabinets, et les horaires « du seul cabinet », ce qui échouait dès qu'il y en avait deux ;
- les agendas Google : un rendez-vous était diffusé à **toutes** les connexions Google de la plateforme (nom du client compris), et les créneaux occupés de tous les agendas bloquaient tous les cabinets. Les connexions sont maintenant celles des comptes du cabinet, et le cache des créneaux occupés est par cabinet ;
- le calcul des tournées, l'aperçu des rappels et l'encart « Infos pratiques » de la page publique supposaient encore un seul cabinet ou ignoraient le mode d'exercice.

**Avant d'inviter un premier cabinet extérieur**, reste la condition posée à la phase 5 : un compte de base ordinaire pour l'application en production (voir « Ce qui reste à faire sur cette barrière »), pour que le cloisonnement ne repose plus sur l'application seule.

## Observation en attente d'explication

**Probablement expliqué le 22 septembre** : la barre latérale lisait ses préférences (repliée/dépliée) dans le navigateur pendant le premier rendu, ce qui faisait diverger la page du serveur de celle du navigateur ; React reconstruisait alors tout l'arbre du tableau de bord, et deux copies coexistaient le temps de la reconstruction (commit `d59cf8e`). À reconfirmer sur une suite complète : si des doublons réapparaissent, la piste reste une copie de la page précédente conservée pendant une navigation.

## Mode d'exercice : avec ou sans cabinet

**Livré le 22 septembre 2026** (commits `4e5d583`, `f599880`, `00713c6`), avant la phase 1 comme prévu : réglage dans Paramètres › Mon cabinet, point de départ privé, page publique, prestations, rendez-vous, tournées, tableau de bord, disponibilités et statistiques. Reste ouvert : le reprendre comme **première étape de l'onboarding** (phase 4), et le passage « domicile seul → les deux » guidé (demander l'adresse du cabinet, réactiver le mode cabinet sur les prestations choisies) — aujourd'hui le professionnel le fait champ par champ.

Un réglage **permanent**, choisi à l'onboarding et modifiable à tout moment : **à domicile uniquement**, **au cabinet uniquement**, ou **les deux**. Il est distinct de la fermeture *temporaire* qui existe déjà (« cabinet fermé pour le moment ») : ne pas avoir de cabinet n'est pas l'avoir fermé.

| Endroit | Sans cabinet (domicile uniquement) |
| --- | --- |
| Page publique | Aucune carte « Au cabinet », aucune adresse de cabinet affichée ; le choix du mode disparaît s'il n'y en a qu'un |
| Prestations | Pas d'option cabinet à cocher ; tarifs à domicile seulement |
| Rendez-vous | Mode « domicile » d'office, sans choix inutile |
| Tournées et trajets | Départ et retour depuis un **point de départ** (domicile du praticien, local, autre) — **jamais affiché publiquement**, contrairement à l'adresse d'un cabinet. Aujourd'hui 17 fichiers supposent un départ « du cabinet » |
| Textes | « au cabinet » (13 fichiers) remplacé par une formulation qui suit le mode |
| Statistiques | Pas de répartition cabinet/domicile vide |

Au cabinet uniquement : l'inverse — pas de zones, de tournées ni de frais de déplacement proposés d'emblée.

**Ouvrir un cabinet plus tard** : passer de « domicile uniquement » à « les deux » demande l'adresse du cabinet, puis active le mode cabinet sur les prestations choisies. Rien n'est perdu ni recréé ; l'historique à domicile reste intact.

Ce réglage vaut aussi pour le cabinet actuel, indépendamment du multi-comptes : il peut être livré avant la phase 1.

## Ce qui ne change pas pour l'espace actuel (Pauline Faucillon)

Ses données deviennent celles du premier cabinet, sans perte. Son lien de réservation (`/reserver/pauline-faucillon`) reste valide. Ses comptes gardent leurs rôles.

## Hors périmètre de ce chantier

Abonnement et facturation des cabinets, domaines personnalisés par cabinet.

## Décisions prises (21 septembre 2026)

1. **Inscription sur invitation.** Pas d'inscription publique au lancement : l'administrateur de la plateforme envoie un lien d'invitation à chaque professionnel, qui crée alors son cabinet. L'ouverture viendra avec la facturation. La phase 4 porte donc sur l'invitation et l'onboarding, pas sur une inscription libre — et la phase 7 (super-administration) en devient le point d'entrée.
2. **Modèles fournis communs, en lecture.** Les modèles de comptes rendus livrés avec 1002 Pattes sont partagés par tous les cabinets et ne sont modifiables par aucun ; un cabinet qui veut les adapter les duplique. `StudioDocumentTemplate` distingue donc les modèles de la plateforme (sans cabinet) de ceux d'un cabinet.
3. **Un compte = un cabinet, au départ.** Un utilisateur appartient à une seule organisation. Le modèle de données reste compatible avec une ouverture ultérieure (un remplaçant sur plusieurs cabinets) sans refonte.
