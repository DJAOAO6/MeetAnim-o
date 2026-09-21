# Plan — 1002 Pattes multi-comptes

*Décision du 21 septembre 2026 : chaque professionnel s'inscrit et ne voit que ses données, sur une seule application.*

## Le problème en une phrase

Aujourd'hui, 15 tables métier n'ont pas de propriétaire, et il n'existe qu'un seul profil de cabinet (`findFirst`). Tout compte voit tout. Le chantier touche **environ 600 appels à la base répartis dans 28 fichiers** : une seule requête oubliée suffit pour qu'un professionnel voie les clients d'un autre.

## Principe directeur : ne jamais compter sur la vigilance

Réécrire 600 requêtes à la main garantit d'en oublier une. Le cloisonnement doit donc être **automatique**, et **vérifié deux fois** :

1. **Dans l'application** — un client Prisma « cloisonné » (extension `$extends`) ajoute d'office le filtre du cabinet courant à toute lecture, et le cabinet courant à toute écriture. Le code métier ne manipule plus `prisma` directement, mais `db()`, obtenu à partir de la session. Une requête sans cabinet devient impossible à écrire par mégarde.
2. **Dans la base** — PostgreSQL *Row-Level Security* : chaque table métier refuse les lignes d'un autre cabinet, même si l'application se trompait. Le cabinet courant est posé en début de transaction (`SET LOCAL app.organization_id`).
3. **Par les tests** — une suite dédiée crée deux cabinets A et B, et vérifie, pour chaque entité et chaque route, que A ne lit, ne modifie ni ne supprime rien de B, y compris en forçant les identifiants dans les URL et les actions.

## Unité de cloisonnement : le cabinet, pas l'utilisateur

Un cabinet a déjà plusieurs comptes (administrateur, praticiens, secrétariat), qui partagent légitimement les mêmes clients. Le propriétaire des données est donc une **organisation** (le cabinet), et chaque utilisateur appartient à une organisation.

```
Organization (le cabinet)
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
| **1. Fondations** | Modèle `Organization` ; colonne `organizationId` sur les 15 tables métier et `User` (nullable) ; rattachement de toutes les données existantes à un premier cabinet ; puis `NOT NULL`, clés étrangères et index. Unicités à re-cadrer : index de créneau `(organizationId, date, start)`, noms de zone par cabinet. | Moyen (données) | Migration rejouée sur une copie de la base, comptages avant/après |
| **2. Accès cloisonné** | Extension Prisma `db()` ; conversion des 28 fichiers ; `getBusinessProfile()` devient le profil *du cabinet courant* ; le planificateur (rappels, tournées) boucle sur les cabinets. | **Élevé** (volume) | Typage : `prisma` brut interdit hors du module d'accès (règle lint) ; suite E2E existante |
| **3. Page publique** | `/reserver/[slug]` résout le cabinet par son slug ; les actions publiques reçoivent le slug, jamais un identifiant de cabinet fourni par le client ; e-mails aux couleurs et coordonnées du bon cabinet. | Moyen | Tests : deux cabinets, deux pages, réservations qui ne se croisent pas |
| **4. Inscription** | Création de compte (cabinet + profil vierge + administrateur), vérification de l'adresse e-mail, onboarding en 5 étapes (profil, horaires, prestations, déplacements, lien de réservation). Plus d'identité par défaut « Pauline Faucillon ». | Moyen | Parcours E2E « un professionnel s'inscrit et prend son premier rendez-vous » |
| **5. Seconde barrière** | Row-Level Security sur les 15 tables ; rôle de base sans droit de la contourner. | Moyen | Tests d'isolation rejoués avec un filtre applicatif volontairement retiré |
| **6. Isolation prouvée** | Suite « cabinet A contre cabinet B » : chaque entité, chaque route, chaque action, identifiants forcés. Obligatoire en CI. | — | Elle-même |
| **7. Super-administration** | Compte de plateforme, hors de tout cabinet, qui liste les cabinets et leurs comptes, et peut **se connecter en tant qu'un professionnel** pour l'aider. Garde-fous : rôle attribué uniquement en base (jamais par l'interface), double authentification obligatoire, motif saisi à chaque ouverture, session d'assistance limitée dans le temps et distincte de celle du professionnel, bandeau visible pendant toute la durée, chaque accès inscrit au journal d'audit du cabinet concerné. | **Élevé** (accès à toutes les données) | Tests : sans ce rôle, aucun accès ; avec, chaque action est journalisée et attribuée au super-administrateur |

Ordre imposé : 1 → 2 → 3 → 6 avant toute ouverture de l'inscription (4) au public. Les phases 5 et 7 peuvent suivre, mais avant le premier cabinet externe : la 7 s'appuie sur le cloisonnement de la phase 2, sans lequel « se connecter en tant que » n'aurait pas de sens.

## Ce qui ne change pas pour le cabinet actuel

Ses données deviennent celles du premier cabinet, sans perte. Son lien de réservation (`/reserver/pauline-faucillon`) reste valide. Ses comptes gardent leurs rôles.

## Hors périmètre de ce chantier

Abonnement et facturation des cabinets, domaines personnalisés par cabinet.

## Décisions à prendre

1. **Ouverture de l'inscription** : libre, sur validation manuelle, ou sur invitation seulement au début ?
2. **Modèles de comptes rendus fournis** : partagés en lecture par tous les cabinets (proposé), chacun pouvant les dupliquer pour les modifier ?
3. **Un utilisateur dans plusieurs cabinets** (remplaçant, associé multi-sites) : exclu dans un premier temps (proposé), ou nécessaire dès le départ ?
