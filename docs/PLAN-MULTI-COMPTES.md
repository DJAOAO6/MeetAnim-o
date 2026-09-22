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
| **3. Page publique** | `/reserver/[slug]` résout le cabinet par son slug ; les actions publiques reçoivent le slug, jamais un identifiant de cabinet fourni par le client ; e-mails aux couleurs et coordonnées du bon cabinet. | Moyen | Tests : deux cabinets, deux pages, réservations qui ne se croisent pas |
| **4. Invitation et onboarding** | Un lien d'invitation crée l'espace (profil vierge + administrateur) ; vérification de l'adresse e-mail ; onboarding en 5 étapes, dont la **première est le mode d'exercice** (voir ci-dessous) : profil, horaires, prestations, déplacements, lien de réservation. Plus d'identité par défaut « Pauline Faucillon ». | Moyen | Parcours E2E « un professionnel s'inscrit et prend son premier rendez-vous » |
| **5. Seconde barrière** | Row-Level Security sur les 15 tables ; rôle de base sans droit de la contourner. | Moyen | Tests d'isolation rejoués avec un filtre applicatif volontairement retiré |
| **6. Isolation prouvée** | Suite « cabinet A contre cabinet B » : chaque entité, chaque route, chaque action, identifiants forcés. Obligatoire en CI. | — | Elle-même |
| **7. Super-administration** | Compte de plateforme, hors de tout cabinet, qui liste les cabinets et leurs comptes, et peut **se connecter en tant qu'un professionnel** pour l'aider. Garde-fous : rôle attribué uniquement en base (jamais par l'interface), double authentification obligatoire, motif saisi à chaque ouverture, session d'assistance limitée dans le temps et distincte de celle du professionnel, bandeau visible pendant toute la durée, chaque accès inscrit au journal d'audit du cabinet concerné. | **Élevé** (accès à toutes les données) | Tests : sans ce rôle, aucun accès ; avec, chaque action est journalisée et attribuée au super-administrateur |

Ordre imposé : 1 → 2 → 3 → 6 avant toute ouverture de l'inscription (4) au public. Les phases 5 et 7 peuvent suivre, mais avant le premier cabinet externe : la 7 s'appuie sur le cloisonnement de la phase 2, sans lequel « se connecter en tant que » n'aurait pas de sens.

## Où en est le chantier

- **Phase 1 faite** (22 septembre 2026) : `Organization`, `organizationId` sur 18 tables métier + comptes + journal d'audit + modèles, clés étrangères, index, données existantes rattachées à un premier espace. Contrôle : `node scripts/check-organizations.mjs`.
- **Phase 2 faite** (22 septembre 2026) : client Prisma cloisonné (`src/lib/db-scope.ts`), accès nommés `currentDb()` / `readDb()` / `publicDb()`, conversion de l'ensemble du code métier, règle de lint interdisant le client non cloisonné, tâches de fond qui parcourent les cabinets, e-mails signés du bon cabinet, et un test d'isolation « cabinet A contre cabinet B ».
- **Reste sur le client non cloisonné** : la réservation publique (`submitPublicBookingAction`, créneaux occupés, fiche client créée depuis une demande). Sans session, le cabinet n'est pas encore résolu — c'est l'objet de la phase 3. En attendant, `publicDb()` **échoue dès qu'un deuxième cabinet existe**, ce qui rend l'ordre des phases contraignant plutôt que théorique.
- **Dette assumée de la phase 1, à solder en fin de phase 3** (et non en fin de phase 2 comme prévu : la réservation publique écrit encore sans espace) : la base pose l'espace par défaut (`org-1002-pattes`) sur toute écriture, ce qui laisse le code d'avant le chantier fonctionner. Tant que ce défaut existe, une écriture qui oublie son espace est silencieusement rattachée au premier cabinet. Le `DROP DEFAULT` fait donc partie de la phase 2, pas d'un nettoyage ultérieur.
- **Unicité des noms de zone par espace** : pas posée. Aucune contrainte n'existe aujourd'hui et la base de production peut contenir des doublons ; la poser ferait échouer la migration. À décider (produit) puis à faire après déduplication.

## Observation en attente d'explication

Sur un serveur de développement chargé (suite complète, ~34 min), l'écran de journée de tournée apparaît parfois **en double** dans la page : une copie masquée et une visible. Les tests concernés visent désormais la copie visible, mais la cause n'est pas élucidée — piste : une copie de la page précédente conservée pendant une navigation. À vérifier sur un vrai build de production avant d'ouvrir l'application à d'autres cabinets : un contenu dupliqué serait lu deux fois par un lecteur d'écran.

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
