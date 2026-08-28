# AUDIT-FINDINGS.md — Phase 0 (reconnaissance, aucune modification de code)

Date de l'audit : 2026-08-28. Aucune ligne de code applicative n'a été modifiée pour produire ce
document (seuls des scripts de vérification jetables, hors dépôt, ont servi à confirmer certains
points empiriquement — signalé quand c'est le cas).

---

## 1. Parcours utilisateur réel, étape par étape

Orchestré par `src/components/booking/public-booking-flow.tsx`. Cinq écrans (`BookingScreen`,
ligne 14) : `consultation → details → schedule → summary → success`. Aucune route/URL dédiée par
étape — tout vit dans un seul `useState<BookingScreen>` (ligne 28), la barre d'adresse reste sur
`/reserver/[slug]` du début à la fin.

### Étape 1 — Consultation (`location-service-steps.tsx`, `ConsultationStep`)
Champs : sélection d'une prestation (carte), puis sélection du mode (Cabinet / Domicile).
Les deux sont obligatoires pour activer "Continuer" (`BookingActions nextDisabled={!serviceId || !mode}`).

### Étape 2 — Vous & votre animal (`details-step.tsx`, `DetailsStep`, 23 008 octets)
Trois groupes accordéon, tous doivent être valides pour continuer (`isGroupValid`, ligne 83) :

| Groupe | Champ | Obligatoire |
|---|---|---|
| Coordonnées | Prénom | Oui (ligne 240) |
| | Nom | Oui (251) |
| | Téléphone | Oui (262) |
| | Email | Oui (275) |
| Adresse | Adresse | Oui (302) |
| | Code postal | Oui (322) |
| | Ville | Oui (336) |
| | Complément d'adresse | Non |
| Votre animal | Nom de l'animal | Oui (369) |
| | Espèce | Oui (379) |
| | Race | **Non** (facultatif — combobox) |
| | Date de naissance | **Non** (facultatif — sélecteur) |
| | Motif de consultation | Oui (395) |

→ **10 champs obligatoires**, dont une adresse postale complète, avant que l'utilisateur n'ait vu
un seul créneau disponible. Correction au constat D (l'audit fourni mentionnait race et date de
naissance parmi les champs demandés « avant » les créneaux, ce qui est exact, mais ils ne sont pas
obligatoires — seuls les 10 ci-dessus bloquent la progression).

### Étape 3 — Rendez-vous (`schedule-step.tsx`, `ScheduleStep`)
Sélection d'une date puis d'une heure parmi les créneaux non occupés. Aucun champ de saisie.

### Étape 4 — Confirmation (`summary-steps.tsx`, `BookingSummary`)
Récapitulatif en lecture seule + une case à cocher obligatoire (consentement RGPD, ligne 74-75) qui
seule contrôle l'activation du bouton final (`nextDisabled={!privacyAccepted}`, ligne 79).

### Écran 5 — Succès (`summary-steps.tsx`, `BookingSuccess`)
Lecture seule, un seul bouton « Retour » qui appelle `resetBooking()` et revient à l'étape 1.

---

## 2. Traçabilité de la donnée

| Donnée affichée | Source réelle |
|---|---|
| Nom, prénom, profession, entreprise, bio, localisation, logo, photo, couleur du praticien | **Base réelle** — `getBusinessProfile()` (`src/lib/business-profile-actions.ts`), via `loadProfessional()` dans `src/app/reserver/[slug]/page.tsx:9-31` |
| Adresse/CP/ville du cabinet | **Base réelle** — mêmes champs `BusinessProfile` |
| Liste des prestations (`professional.services`) | **Base réelle** — `getPublicServices()` (`src/lib/services-actions.ts`), branché dans `reserver/[slug]/page.tsx` lors d'une session antérieure de ce projet. *Ce point n'est plus dans l'état décrit implicitement par le document d'audit fourni : les prestations ne viennent plus d'un tableau statique.* |
| Zones (`professional.zones`) et **frais de déplacement en mode "zone"** | **Donnée de démo en dur** — `bookingProfessionals[0].zones` dans `src/data/public-booking.ts:197-201`, jamais écrasée par `loadProfessional()` (seuls les champs de profil le sont, pas `zones`). Confirme le constat A. |
| Dates et créneaux proposés (`bookingDates`) | **Donnée de démo en dur** — `src/data/public-booking.ts:205-258`, calculée une seule fois au chargement du module à partir de `bookingStartDate`/`bookingLimitDate`/`slotsByWeekday` codés en dur. `getDayAvailability()` (`src/lib/availability.ts`), qui lit les vraies disponibilités du profil (horaires, vacances, fermetures), n'est **jamais importée** dans `src/components/booking/` ni `src/app/reserver/` (vérifié par recherche exhaustive — voir §3.A). |
| Tournées mises en avant, « X passages déjà identifiés » | **Donnée de démo en dur** — `publicBookingTours`, `publicBookingTourAppointments`, `publicBookingMapClients` dans `src/data/public-booking-tours.ts`, dont l'en-tête du fichier dit littéralement : « Données figées utilisées uniquement pour suggérer des créneaux de tournée [...] Volontairement indépendantes des tournées réelles (gérées en base) ». Ce sont de vrais faux noms de clients (« Marie Dupont », « Thomas Martin »...). |
| Créneaux déjà occupés (grisés) | **Base réelle** — `getOccupiedSlotsAction()` interroge `Appointment` et `BlockedSlot` en base. |
| Prix affichés (le cas échéant) | Depuis une session antérieure de ce projet, les tarifs et frais de déplacement ne sont plus affichés sur les cartes ni le récapitulatif détaillé de l'étape 4 (seuls « Consultation » et « Total estimé » restent) — voir remarque au §3.B. |

---

## 3. Confirmation ou infirmation des constats

### A. Logique métier et intégrité des données

- **[P0] Créneaux hors vraies disponibilités — CONFIRMÉ, et plus grave que décrit.**
  `bookingStartDate = new Date(2026, 7, 25, 12)` et `bookingLimitDate = new Date(2026, 10, 24, 12)`
  à `src/data/public-booking.ts:205-206`. `slotsByWeekday` codé en dur lignes 208-214.
  `getDayAvailability` (`src/lib/availability.ts:30`) n'est importée que par
  `src/lib/agenda-aggregation.ts:1` et `src/components/agenda/week-planner.tsx:8` — jamais côté
  public (recherche `grep -r "getDayAvailability"` sur tout `src/`, zéro résultat dans `booking/`
  ou `app/reserver/`).
  **Aggravant non listé dans le document d'audit, vérifié empiriquement ce jour (28/08/2026) sur le
  serveur local** : `bookingDates` ne filtre **aucune date passée**. La grille de créneaux affiche
  actuellement Mardi 25, Mercredi 26 et Jeudi 27 août comme sélectionnables alors qu'on est le
  28 août — un visiteur peut réserver un rendez-vous à une date déjà révolue. Aucune vérification de
  date future n'existe non plus côté serveur (`submitPublicBookingAction`, voir plus bas). C'est
  l'anomalie la plus sévère et la plus immédiatement démontrable du tunnel.

- **[P0] Chevauchements possibles — CONFIRMÉ.**
  `hasConflict()` (`appointments-actions.ts:55-65`) : `where: { date, start, status: { not: "CANCELLED" } }` —
  comparaison stricte sur `start`, `duration` n'apparaît nulle part dans la requête. Côté client,
  `availableSlots` (`schedule-step.tsx:99`) filtre par `!occupiedSlots[...].includes(slot)`, même
  logique d'égalité stricte, aucun calcul d'intervalle.

- **[P0] Aucune validation serveur de l'entrée publique — CONFIRMÉ.**
  `PublicBookingInput` (`appointments-actions.ts:147-181`) : seuls `postalCode/city/inseeCode/lat/lng`
  (via `geoFieldsSchema`, ligne 190), `ownerFirstName/…` (via `ownerFieldsSchema`, ligne 209) et
  `animalSpecies/…` (via `animalFieldsSchema`, ligne 218) passent par Zod. `date`, `start`,
  `duration`, `price`, `serviceName`, `mode`, `location`, `notes` sont écrits tels quels dans
  `prisma.appointment.create` (lignes 335-357) — **aucune borne, aucun recalcul, aucune existence
  vérifiée**. `input.price` en particulier alimente directement `data.price` (ligne 353) : un appel
  direct au server action (hors UI, ce qui est possible pour toute action Next.js exposée) avec
  `price: 0` est accepté tel quel.
  Nuance : `mode` n'est pas totalement libre — `dbMode[input.mode]` (ligne 346) lève une exception
  Prisma si la valeur ne vaut ni `"cabinet"` ni `"home"`, mais cela produit une erreur serveur non
  gérée (probable 500) plutôt qu'un rejet propre avec message utilisateur.

- **[P0] Aucun rate limiting — CONFIRMÉ.**
  `src/lib/rate-limit.ts` (`isRateLimited`/`recordAttempt`, basé sur la table `RateLimitEvent`)
  n'est importé que par `src/lib/auth/password-reset-actions.ts` et `src/lib/auth/actions.ts`
  (recherche exhaustive). Aucune trace dans `appointments-actions.ts`. Pas de honeypot ni de champ
  piège anti-bot dans `details-step.tsx`.

- **[P1] Race condition assumée — CONFIRMÉ**, le commentaire au-dessus de `hasConflict`
  (`appointments-actions.ts:47-53`) le reconnaît explicitement mot pour mot. Aucun index unique
  partiel sur `(date, start)` dans `prisma/schema.prisma` (modèle `Appointment`, seuls des index
  simples sur `clientId`, `animalId`, `date` existent).

- **[P1] Décalage de fuseau — CONFIRMÉ dans son principe, portée à préciser.**
  `toDate()` (`appointments-actions.ts:19-21`) ancre en UTC minuit
  (`` `${dateId}T00:00:00.000Z` ``). Le calendrier public (`bookingDates`,
  `src/data/public-booking.ts:226-256`) construit et relit ses identifiants de date via des
  méthodes locales appariées (`new Date(year, month, day, 12)` puis `.getFullYear()/.getMonth()/.getDate()`
  sur ce même objet) : ce mécanisme précis est auto-cohérent quel que soit le fuseau d'exécution, y
  compris entre serveur et navigateur, tant que la date sélectionnée (`date.id`) est reprise telle
  quelle jusqu'à la soumission (c'est le cas — vérifié, `dateId` n'est jamais recalculé côté client
  à la soumission). Le risque réel se situe plutôt en aval : toute lecture de `Appointment.date`
  faite via des accesseurs **locaux** (`.getDate()`, `.getMonth()`) plutôt que `.toISOString()`
  déraperait d'un jour si le serveur ne tourne pas en UTC — à vérifier précisément à la Phase 2,
  fichier par fichier consommant `Appointment.date` côté tableau de bord, plutôt que supposé réglé
  ici par la seule normalisation `Europe/Paris` suggérée.

