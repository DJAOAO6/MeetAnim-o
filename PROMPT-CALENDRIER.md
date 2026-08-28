# Prompt — Nouveau sélecteur de date et d'heure (page de réservation)

> À poser à la racine du repo à côté de `AUDIT-RESERVATION.md`.
> Prompt de démarrage : « Lis `PROMPT-CALENDRIER.md` et applique la Partie A. Arrête-toi avant la Partie B. »
> Une maquette de référence accompagne ce document — s'y référer pour la mise en page exacte.

---

## Objectif

Remplacer le sélecteur de date et d'heure de `src/components/booking/schedule-step.tsx` par une
disposition en deux colonnes : calendrier mensuel à gauche, créneaux groupés par demi-journée à droite.

Le travail est découpé en deux parties. **La Partie A est autonome et livrable seule.** La Partie B
change l'ordre des étapes et a des dépendances décrites plus bas — ne pas la commencer sans validation.

---

## Skills à utiliser

Installés dans `.claude/skills/`. Depuis la racine du projet :

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<requête>" --domain ux
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<requête>" --stack nextjs
```

| Skill | Usage ici |
|---|---|
| `ui-ux-pro-max` | Pattern de grille de calendrier, navigation clavier, contrastes, densité tactile, responsive |
| `web-design-guidelines` | Finition visuelle |
| `vercel-react-best-practices` | Structure du composant, état, effets |
| `playwright-cli` | Tests E2E de la nouvelle interaction |

Requêtes de départ suggérées, une intention par recherche :

```
"date picker calendar grid keyboard"     --domain ux
"time slot selection grouped"            --domain ux
"disabled unavailable state affordance"  --domain ux
"focus not obscured"                     --domain ux
"two column form mobile stacking"        --domain ux
```

Vérifier la pertinence de chaque résultat avant application. Ce document et les règles du repo
priment sur les recommandations du skill. Tracer dans le rapport final les recommandations retenues
et celles écartées, avec la raison.

---

# PARTIE A — Le sélecteur

## A1. Structure

Deux colonnes à partir de `lg:`, empilées en dessous. À gauche `1. Choisissez une date`, à droite
`2. Choisissez une heure`. Sur mobile, la colonne horaires se place sous le calendrier et n'apparaît
qu'une fois une date choisie.

Le bandeau récapitulatif existant (`{service.name} · {duration} minutes · {mode}`) reste en tête,
sous le titre. Titre de l'étape : **« Choisissez votre créneau »**.

## A2. Calendrier mensuel (colonne gauche)

- En-tête : bouton mois précédent, libellé `Novembre 2026` (via `Intl.DateTimeFormat` fr-FR, capitalisé), bouton mois suivant.
- Semaine commençant le **lundi**. En-têtes de colonnes : `LUN MAR MER JEU VEN SAM DIM`.
- Grille de 7 colonnes avec **cellules vides en début et fin de mois** pour aligner les jours sur la bonne colonne. Le mois affiché est complet, pas seulement les jours ouvrables.
- Contenu d'une cellule : le numéro du jour en gras, puis le mois abrégé en dessous (`5` / `nov.`).

### États d'une date

| État | Condition | Rendu |
|---|---|---|
| Disponible | au moins un créneau libre | fond blanc, bordure claire, cliquable |
| Sélectionnée | `dateId` courant | fond `animeo-dark`, texte blanc |
| Complète | des créneaux existent mais tous sont pris | grisée, mention `Complet` sous la date, non cliquable |
| Fermée | aucun créneau ce jour-là (jour non ouvré, vacances, fermeture) | grisée sans mention, non cliquable |
| Hors fenêtre | avant J+1 ou au-delà de la limite | grisée, non cliquable |

**Attention :** `bookingDates` ne contient aujourd'hui **que les jours qui ont des créneaux**. Une
grille mensuelle a besoin de tous les jours du mois. Construire la grille à partir du mois calendaire,
puis y projeter les disponibilités — ne pas itérer sur `bookingDates`.

Distinguer « complet » de « fermé » suppose de connaître les créneaux occupés : `getOccupiedSlotsAction`
les fournit déjà. Un jour est complet quand `slots.length > 0` et que tous ses créneaux sont occupés.

Les flèches de navigation ne doivent pas permettre de sortir de la fenêtre de réservation :
désactiver le bouton quand il n'y a plus de mois disponible dans cette direction.

## A3. Créneaux horaires (colonne droite)

- Bandeau de rappel de la date choisie, avec icône calendrier : `Jeudi 5 novembre` (`Intl.DateTimeFormat` fr-FR, capitalisé).
- Groupes : **Matin** pour les créneaux avant 12:00, **Après-midi** à partir de 12:00. Un groupe vide n'est pas affiché — ne pas laisser un titre orphelin.
- Si des créneaux existent à partir de 18:00, ajouter un groupe **Soir** sur le même principe.
- Grille de boutons, 4 colonnes en desktop, 2 en mobile, hauteur minimale 48 px.
- Créneau sélectionné : fond plein, voir la contrainte de contraste en A5.
- Note de bas de colonne, avec icône horloge : « Seuls les créneaux disponibles sont affichés. »
- Aucune date choisie → état vide explicite dans la colonne droite (« Choisissez d'abord une date »), pas une colonne vide.

## A4. Accessibilité — exigences non négociables

Le sélecteur actuel est une grille de `<button aria-pressed>` sans navigation clavier. La nouvelle
version doit implémenter le pattern grille de calendrier :

- `role="grid"` sur la grille, `role="row"` sur les lignes, `role="gridcell"` sur les cellules.
- **Roving tabindex** : une seule cellule dans l'ordre de tabulation à la fois.
- Navigation aux flèches (←→ jour, ↑↓ semaine), `Home` / `End` début et fin de semaine, `PageUp` / `PageDown` mois précédent et suivant.
- `aria-selected` sur la date choisie, `aria-disabled` sur les dates non sélectionnables.
- Nom accessible complet sur chaque cellule : `Jeudi 5 novembre 2026`, et `Jeudi 21 novembre 2026, complet` pour un jour saturé — pas seulement le numéro.
- Changement de mois annoncé dans une région `aria-live="polite"`.
- Sélection d'une date annoncée de la même façon, puisqu'elle fait apparaître la colonne horaires.
- Groupe de créneaux : `role="group"` avec `aria-labelledby` pointant sur le titre « Matin » ou « Après-midi ».
- `focus-visible` explicite et contrasté sur toutes les cellules et tous les boutons. Ne jamais supprimer l'anneau de focus.
- Cible tactile minimale 44×44 px, espacement d'au moins 8 px.

## A5. Contraste — problème identifié dans la maquette

`--theme-primary` vaut `#4faf9f`. **Texte blanc sur cette couleur donne un rapport de 2,7:1**, sous le
seuil AA de 4,5:1. Le créneau sélectionné de la maquette n'est donc pas conforme en l'état.

