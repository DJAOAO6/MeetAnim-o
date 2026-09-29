# Lieu de l'animal ≠ adresse du client — analyse (phase 8.9)

> Statut : **analyse seulement, rien n'est codé ni migré.** Décision attendue
> avant toute modification du modèle (voir « Questions à trancher »).

## Le problème

Aujourd'hui, un animal n'a pas d'adresse : il « habite » chez son
propriétaire (`Client.address`, `Client.latitude/longitude`). Pour un
chien ou un chat, c'est juste. Pour un cheval, c'est souvent faux : le
propriétaire habite Rouen, le cheval vit à Yvetot, dans une pension où
vivent aussi les chevaux d'autres clients. Or, pour une ostéopathe animalière
qui se déplace, **l'adresse utile est celle de l'animal**.

Conséquences actuelles :

- la carte place le cheval chez son propriétaire (mauvais point, mauvaise
  distance, mauvais secteur de tournée) ;
- un rendez-vous à domicile reprend l'adresse du client, qu'il faut corriger
  à la main à chaque fois ;
- douze propriétaires d'un même haras donnent douze points au lieu d'un.

## Ce qui existe déjà et reste valable

- `Appointment` porte **sa propre copie** du lieu (`location`, `postalCode`,
  `city`, `inseeCode`, `latitude`, `longitude`) : un rendez-vous passé ne
  bouge jamais si une adresse change ensuite. Rien à changer.
- `TourStop` porte aussi son adresse et ses coordonnées (arrêt manuel) ou
  suit son rendez-vous.
- `SavedPlace` (lieux favoris des tournées : cabinet, domicile du
  professionnel…) appartient au professionnel, pas aux clients : ce n'est
  pas le bon support pour un haras partagé par des clients.

## Proposition recommandée : un « Lieu » partagé, rattaché à l'animal

```prisma
/// Lieu où vivent des animaux, distinct de l'adresse de leurs propriétaires :
/// haras, élevage, exploitation, centre équestre, refuge… Partagé par
/// plusieurs animaux, éventuellement de propriétaires différents.
model AnimalPlace {
  id               String            @id @default(cuid())
  name             String            // « Haras du Moulin »
  kind             AnimalPlaceKind
  address          String
  postalCode       String?
  city             String
  latitude         Float?
  longitude        Float?
  geocodePrecision GeocodePrecision?
  geocodedAt       DateTime?
  notes            String            @default("") @db.Text // accès, contact sur place, code du portail
  animals          Animal[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  organizationId String       @default("org-1002-pattes")
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)

  @@index([organizationId])
}

enum AnimalPlaceKind {
  HARAS
  ELEVAGE
  EXPLOITATION
  CENTRE_EQUESTRE
  REFUGE
  AUTRE
}

model Animal {
  // … inchangé …
  /// Lieu habituel de l'animal, s'il ne vit pas chez son propriétaire.
  /// Absent = chez le propriétaire (comportement actuel).
  placeId String?
  place   AnimalPlace? @relation(fields: [placeId], references: [id], onDelete: SetNull)
  @@index([placeId])
}
```

Pourquoi une table et pas trois champs d'adresse sur `Animal` :

- un haras se saisit **une fois** et sert à tous ses chevaux (et à tous
  leurs propriétaires) ;
- la carte peut afficher **un point par lieu** (« Haras du Moulin — 12
  propriétaires, 23 chevaux ») ;
- on géocode un lieu une fois, pas vingt ;
- l'adresse d'accès (portail, écurie) se corrige à un seul endroit.

Alternative écartée (plus simple, moins juste) : `Animal.address/city/
latitude/longitude`. Moins de code au départ, mais doublons de saisie et de
géocodage, pas de regroupement par lieu, et une migration de plus le jour où
l'on veut le regroupement.

## Migration

Une seule migration, **uniquement additive** :