- **[P1] `getOccupiedSlotsAction` non limitée — CONFIRMÉ.**
  Aucune vérification de session dans `getOccupiedSlotsAction` (`appointments-actions.ts:383-405`).
  Appelée avec toute la fenêtre en un coup : `getOccupiedSlotsAction(toDateId(bookingStartDate), toDateId(bookingLimitDate))`
  (`schedule-step.tsx:53`), soit ~3 mois d'un coup, sans restriction de débit.

- **[P1] Données de démo mélangées — CONFIRMÉ, avec une précision utile.**
  `loadProfessional()` (`src/app/reserver/[slug]/page.tsx:9-32`) part de `bookingProfessionals[0]`
  puis écrase nommément les champs de profil et, désormais, `services` (voir §2) — mais **pas**
  `zones`, qui restent celles de `src/data/public-booking.ts:197-201`. Les frais de déplacement en
  mode « zone » (`travelFeeMode === "zone"`, résolu via `zone?.travelFee`, voir
  `public-booking-flow.tsx:44-46`) sont donc toujours calculés sur des zones fictives, même pour un
  praticien qui aurait configuré ses propres zones réelles dans Paramètres → Tournées (lesquelles
  existent bel et bien en base, `getTours()`/`getZones()` dans `src/lib/tours.ts`, mais ne sont
  jamais lues par le tunnel public). `schedule-step.tsx:15` importe en plus
  `publicBookingTours`, `publicBookingTourAppointments`, `publicBookingMapClients` — voir §2, ce
  sont des données 100 % fictives et le fichier source le documente lui-même.