Aggravant : `publicColor` est **personnalisable par praticien** (`getBusinessProfile`), donc la couleur
n'est pas connue à l'avance et le problème ne peut pas être réglé par une valeur en dur.

Deux options, à trancher explicitement :

1. Utiliser `animeo-dark` (`#183b45`) pour tous les états sélectionnés remplis — cohérent avec la date sélectionnée de la maquette, conforme quelle que soit la couleur du praticien.
2. Calculer la luminance de `publicColor` au rendu et choisir un premier plan clair ou foncé en conséquence.

Ne pas expédier de blanc sur `--theme-primary` sans avoir mesuré.

Noter aussi que la maquette utilise **deux couleurs de sélection différentes** — foncée pour la date,
verte pour l'heure. Si c'est intentionnel (date verrouillée vs sélection en cours), le documenter ;
sinon, unifier.

## A6. Responsive

- Deux colonnes à partir de `lg`, empilées en dessous.
- La grille de 7 colonnes doit rester lisible à **320 px** : réduire la taille de police et le padding plutôt que d'introduire un défilement horizontal.
- La barre d'actions reste `sticky bottom-0` sur mobile, avec `env(safe-area-inset-bottom)` — absent aujourd'hui.
- Vérifier à 320, 375, 768 et 1440 px : mois complet, mois vide, jour complet, aucune date disponible.

## A7. À ne pas casser