1. création de l'énumération `AnimalPlaceKind` et de la table `AnimalPlace`
   (index, clé vers `Organization`) ;
2. `ALTER TABLE "Animal" ADD COLUMN "placeId" TEXT` (nullable) + clé
   étrangère `ON DELETE SET NULL` + index ;
3. cloisonnement : `AnimalPlace` ajouté à `TENANT_MODELS`
   (`src/lib/db-scope.ts`) et politique RLS `cloisonnement_espace`, comme
   `MapView` (20260929090000_map_views).

Aucune donnée existante n'est modifiée : tous les animaux gardent
`placeId = NULL`, donc « chez le propriétaire », exactement comme
aujourd'hui. Pas de reprise de données automatique (on ne devine pas qu'un
cheval vit ailleurs).

## Rétrocompatibilité

- Toutes les lectures actuelles continuent de fonctionner (`placeId` est
  facultatif).
- Les rendez-vous passés gardent leur copie d'adresse.
- L'import de fichiers clients (`ClientImport`) n'a rien à changer ; une
  colonne « lieu » pourra venir plus tard, séparément.

## Impacts, écran par écran

| Écran | Changement | Taille |
|---|---|---|
| **Fiche animal** | Bloc « Où vit-il ? » : chez son propriétaire (défaut) / un lieu existant (recherche) / nouveau lieu (nom, type, adresse géocodée comme les clients, phase 6). | Moyen |
| **Fiche client** | Sous chaque animal qui vit ailleurs : « à Yvetot — Haras du Moulin ». Aucun champ en plus. | Petit |
| **Lieux** (nouvel écran léger, dans Clientèle) | Liste des lieux, fiche d'un lieu : adresse, notes d'accès, animaux et propriétaires rattachés. | Moyen |
| **Nouveau rendez-vous** | À domicile : l'adresse proposée devient celle **du lieu de l'animal** s'il en a un (sinon celle du client, comme aujourd'hui), toujours modifiable. La copie dans `Appointment` ne change pas. | Petit |
| **Réservation en ligne** | Aucun changement au départ : le client saisit l'adresse du rendez-vous comme aujourd'hui. Option ultérieure : proposer « au Haras du Moulin » si le client connu y a un animal. | Nul / plus tard |
| **Tournées** | Aucun changement de modèle : les arrêts suivent le rendez-vous. « Préparer une tournée » depuis la carte (phase 8.5) prendrait le lieu de l'animal. | Petit |
| **Carte** | Position d'un animal : lieu de l'animal → adresse du client → dernier RDV à domicile. Un lieu partagé = **un point** avec ses propriétaires et animaux ; un client dont les animaux vivent à deux endroits apparaît aux deux, sans doublon dans les comptes (« 1 client, 2 lieux »). | Moyen |
| **Zones / réservation** | La règle `findMatchingZone` s'applique au lieu de l'animal quand il existe (même règle, autre adresse). | Petit |

## Effort et risque

- Effort : environ 3 à 4 phases de la taille des phases 8.x (modèle +
  fiche animal ; écran Lieux ; rendez-vous ; carte).
- Risque : **faible sur les données** (migration additive, rien de
  réécrit), **moyen sur l'interface** (la carte passe d'« un client = un
  point » à « un lieu = un point », à tester avec vos vrais cas).

## Questions à trancher avant de coder

1. **Un lieu partagé (table `AnimalPlace`), ou une simple adresse par
   animal ?** Recommandation : le lieu partagé.
2. Les **types** proposés (haras, élevage, exploitation, centre équestre,
   refuge, autre) vous conviennent-ils ?
3. Un lieu peut-il avoir un **contact sur place** (gérant du haras) distinct
   des propriétaires ? Recommandation : un simple champ « notes d'accès »
   au départ, pas de nouveau type de contact.
4. Sur la carte, un client dont le chien vit chez lui et le cheval au haras :
   **deux points** (recommandé) ou un seul ?