### B. Confiance, conformité, communication

- **[P0] Mention trompeuse — CONFIRMÉ.** `public-booking-flow.tsx:180` :
  `<span>· Aucune donnée n'est envoyée pour cette démonstration</span>`. Or `submitRequest()`
  (lignes 77-140) appelle bien `submitPublicBookingAction`, qui crée réellement `Client`, `Animal`
  et `Appointment` en base (vérifié ce jour par un test de bout en bout créant puis supprimant une
  fiche réelle). Note : la même mention trompeuse existe **aussi** à
  `src/components/booking/summary-steps.tsx` ? — non, vérifié absente là, uniquement dans le pied de
  page global de `public-booking-flow.tsx`, donc visible sur les 5 écrans du tunnel.

- **[P0] Lien de politique de confidentialité mort — CONFIRMÉ.**
  `summary-steps.tsx:74` : `<span className="font-extrabold text-animeo underline">Politique de
  confidentialité</span>` — un `<span>`, aucun `href`, non focusable au clavier. Recherche
  exhaustive : **aucune page de politique de confidentialité n'existe dans `src/app`.**

- **[P1] Écart de prix inexpliqué — PARTIELLEMENT INFIRMÉ (état a changé depuis la rédaction du
  document d'audit).** Une session antérieure de ce projet a déjà supprimé la ligne « Frais de
  déplacement » du récapitulatif à la demande de l'utilisateur (`summary-steps.tsx`, section Tarif
  actuelle : seulement « Consultation » et « Total estimé »). Le total continue d'inclure
  silencieusement les frais de déplacement sans les détailler — ce n'est donc plus un « écart entre
  deux nombres affichés » (le nombre différent n'est plus affiché du tout), mais cela reste un vrai
  sujet de transparence tarifaire à trancher explicitement en Phase 1/6 : soit itemiser à nouveau
  proprement, soit assumer un tarif tout compris annoncé clairement comme tel.

- **[P1] Aucun email de confirmation — CONFIRMÉ.**
  `src/lib/email/provider.ts` (`getEmailProvider()`) et `src/lib/email/templates.ts` existent et
  sont utilisés uniquement par la réinitialisation de mot de passe et le code 2FA
  (`passwordResetTemplate`, `twoFactorCodeTemplate`). Aucun template ni appel d'envoi dans
  `submitPublicBookingAction`.

- **[P2] Écran de succès pauvre — CONFIRMÉ, avec un détail exploitable.**
  `BookingSuccess` (`summary-steps.tsx:91-110`) ne montre ni référence de demande, ni lien .ics, ni
  moyen d'annuler/modifier. L'identifiant réel (`request.id`, retourné par
  `submitPublicBookingAction`) est **déjà présent dans l'état `PublicBookingRequest`**
  (`public-booking-flow.tsx:121`) mais jamais rendu à l'écran — un gain rapide pour la Phase 6.

### C. Accessibilité

- **[P1] Labels implicites — CONFIRMÉ à la lettre.**
  `BookingField` (`booking-ui.tsx:7-23`) : `<label className="block">` (ligne 9) enveloppant
  `{children}`, aucun `id` généré, aucun `htmlFor`. Recherche exhaustive `grep -r "htmlFor"
  src/components/booking/` : **zéro résultat.** Idem pour `aria-invalid` : **zéro résultat.**

- **[P1] Erreurs non annoncées proprement — CONFIRMÉ pour `aria-invalid` (absent partout). Nuancé
  pour le `role="alert"`.** Il est bien positionné à l'intérieur du `<label>`
  (`booking-ui.tsx:12-17`), pas dans une région dédiée stable. Le comportement « se redéclenche à
  chaque rendu » n'a pas pu être vérifié avec un lecteur d'écran réel dans cette phase (aucun outil
  de ce type disponible ici) — plausible structurellement (le nœud `role="alert"` est démonté/
  remonté à chaque bascule `error ? … : null`, ce qui peut effectivement redéclencher l'annonce à
  chaque frappe une fois l'erreur affichée), mais à confirmer avec NVDA/VoiceOver en Phase 3 plutôt
  qu'assumé ici.

- **[P1] Changement d'étape silencieux — CONFIRMÉ.**
  `public-booking-flow.tsx` : le changement de `screen` (ligne 28) ne s'accompagne d'aucun
  `focus()`, `tabIndex`, ni région `aria-live` autour de `<section>` (ligne 147). Le focus clavier
  reste sur le bouton « Continuer » de l'étape précédente, qui a disparu du DOM.

- **[P1] Contrastes — CONFIRMÉ pour deux des trois suspects, calculs WCAG à l'appui (fond
  `#4FAF9F` = `--color-animeo` par défaut) :
  - `text-white/75` sur `bg-animeo` (cartes « Tournée correspondante »,
    `schedule-step.tsx:151`) : **≈ 2,1:1** — échec net (seuil 4,5:1 en petit texte).
  - `text-white/80` (`schedule-step.tsx:153`) : **≈ 2,2:1** — échec net.
  - Bouton principal en `disabled:opacity-70` (`booking-ui.tsx:29`, texte blanc sur `bg-animeo` à
    70 % d'opacité sur fond blanc) : **≈ 1,9:1** — échec net.
  - `text-animeo-muted` (`#6b7780` par défaut) sur blanc pur : **≈ 4,59:1** — **passe** de justesse
    la barre AA pour texte normal dans le thème par défaut. À revérifier néanmoins sur les fonds
    teintés (`bg-animeo-soft`, `bg-animeo-bg`) où le contraste est nécessairement plus faible que
    sur blanc pur, et à revérifier si le praticien personnalise sa couleur principale (fonctionnalité
    existante, Paramètres → Personnalisation) — un thème plus clair ferait immédiatement échouer
    les deux premiers cas ci-dessus encore davantage.

- **[P2] Sélecteurs de date/heure — CONFIRMÉ.** Grilles de `<button aria-pressed>` dans
  `schedule-step.tsx:187` et `202`, sans `role="group"`/`aria-labelledby` englobant, sans gestion
  de flèches directionnelles (recherche `onKeyDown` dans ce fichier : zéro résultat).

- **[P2] Faux lien — CONFIRMÉ**, voir §B.

- **[P2] Focus visible — CONFIRMÉ pour les créneaux.** Aucune classe `focus-visible:` dans
  `schedule-step.tsx` (recherche exhaustive sur ce fichier). Nuance positive à noter : d'autres
  parties du tunnel ajoutées plus récemment (`details-step.tsx`, `location-service-steps.tsx`,
  `birth-date-picker.tsx`, `breed-combobox.tsx`) utilisent déjà systématiquement
  `focus-visible:ring-2 focus-visible:ring-animeo-dark` — l'incohérence est donc précisément
  localisée à `schedule-step.tsx` et à `ModeCard`/`BookingActions`, pas à l'ensemble du tunnel.

### D. Parcours et friction

- **[P0] Saisie perdue au rafraîchissement — CONFIRMÉ.** Tout l'état (`screen`, `mode`, `serviceId`,
  `address`, `owner`, `animal`, `dateId`, `time`...) vit dans des `useState` locaux à
  `PublicBookingFlow` (`public-booking-flow.tsx:28-39`), sans `sessionStorage`, sans URL, sans
  `router.push`.

- **[P0] Bouton retour du navigateur — CONFIRMÉ**, conséquence directe du point précédent : aucun
  `history.pushState` ni changement d'URL entre les étapes (une seule route,
  `/reserver/[slug]`, jamais de segment ou query supplémentaire par étape).