- `onDateChange` doit continuer à remettre `time` à `null`.
- Le `catch` vide de `getOccupiedSlotsAction` fait aujourd'hui apparaître **tous** les créneaux comme libres en cas d'échec réseau. Avec une distinction visuelle « complet », ce silence devient trompeur : afficher un état d'erreur explicite.
- Le bloc « Dates recommandées » / tournées disparaît de la maquette. **Décision à confirmer** avant suppression : il portait la logique de regroupement des visites par secteur. S'il est supprimé, `publicBookingTours`, `publicBookingTourAppointments`, `publicBookingMapClients`, `tourRunsOnDate` et `normalizeLocation` deviennent du code mort dans ce fichier — les retirer proprement.

---

# PARTIE B — Ordre des étapes (ne pas commencer sans validation)

La maquette place **Rendez-vous en étape 2**, avant « Vous & votre animal ». C'est une bonne
décision — l'étape de coordonnées actuelle fait 23 Ko et arrive avant que l'utilisateur ait vu un
seul créneau — mais elle a une dépendance à régler d'abord.

## B1. La dépendance

`ScheduleStep` reçoit aujourd'hui `clientAddress` et `zoneId`, tous deux renseignés dans `DetailsStep`.
Or `zoneId` sert à calculer `travelFee` dans `public-booking-flow.tsx` quand
`service.travelFeeMode === "zone"`. Inverser les étapes sans rien faire d'autre casse le calcul des
frais de déplacement pour les rendez-vous à domicile.

**Résolution demandée :** déplacer la saisie de la localisation en étape 1, juste après le choix du
mode « À domicile ». Le code postal et la ville suffisent à déterminer la zone. L'adresse complète
reste demandée en étape « Vous & votre animal ». C'est cohérent : il faut connaître le secteur pour
proposer des disponibilités à domicile pertinentes.

## B2. Modifications

- `public-booking-flow.tsx` : type `BookingScreen`, fonction `progressFor`, et le câblage `onNext` / `onBack` → `consultation` → `schedule` → `details` → `summary` → `success`.
- `booking-progress.tsx` : ordre du tableau `steps`.
- `location-service-steps.tsx` : ajouter la saisie code postal + ville pour le mode domicile, réutiliser l'autocomplétion d'adresse existante (`src/app/api/address-search`).
- `details-step.tsx` : ne plus être la seule source de `zoneId` ; pré-remplir depuis ce qui a été saisi en étape 1.
- `summary-steps.tsx` : le bouton « Retour » doit maintenant ramener sur `details`, pas `schedule`.

## B3. Effet de bord à traiter

Le créneau est choisi bien plus tôt dans le parcours, donc la fenêtre entre sélection et soumission
s'allonge. Le risque qu'il soit pris entre-temps augmente. Au minimum, revérifier la disponibilité au
passage de `details` à `summary` plutôt que seulement à la soumission finale.

---

## Tests attendus (Playwright)

Utiliser le skill `playwright-cli`.

1. Sélection d'une date puis d'une heure, jusqu'au passage à l'étape suivante.
2. Navigation entre les mois, avec vérification que les flèches se désactivent aux bornes de la fenêtre.
3. Un jour dont tous les créneaux sont pris affiche `Complet` et n'est pas cliquable.
4. Un jour fermé (vacances ou jour non ouvré) est grisé sans mention `Complet`.
5. Parcours complet du calendrier **au clavier seul** : flèches, `Home`, `End`, `PageUp`, `PageDown`, `Entrée`.
6. Changer de date remet la sélection d'heure à zéro.
7. Échec de `getOccupiedSlotsAction` : un état d'erreur explicite est affiché.
8. Projet `devices["iPhone 13"]` : la grille tient sans défilement horizontal, la barre d'actions est atteignable.

## Définition de terminé

- [ ] `npm run lint` et `npx tsc --noEmit` sans erreur
- [ ] `npm test` vert, nouveaux tests inclus
- [ ] Aucun défilement horizontal à 320 px
- [ ] Tous les contrastes mesurés, aucun sous 4,5:1 (3:1 pour le texte large)
- [ ] Calendrier entièrement utilisable au clavier, focus visible partout
- [ ] Chaque cellule a un nom accessible complet, pas seulement un numéro
- [ ] Aucun code mort laissé derrière si le bloc tournées est supprimé
- [ ] Captures avant/après à 375 px et 1440 px
