# Éditeur de tournées — architecture cartographique

Ce document explique les choix techniques de l'éditeur de tournées interactif (Tournées → "+ Nouvelle tournée"), distinct du système existant de tournées récurrentes par zone (grille "Vos tournées", inchangée).

## Vue d'ensemble

- **Carte** : [MapLibre GL JS](https://maplibre.org/) — moteur d'affichage open-source, pas de compte ni de clé.
- **Fond de carte** : [OpenFreeMap](https://openfreemap.org/) par défaut (données OpenStreetMap, gratuit, sans clé).
- **Adresses (France)** : Géoplateforme IGN (déjà utilisée ailleurs dans Animéo pour l'autocomplétion).
- **Itinéraires / optimisation** : [openrouteservice](https://openrouteservice.org/) (hébergé par HeiGIT).

Le logiciel reste la source de vérité : une tournée est toujours enregistrée en base avant tout calcul externe, et reste éditable/sauvegardable même si un service externe est indisponible.

## Couche `src/lib/maps/`

| Fichier | Rôle |
|---|---|
| `map-types.ts` | Types partagés (coordonnées, résultats de géocodage/itinéraire/optimisation). Aucun composant ne manipule directement le format brut d'un fournisseur. |
| `geocoding-provider.ts` | Géoplateforme IGN — `searchAddresses`, `geocodeAddress`, `reverseGeocode`. Remplace la logique auparavant dupliquée entre `src/lib/geocoding.ts` et `/api/address-search` (ces deux-là délèguent désormais ici). |
| `routing-provider.ts` | openrouteservice Directions (`computeRoute`) et Matrix (`computeMatrix`). |
| `optimization-provider.ts` | VROOM, hébergé par HeiGIT (`optimizeStopOrder`) — propose un ordre, ne modifie jamais rien directement. |
| `map-utils.ts` | `getMapStyleUrl()` (abstraction du fond de carte), formatage distance/durée. |

Les composants React (`TourRunMap`, `TourRunEditor`, ...) ne connaissent que ces modules, jamais les URLs ou formats des fournisseurs externes.

## Changer de fond de carte

Le fond de carte n'est **jamais codé en dur** dans les composants. Il est résolu par `getMapStyleUrl()` (`src/lib/maps/map-utils.ts`) :

```ts
process.env.NEXT_PUBLIC_MAP_STYLE_URL?.trim() || "https://tiles.openfreemap.org/styles/liberty"
```

Pour remplacer OpenFreeMap par un autre fournisseur compatible MapLibre (style JSON standard) :

1. Renseigner `NEXT_PUBLIC_MAP_STYLE_URL` dans la configuration de l'hébergeur avec l'URL du nouveau style.
2. Redéployer. Aucun changement de code n'est nécessaire.

Variable publique (préfixe `NEXT_PUBLIC_`) : c'est une URL de style, pas un secret — MapLibre la charge depuis le navigateur.

## Pourquoi `api.heigit.org` et pas `api.openrouteservice.org`

L'ancien domaine `api.openrouteservice.org` a été retiré le 24 août 2026 (annonce HeiGIT). Tous les appels de `routing-provider.ts`/`optimization-provider.ts` utilisent le domaine actuel :

- Directions/Matrix : `https://api.heigit.org/openrouteservice/v2/...`
- Optimisation (VROOM) : `https://api.heigit.org/vroom/v0`

La clé API existante (créée sur `api.openrouteservice.org`) reste valable sur le nouveau domaine — aucune reconfiguration nécessaire côté compte HeiGIT.

## Géocodage : pourquoi pas `api-adresse.data.gouv.fr`

Cet ancien endpoint est déprécié/retiré. Le géocodage adresse (recherche, adresse unique, inverse) passe exclusivement par le service de géocodage actuel de la Géoplateforme IGN (`data.geopf.fr/geocodage/...`), gratuit et sans clé.

## Variables d'environnement

```env
# Fond de carte — optionnel, défaut OpenFreeMap (aucune clé nécessaire)
NEXT_PUBLIC_MAP_STYLE_URL=

# openrouteservice — obtenue gratuitement sur openrouteservice.org/dev/#/signup
# STRICTEMENT serveur : ne jamais préfixer NEXT_PUBLIC_.
OPENROUTESERVICE_API_KEY=
```

Sans `OPENROUTESERVICE_API_KEY`, l'éditeur de tournées fonctionne normalement : la carte, les arrêts, la sauvegarde et la réorganisation manuelle marchent — seuls le tracé réel de la route et l'optimisation sont indisponibles, remplacés par l'estimation à vol d'oiseau déjà utilisée ailleurs dans Animéo (`tour-estimate.ts`, coefficient ×1,3). C'est signalé à l'écran ("≈ Estimation à vol d'oiseau").

## Modèle de données

Nouveaux modèles (migration additive, coexistent avec `Tour`/`Zone` existants — voir ci-dessous) :

- **`TourRun`** : une tournée datée concrète, rattachée à l'utilisateur qui l'a créée (comme `CalendarConnection`). Départ/arrivée typés (`TourEndpointType` : CABINET, HOME, FAVORITE, CUSTOM, CURRENT_LOCATION, LAST_APPOINTMENT, SAME_AS_START), options de routage, cache du dernier itinéraire calculé (`routeGeometry`, jamais la source de vérité — recalculé dès qu'un élément pertinent change).
- **`TourStop`** : un arrêt de la tournée, éventuellement lié à un `Appointment` (`appointmentId` nullable). Label/adresse/coordonnées sont un **instantané** pris au moment de l'ajout — une tournée déjà enregistrée continue d'avoir du sens si l'adresse du client change ensuite. Les infos d'affichage secondaires (espèce, prix, lien vers la fiche) restent lues en direct sur l'`Appointment`.
- **`SavedPlace`** : lieux favoris par utilisateur (cabinet, domicile, clinique, écurie, autre).
- **`TourPreferences`** : réglages globaux par utilisateur (une ligne unique) — départ/arrivée par défaut, temps de sécurité, pause déjeuner, horaires de travail, préférence d'optimisation, routes à éviter. Une `TourRun` peut toujours surcharger ces valeurs localement sans jamais modifier les préférences globales.

### Pourquoi pas le modèle `Tour` existant

Le `Tour` déjà présent dans le schéma désigne un **gabarit récurrent par zone** (jour de la semaine, récurrence, zone géographique — pas de lien direct vers des rendez-vous), utilisé par la grille "Vos tournées" et les campagnes de relance par zone. C'est un concept différent d'une tournée datée avec de vrais arrêts ordonnés. Les deux systèmes coexistent intentionnellement (décision validée) : `Tour`/`Zone` restent inchangés, `TourRun`/`TourStop` couvrent le nouvel éditeur interactif.

## Optimisation — comment ça fonctionne

1. `optimizeTourRunAction` envoie à VROOM : point de départ/arrivée, coordonnées + durée de service + fenêtre horaire de chaque arrêt localisé. Un rendez-vous confirmé (`locked: true`) reçoit une fenêtre étroite (±15 min autour de son heure) plutôt qu'une contrainte stricte au sens strict, pour laisser VROOM une marge de manœuvre réaliste sans déplacer l'horaire affiché au client.
2. Le résultat (ordre proposé, distance/durée totales, arrêts non placés) est stocké dans `TourRun.lastOptimizationProposal` — **jamais appliqué automatiquement**.
3. L'écran de comparaison (actuel vs proposé) laisse la praticienne choisir : "Appliquer la proposition" (réordonne réellement les arrêts, recalcule l'itinéraire) ou "Garder ma tournée" (efface la proposition, rien ne change).

## Confidentialité

Les appels à openrouteservice (Directions, Matrix, Optimization) ne transmettent que des coordonnées, durées et contraintes horaires — jamais nom de client, téléphone, email, nom d'animal ou notes de consultation. Le label affiché dans la tournée (ex. "Bella — Claire Dupont") reste strictement interne à Animéo.

## Limites connues (V1)

- Pas de déplacement de marker sur la carte, ni d'ajout d'arrêt par clic direct (prévu en V2/P2).
- Pas de vue "semaine" (architecture compatible, non développée).
- La comparaison d'optimisation utilise l'API Matrix pour la tournée "actuelle" ; en cas d'indisponibilité, elle retombe elle aussi sur l'estimation à vol d'oiseau.
- Le géocodage inverse (bouton "Ma position actuelle") dépend de la géolocalisation du navigateur — jamais suivie en continu, utilisée uniquement au moment du clic.