- **[P1] Ordre des étapes — CONFIRMÉ**, voir §1 (10 champs obligatoires, dont adresse postale
  complète, avant le premier créneau visible).

- **[P1] Créneau non réservé pendant la saisie — CONFIRMÉ.** Le seul contrôle de disponibilité a
  lieu dans `submitPublicBookingAction` (`hasConflict`, appelée ligne 327), c'est-à-dire après la
  case de consentement de l'étape 4. Rien à l'étape 3 (sélection) ni à l'étape 2/3 (transition) ne
  reverrouille ou revérifie.

- **[P1] Réinitialisations silencieuses — CONFIRMÉ.**
  `changeMode()` (`public-booking-flow.tsx:62-68`) réinitialise `address`, `zoneId`, `dateId`,
  `time`. `changeAddress()` (70-75) réinitialise `dateId`, `time`. Le gestionnaire inline
  `onServiceChange` (ligne 153) réinitialise `mode`, `address`, `zoneId`, `dateId`, `time`. Aucun de
  ces trois points n'affiche de confirmation ni d'avertissement.

- **[P2] Échec réseau masqué — CONFIRMÉ à la lettre**, y compris le commentaire qui l'assume
  explicitement : `schedule-step.tsx:54-58`, le `.catch()` est vide côté état (tous les créneaux
  restent visibles) avec un commentaire disant explicitement que la vérification définitive se fait
  côté serveur — ce qui est vrai pour la soumission finale, mais laisse un visiteur choisir un
  créneau déjà pris sans le savoir avant l'étape 4.

### E. Responsive et rendu

- **[P1] Barre d'actions et zone de sécurité iOS — CONFIRMÉ.** `BookingActions`
  (`booking-ui.tsx:25-35`) : `className="sticky bottom-0 ... bg-white/95 backdrop-blur ..."`
  (ligne 27), aucune trace de `env(safe-area-inset-bottom)` dans ce fichier ni dans
  `globals.css` pour cette classe.

- **[P1] Curseur de progression qui déborde — CONFIRMÉ, mécanisme précis identifié.**
  `booking-progress.tsx` : le point (`h-6 w-6`, soit 24 px) est positionné en
  `style={{ left: \`${percent}%\` }}` avec la classe `-translate-x-1/2`, dans un conteneur
  seulement `relative` (pas de marge interne compensatoire). À `percent = 0` (étape 1), le centre du
  point est à `left: 0`, donc la moitié du point (12 px) déborde à gauche du conteneur ; symétrique
  à `percent = 100` (étape 4). Confirmé par lecture directe du style, pas seulement par supposition.
  Point positif à noter : le composant a par ailleurs déjà une bonne base d'accessibilité
  (`role="progressbar"`, `aria-valuenow/min/max`, `aria-label` explicite).

- **[P2] Grille de dates trop longue sur mobile — CONFIRMÉ.** `grid-cols-2` avec `min-h-24`
  (`schedule-step.tsx:182`), sur potentiellement 3 mois de dates (`bookingStartDate` →
  `bookingLimitDate`) filtrées seulement par mois sélectionné, pas de vue calendrier compacte.

- **[P2] Débordement horizontal du sélecteur de mois non signalé — CONFIRMÉ.**
  `overflow-x-auto pb-1` (`schedule-step.tsx:167`), aucun indicateur de dégradé ou de flèche.

- **[P2] Contrôle multi-breakpoints — NON FAIT en Phase 0** (hors périmètre reconnaissance ; à
  couvrir en Phase 5 avec captures avant/après comme demandé).

---

## 4. Problèmes supplémentaires trouvés (non listés dans le document d'audit fourni)

- **[P0] Dates passées réservables — voir §3.A.** C'est la découverte la plus importante de cette
  phase : reproduite empiriquement ce jour sur le serveur local (le 28/08/2026, les dates du
  25, 26 et 27 août apparaissent sélectionnables dans l'étape 3). À traiter en priorité absolue en
  Phase 1/2, avant même la fenêtre glissante complète : un simple filtre « date ≥ aujourd'hui » côté
  génération ET une vérification miroir côté serveur sont un prérequis minimal.

- **[P1] `mode` invalide côté serveur produit une exception non gérée, pas un rejet propre.**
  Voir §3.A — `dbMode[input.mode]` (`appointments-actions.ts:346`) plante si `mode` n'est ni
  `"cabinet"` ni `"home"`, au lieu de renvoyer `{ ok: false, error: ... }` comme le reste de
  l'action. À couvrir par le même schéma Zod complet prévu en Phase 1.

- **[P1] Zones réelles existantes mais non branchées au tunnel public.**
  `src/lib/tours.ts` (`getTours()`, `getZones()`) alimente déjà Paramètres → Tournées avec de vraies
  données en base (confirmé, ce sont les mêmes fonctions utilisées par
  `src/app/dashboard/parametres/page.tsx`). Le tunnel public pourrait donc s'y brancher sans
  invention de nouveau modèle, contrairement aux tournées de démonstration
  (`publicBookingTours`) qui n'ont pas d'équivalent réel évident et nécessiteront une vraie décision
  produit (masquer la fonctionnalité vs. construire un modèle `Tour` public réel).

- **[P2] Incohérence de granularité disponible entre dashboard et tunnel public.**
  Le dashboard (agenda) sait raisonner heure par heure via `getDayAvailability` (créneaux de 15 min
  pour les plages bloquées, voir `minutesToTime`/`timeToMinutes` dans `appointments-actions.ts:365-374`),
  alors que le tunnel public n'a que 3 à 4 créneaux fixes par jour de la semaine
  (`slotsByWeekday`). Une vraie intégration en Phase 2 devra décider de la granularité côté public
  (créneaux fixes façon agenda de prise de RDV, ou vraie disponibilité minute par minute) — point de
  conception à trancher avant d'écrire le code, pas seulement un détail d'implémentation.

---

## Ce qui n'a volontairement pas été vérifié en Phase 0

- Mesures de contraste exhaustives sur l'ensemble du tunnel à tous les breakpoints (Phase 3/5).
- Comportement réel au lecteur d'écran (NVDA/VoiceOver) — seules des vérifications structurelles du
  JSX ont été faites ici.
- Tout ce qui touche à `prisma/schema.prisma` au-delà de la lecture (aucune migration, comme demandé).
- Le contenu exact à mettre dans une future page de politique de confidentialité (question produit/
  juridique, pas technique).

---

## Prochaine étape

En attente de validation avant d'entamer la **Phase 1** (sécurité serveur : validation Zod complète
sur `PublicBookingInput`, recalcul serveur du prix, rejet des dates passées et hors fenêtre, rate
limiting par IP/email, retrait de la mention trompeuse du pied de page).
