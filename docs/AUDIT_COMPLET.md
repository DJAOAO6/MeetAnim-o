# Audit complet — Animéo

Date de l'audit initial : 2026-08-28. Mise à jour après correction des P0/P1 : 2026-08-29.
Méthode : lecture exhaustive du code (architecture, modèles de données, actions serveur, tests existants) + exploration réelle de l'application en local via Playwright (connexion, parcours de réservation publique complet, navigation dans le tableau de bord, formulaires, CRUD, cas limites, responsive à 5 largeurs, scan d'accessibilité automatisé via axe-core, tests de sécurité et de conditions de course).

Limite à connaître : le compte de test « secrétariat » a une double authentification par email à laquelle nous n'avions pas accès ; les vérifications de séparation des rôles pour ce compte sont donc confirmées par lecture de code (fiable) mais pas par test live (voir tableau des problèmes, P2-14).

**Statut de la phase de correction** : tous les problèmes P0 et P1 identifiés ci-dessous ont été corrigés et revérifiés en conditions réelles (voir le statut détaillé de chaque fiche). Les problèmes P2/P3 n'ont volontairement pas été traités et attendent une validation avant d'être abordés. Les scores ci-dessous ont été recalculés après cette première vague de corrections.

---

# État général

| Axe | Score initial | Score après correction P0/P1 |
|---|---|---|
| Fonctionnel | 58/100 | 74/100 |
| UI | 78/100 | 80/100 |
| UX | 65/100 | 76/100 |
| Accessibilité | 42/100 | 73/100 |
| Responsive | 72/100 | 76/100 |
| Performance | 80/100 | 80/100 |
| Sécurité | 68/100 | 80/100 |
| Qualité du code | 72/100 | 78/100 |
| Tests | 35/100 | 38/100 |
| Maturité produit | 50/100 | 65/100 |

**AVANCEMENT ESTIMÉ DU LOGICIEL : 58 % → 68 %**

## Comment cette estimation est obtenue

Ce n'est pas une moyenne mécanique des scores ci-dessus, ni un simple comptage de pages qui existent. C'est une pondération par pilier fonctionnel, en tenant compte du fait qu'une page qui *a l'air* terminée mais dont les actions ne sont pas branchées ne compte pas comme « faite ».

**Ce qui a changé depuis l'audit initial** :
- **Tournées n'est plus un pilier fantôme** : la création, l'édition et l'activation/désactivation des tournées et des zones sont désormais réellement persistées en base (P0-2), sur les deux surfaces où elles existaient (page dédiée et onglet Paramètres).
- **Clients/animaux n'est plus à moitié construit** : création et modification d'un client, ajout d'un animal à un client existant fonctionnent réellement depuis le tableau de bord (P1-7) — la moitié manquante du CRUD annoncée dans l'audit initial est comblée.
- **Le défaut transversal d'accessibilité clavier est corrigé** : les 9 modales concernées (nouveau rendez-vous, zones, tournées, prestations, blocage de créneau, rappels, disponibilités, et maintenant aussi client/animal) sont utilisables au clavier (P0-3).
- **La faille de session est corrigée** : plus de boucle de redirection infinie (P0-1).
- **Le contraste insuffisant de la couleur de marque, présent sur la quasi-totalité des pages, est corrigé** (P1-4) — c'était la seconde cause majeure du score d'accessibilité initial, avec le défaut clavier ci-dessus.

**Ce qui reste inchangé, volontairement** : Rappels (envoi toujours simulé) et Statistiques (toujours 100 % de données fictives) n'ont pas été touchés — ce sont des décisions produit (P2-23/P2-24 dans le tableau des problèmes), pas des corrections de bug, et restent hors du périmètre P0/P1 de cette phase. Le reste du texte atténué sous le seuil de contraste (P2-12), les débordements horizontaux ponctuels (P2-11) et la couverture de tests (toujours partielle, P2-30 dans FIX_PLAN.md) n'ont pas non plus été traités à ce stade.

68 % reflète : le cœur du produit (RDV, agenda, prestations, notifications, tournées, clients) est maintenant réellement fonctionnel de bout en bout, avec de vraies protections serveur et une accessibilité clavier/contraste largement remise à niveau. Il reste deux zones assumées comme non finies (Rappels, Statistiques) et une couverture de tests encore limitée avant de considérer le produit prêt pour une mise en production sans réserve.

---

# Problèmes P0 (bloquants)

## P0-1 — Boucle de redirection infinie après invalidation de session

- **Catégorie** : Sécurité / Auth
- **Page** : toutes les pages `/dashboard/*`
- **Composant** : `src/proxy.ts` + `src/lib/auth/dal.ts`
- **Description** : `proxy.ts` fait un contrôle optimiste (signature JWT valide + présence d'un `userId`) pour décider s'il laisse passer vers `/dashboard` ou renvoie vers `/login`. `dal.ts` (`getCurrentUser()`) fait le contrôle réel en base (compte actif, session émise après le dernier changement de mot de passe) et redirige vers `/login` en cas d'échec — **sans jamais supprimer le cookie**. Si un jeton est cryptographiquement valide mais invalidé côté base (mot de passe changé ailleurs, compte désactivé), `/login` le considère valide (renvoie vers `/dashboard`) pendant que le layout du dashboard le considère invalide (renvoie vers `/login`) : les deux redirections s'annulent indéfiniment.
- **Étapes pour reproduire** :
  1. Se connecter normalement (`praticien-test@pf-osteo-animale.fr`).
  2. En base, exécuter `UPDATE "User" SET "passwordChangedAt" = NOW() WHERE email = '...'` (simule un changement de mot de passe ailleurs).
  3. Dans le même navigateur, encore connecté, naviguer vers `/dashboard`.
- **Résultat actuel** : boucle `/dashboard → /login → /dashboard → ...` jusqu'à `ERR_TOO_MANY_REDIRECTS`. Confirmé reproductible dans deux contextes navigateur indépendants avec le même cookie — ce n'est pas un artefact d'un seul onglet.
- **Résultat attendu** : redirection propre et unique vers `/login`, avec le cookie de session supprimé.
- **Impact utilisateur** : blocage total et sans recours (hors suppression manuelle des cookies) pour tout utilisateur dont le mot de passe est changé/réinitialisé pendant qu'une session reste ouverte ailleurs — et très probablement pour un compte désactivé par un admin pendant qu'il est connecté (même mécanisme, non vérifié séparément).
- **Priorité** : P0
- **Complexité** : Faible — le correctif consiste à faire supprimer le cookie par `dal.ts` avant sa redirection, comme le fait déjà `proxy.ts` dans un autre cas.
- **Correction recommandée** : dans `getCurrentUser()` (ou l'appelant `requireUser()`), supprimer le cookie de session avant `redirect("/login")`.
- **Statut** : 🟢 Corrigé et testé — un Server Component ne pouvant pas supprimer de cookie directement, `requireUser()` (`src/lib/auth/dal.ts`) redirige désormais vers `/login?sessionExpired=1` quand un jeton cryptographiquement valide est rejeté par le contrôle base ; `src/proxy.ts` reconnaît ce paramètre, supprime le cookie et laisse la page de connexion s'afficher au lieu de faire confiance au contrôle optimiste. Revérifié en reproduisant exactement le scénario de l'audit (changement de `passwordChangedAt` en base pendant une session ouverte) : la navigation se résout proprement vers `/login`, le cookie est bien supprimé, une navigation suivante reste normale (pas de boucle), et une reconnexion fonctionne immédiatement après. Connexion normale et test E2E `appointment-overlap.spec.ts` (qui dépend de la connexion) revérifiés sans régression.

## P0-2 — Tournées : aucune sauvegarde réelle, perte silencieuse de toutes les données

- **Catégorie** : Fonctionnel
- **Page** : `/dashboard/tournees`
- **Composant** : `src/components/tours/tours-view.tsx`
- **Description** : la création, modification, activation/désactivation d'une tournée ne fait **aucun appel serveur** — tout est stocké dans un `useState` local. Le formulaire, la validation, le toast de succès et la mise à jour de la liste sont entièrement convaincants, mais rien n'est jamais écrit en base.
- **Étapes pour reproduire** : `/dashboard/tournees` → « + Créer une tournée » → remplir et valider → la tournée apparaît, on peut la désactiver → recharger la page.
- **Résultat actuel** : la tournée créée a totalement disparu ; vérification en base : seules les 3 tournées de départ (seed) existent, rien n'a jamais été écrit.
- **Résultat attendu** : la tournée doit être persistée en base et survivre à un rechargement, comme toute autre fonctionnalité du logiciel (prestations, rendez-vous, clients).
- **Impact utilisateur** : un praticien configurant ses tournées hebdomadaires de visites à domicile croit avoir sauvegardé son travail et le perd intégralement à la prochaine visite, sans aucun avertissement.
- **Priorité** : P0
- **Complexité** : Moyenne — nécessite de créer les server actions manquantes (`createTourAction`, `updateTourAction`, `toggleTourStatusAction`, et l'équivalent pour les zones) sur le modèle de `services-actions.ts`, puis de les brancher à `tours-view.tsx` à la place des `setState` locaux.
- **Correction recommandée** : implémenter les server actions pour `Tour`/`Zone`, avec revalidation de route, en suivant le patron déjà établi ailleurs dans le code (ex. `saveServiceAction`).
- **Statut** : 🟢 Corrigé et testé — nouveau fichier `src/lib/tours-actions.ts` (`saveTourAction`, `toggleTourStatusAction`, `saveZoneAction`, `deleteZoneAction`), gaté par la permission `MANAGE_PUBLIC_SETTINGS` (cohérent avec Prestations/Profil), branché sur `tours-view.tsx` (page `/dashboard/tournees`) et `tours-settings-tab.tsx` (onglet Tournées de `/dashboard/parametres` — qui n'avait lui non plus aucune sauvegarde réelle). Testé en conditions réelles : création/édition/activation-désactivation d'une tournée confirmées persistées en base et survivant à un rechargement sur les deux surfaces ; création d'une zone persistée ; suppression d'une zone utilisée par une tournée correctement rejetée côté serveur (contrainte de clé étrangère). Le test E2E existant (`notifications-toasts.spec.ts`) qui utilisait la création/suppression de zone comme prétexte pour tester le système de toasts a dû être mis à jour (la zone est désormais réellement écrite en base, l'action requiert la permission) — corrigé et revérifié, 4/4 tests passent. Aucune régression sur les autres specs E2E.

## P0-3 — 9 des 12 fenêtres modales du tableau de bord sont inutilisables au clavier

- **Catégorie** : Accessibilité
- **Page** : transversal — nouveau rendez-vous, gestion des rendez-vous, zones, tournées, édition d'animal, prestations, blocage de créneau, rappels, programmation de rappel, disponibilités
- **Composant** : `global-appointments-manager.tsx`, `zone-modal.tsx`, `tour-modal.tsx`, `animal-edit-modal.tsx`, `service-modal.tsx`, `blocked-slot-modal.tsx`, `reminder-modal.tsx`, `reminder-schedule-modal.tsx`, `dashboard-availability-controls.tsx`
- **Description** : à l'ouverture, le focus ne se déplace pas dans la modale ; `Tab` fait immédiatement sortir le focus vers le contenu de la page derrière l'overlay (aucun piège de focus) ; `Échap` ne ferme rien. Seuls 3 composants sur 12 (`birth-date-picker.tsx`, `agenda-event-popover.tsx`, `blocked-slot-popover.tsx`) gèrent correctement le focus/Échap.
- **Étapes pour reproduire** : `/dashboard/agenda` → activer « Nouveau rendez-vous » (clavier ou souris) → appuyer sur `Tab`.
- **Résultat actuel** : le focus part sur un filtre de la page en arrière-plan (« Tous »), jamais sur les champs du formulaire (Client, Animal, Prestation, Date, Heure...).
- **Résultat attendu** : le focus doit entrer dans la modale à l'ouverture, y rester piégé tant qu'elle est ouverte, et revenir au déclencheur à la fermeture (via Échap ou sauvegarde) — exactement le comportement déjà bien implémenté sur la cloche de notifications et le calendrier de réservation publique, qui peuvent servir de modèle.
- **Impact utilisateur** : un utilisateur clavier seul (ou lecteur d'écran) ne peut tout simplement pas créer/modifier un rendez-vous, une zone, une tournée, une prestation, un blocage de créneau ou un rappel — c'est-à-dire la quasi-totalité des actions de gestion du praticien.
- **Priorité** : P0
- **Complexité** : Moyenne — un seul hook de piège de focus réutilisable (focus au montage, retour au déclencheur, `Tab` cyclique, `Échap`) à appliquer aux 9 composants.
- **Correction recommandée** : extraire la logique déjà correcte de `notifications-bell.tsx` (ou du calendrier de réservation) en un hook partagé `useModalFocusTrap`, l'appliquer aux 9 modales listées.
- **Statut** : 🟢 Corrigé et testé — nouveau hook partagé `src/components/ui/use-modal-focus-trap.ts` (focus initial dans la modale, `Tab`/`Shift+Tab` cycliques à l'intérieur, `Échap` ferme, focus rendu au déclencheur à la fermeture), appliqué aux 9 composants listés. Cas particulier : `GlobalAppointmentsManager` est monté une seule fois par le layout et ouvre/ferme via un état interne plutôt que d'être démonté/remonté — le hook accepte un paramètre `active` pour ce cas. Revérifié en reproduisant exactement le scénario de l'audit (ouverture de « Nouveau rendez-vous » au clavier) : le focus entre bien dans la modale, reste piégé sur 40 `Tab` et 10 `Shift+Tab` consécutifs sans jamais s'en échapper, une saisie réelle dans un champ fonctionne, et `Échap` ferme la modale en rendant le focus exact au bouton déclencheur. Revérifié individuellement sur la modale de prestation et celle de disponibilité manuelle (même comportement). Aucune régression sur les 3 modales déjà correctes (non touchées) ni sur la cloche de notifications. `tsc`, `lint` et le build de production passent sans erreur ; suite E2E existante revérifiée sans régression (un test préexistant du calendrier de réservation publique échoue de façon non liée — dérive de date : la fenêtre de disponibilité de démonstration ne propose plus qu'une seule date sélectionnable au moment du test, alors qu'il en attend deux ; ce fichier de test ne touche à aucune des 9 modales corrigées ici).

---

# Problèmes P1 (majeurs)

## P1-4 — Contraste insuffisant sur la couleur principale de la marque (texte et boutons), sur tout le site

- **Catégorie** : Accessibilité / UI
- **Page** : transversal
- **Composant** : token de couleur `--color-animeo` (teal `#4FAF9F`/`#59b9aa`)
- **Description** (mesuré automatiquement, axe-core) : le teal utilisé comme texte sur fond clair a un ratio de 2,2–2,63:1 (minimum requis 4,5:1) — sous-titre praticien, en-tête « Espace professionnel » sur chaque page. Le texte blanc sur fond teal (bouton principal, item de navigation actif) a un ratio de 2,34:1. C'est la couleur de quasiment tous les appels à l'action du site.
- **Résultat actuel** : 1 règle `color-contrast` violée avec 7 à 49 nœuds selon la page scannée.
- **Résultat attendu** : ratio ≥ 4,5:1 (WCAG 1.4.3, niveau AA).
- **Impact utilisateur** : lisibilité réduite pour tout utilisateur malvoyant ou en conditions de luminosité difficiles, sur l'élément le plus important de chaque écran (le bouton d'action principal).
- **Priorité** : P1
- **Complexité** : Faible — assombrir légèrement le token `--color-animeo` utilisé en texte/fond-de-bouton résout la majorité des occurrences en un seul changement centralisé.
- **Correction recommandée** : ajuster le token vers une teinte plus foncée (~`#3a8f80`) et revérifier avec axe-core.
- **Statut** : 🟢 Corrigé et testé — trois sources distinctes du même teal clair identifiées et corrigées vers `#2F7A6E` (même teinte, déjà présente dans la palette comme `secondaryColor`, jamais utilisée ailleurs — ~5,1:1 dans les deux sens) : (1) `src/data/dashboard-theme.ts` (`lightThemePreset`/`darkThemePreset`, la valeur réellement injectée par `DashboardThemeProvider` — le token `:root` de `globals.css` s'est avéré systématiquement écrasé et non pertinent pour le tableau de bord) ; (2) `src/lib/business-profile-actions.ts` (`DEFAULT_PROFILE.publicColor`, utilisé en style inline sur la page de réservation publique, indépendant de tout token CSS) — la ligne en base déjà seedée pour « Pauline Faucillon » a aussi été mise à jour, un changement de code seul n'aurait pas affecté ce qui est réellement affiché ; (3) `src/data/settings.ts` pour cohérence. Revérifié avec axe-core (même outil que l'audit initial) sur les 4 pages où le problème avait été mesuré : les 6 à 49 violations liées à ce teal ont toutes disparu sur chacune, ne laissant que le problème distinct et déjà classé P2 (texte atténué `#6b7780`, non traité dans ce lot). Vérifié visuellement (aucune régression de lisibilité ni de cohérence de marque). Aucune régression sur les tests E2E des toasts et de la cloche de notifications.

## P1-5 — Le sélecteur de date de naissance piège le focus clavier (ouverture au simple `Tab`)

- **Catégorie** : Accessibilité
- **Page** : réservation publique, étape « Vous & votre animal »
- **Composant** : `src/components/booking/birth-date-picker.tsx`
- **Description** : le champ (facultatif) a `onFocus={openPicker}` — le simple fait d'y arriver au clavier ouvre un calendrier complet (jusqu'à 31 boutons de jour + navigation mois/année), qui devient tous des arrêts `Tab`. Mesuré : 38 pressions `Tab` supplémentaires pour dépasser ce seul champ facultatif.
- **Résultat actuel** : viole WCAG 3.2.1 (« On Focus » — recevoir le focus ne doit pas déclencher un changement de contexte).
- **Résultat attendu** : le calendrier ne doit s'ouvrir qu'sur une action explicite (clic/Entrée sur le bouton « Ouvrir le calendrier »), jamais sur simple focus.
- **Impact utilisateur** : rend le parcours clavier de cette étape très pénible (mais pas bloquant — le parcours reste complétable).
- **Priorité** : P1
- **Complexité** : Faible — remplacer `onFocus` par un déclenchement explicite au clic/Entrée sur le bouton dédié.
- **Statut** : 🟢 Corrigé et testé — suppression de `onFocus={openPicker}` sur le champ de saisie ; le calendrier ne s'ouvre plus que sur clic/Entrée du bouton dédié « Ouvrir le calendrier ». Revérifié : le focus seul n'ouvre plus le calendrier, la saisie directe au clavier fonctionne toujours (« 15012020 » → « 15/01/2020 »), le bouton dédié ouvre toujours le calendrier correctement. Nombre de `Tab` pour dépasser ce champ facultatif mesuré à nouveau : 2 (contre ~38 avant correction). Aucune régression sur les tests E2E de la réservation publique.

## P1-6 — Les boutons flottants recouvrent du contenu réel sur mobile

- **Catégorie** : Responsive
- **Page** : `/dashboard`, `/dashboard/agenda`, `/dashboard/carte` (probablement aussi `/tournees`, `/rappels`)
- **Composant** : `src/components/dashboard/dashboard-floating-actions.tsx`
- **Description** : à 390px et 320px, les deux boutons circulaires fixes (bas-droite) recouvrent du texte de carte dès le chargement, sans qu'aucun défilement ne soit nécessaire.
- **Résultat actuel** : sur l'agenda, ils recouvrent le texte « Acceptez, décalez ou refusez... » ; sur le tableau de bord, ils recouvrent en partie le chiffre « 23 » de la carte « Nouveaux clients ».
- **Résultat attendu** : aucun contenu de page ne doit être masqué par les boutons flottants ; les taps dans cette zone ne doivent pas être perdus.
- **Impact utilisateur** : texte illisible et zone morte au toucher sur mobile, la plateforme la plus probable pour un praticien en déplacement.
- **Priorité** : P1
- **Complexité** : Faible — ajouter un `padding-bottom` égal à l'empreinte des boutons sur mobile.
- **Statut** : 🟢 Corrigé et testé — correction différente de celle initialement suggérée : un `padding-bottom` sur `<main>` n'apporte rien ici, car le contenu qui chevauche (ex. « Demandes de rendez-vous ») n'est pas en fin de page mais au milieu d'une longue page défilante — un padding en fin de conteneur ne déplace pas le contenu situé avant lui (vérifié empiriquement avant de choisir la correction). Cause réelle : l'empreinte verticale du cluster de boutons (~152px, empilés en colonne) est trop grande pour un écran étroit. Correction : empilement horizontal (au lieu de vertical) sous `sm`, boutons réduits de 56px à 48px (au-dessus du minimum tactile de 44px) ; la disposition verticale à 64px est conservée à partir de `sm`, où le problème n'a pas été constaté. Résultat mesuré à 390px et 320px sur les 3 pages : le chevauchement est fortement réduit (une seule ligne de texte partiellement affectée au lieu de plusieurs, aucune fonctionnalité perdue) mais pas nécessairement nul dans l'absolu — une élimination à 100 % nécessiterait de retirer ou de rendre contextuel ce cluster sur mobile, ce qui dépasse le périmètre de cette correction et risquerait de retirer un accès rapide à des actions non dupliquées sur toutes les pages. Aucun débordement horizontal introduit, tests E2E de la cloche de notifications revérifiés sans régression.

## P1-7 — Impossible de créer ou modifier un client, ou d'ajouter un animal, depuis le tableau de bord

- **Catégorie** : Fonctionnel (fonctionnalité manquante, pas un plantage)
- **Page** : `/dashboard/clients`, `/dashboard/clients/[id]`
- **Composant** : `clients-list.tsx` (ligne 75), `client-profile.tsx` (lignes 148-149)
- **Description** : les boutons « + Nouveau client », « Modifier » (fiche client) et « Ajouter un animal » sont des stubs (`showStubFeedback(...)` / `notify.info(...)`) — ils affichent un message « sera ajouté ici » et ne font rien. `prisma.client.create()` n'est appelé qu'à un seul endroit dans tout le code (`appointments-actions.ts`, comme effet de bord de la création d'un rendez-vous avec un nom non reconnu) — il n'existe aucune action de création/modification de client dédiée. L'édition d'un animal existant, elle, fonctionne réellement (`updateAnimalAction`).
- **Résultat attendu** : un praticien doit pouvoir créer une fiche client (ex. pour un client qui appelle par téléphone), corriger une coordonnée erronée, ou ajouter un second animal à un client existant, directement depuis le tableau de bord.
- **Impact utilisateur** : élevé — c'est un des quatre piliers annoncés du produit (« clients », « animaux ») et il manque la moitié de son CRUD.
- **Priorité** : P1
- **Complexité** : Moyenne — créer `createClientAction`/`updateClientAction`/`createAnimalAction`, remplacer les 3 stubs par de vrais formulaires (le modal `animal-edit-modal.tsx` existant peut probablement être adapté/dupliqué pour l'ajout).
- **Statut** : 🟢 Corrigé et testé — trois nouvelles server actions (`createClientAction`, `updateClientAction`, `createAnimalAction` dans `src/lib/clients-actions.ts`, `mapClient`/`mapAnimal`/`clientInclude` exportés depuis `src/lib/clients.ts` pour réutiliser exactement la même mise en forme que les lectures existantes) ; nouveau composant `client-edit-modal.tsx` (création et édition, même modale) ; `animal-edit-modal.tsx` adapté pour accepter un animal optionnel (absent = création, nécessite alors `clientId`) plutôt qu'un second composant dupliqué. Les trois stubs sont remplacés dans `clients-list.tsx` et `client-profile.tsx`. Testé en conditions réelles de bout en bout : création d'un client (avec validation du prénom/nom obligatoires), persistance confirmée en base et après rechargement ; modification du téléphone d'un client existant, persistée et survivant au rechargement ; ajout d'un animal à un client (avatar/pictogramme généré automatiquement comme pour un animal créé via la réservation publique), persisté et survivant au rechargement. Vérifié aussi : l'édition d'un animal déjà existant (fonctionnalité préexistante, non stub) continue de fonctionner sans régression après l'ajout du mode création au même composant. Testé sur mobile (375px, formulaire lisible, pas de débordement). Données de test nettoyées après vérification. Aucune régression sur `tsc`, `lint`, le build de production, ni sur la suite E2E (hors un échec préexistant et déjà documenté, sans rapport, dû à la dérive de la fenêtre de disponibilité de démonstration au fil du temps réel).

## P1-8 — Prestations : l'interface ne cache pas les contrôles pour les rôles non autorisés

- **Catégorie** : UX / Permissions
- **Page** : `/dashboard/prestations`
- **Composant** : `services-view.tsx`, `service-modal.tsx`
- **Description** : contrairement à `/dashboard/parametres` (bandeau d'avertissement affiché d'emblée) et à `/dashboard/statistiques`/`/dashboard/admin` (lien de navigation masqué, page redirigée), cette page ne vérifie la permission nulle part dans son arbre de composants. Un utilisateur sans la permission `MANAGE_PUBLIC_SETTINGS` peut remplir tout le formulaire d'édition avant d'apprendre, via un toast après soumission, qu'il n'a pas le droit.
- **Résultat actuel** : le serveur rejette bien l'action (`saveServiceAction`/`deleteServiceAction` revérifient la permission — aucune faille de sécurité), mais l'expérience est trompeuse.
- **Résultat attendu** : masquer/désactiver les contrôles d'édition en amont, comme le fait déjà l'onglet Prestations de `/dashboard/parametres`.
- **Priorité** : P1
- **Complexité** : Faible — appliquer le même patron `canEdit={hasPermission(...)}` déjà utilisé ailleurs.
- **Statut** : 🟢 Corrigé et testé — `services-view.tsx` calcule `canManagePublicSettings` via `useCurrentUser()`/`hasPermission()` et le transmet à `ServicesSettingsTab` (nouveau prop `canEdit`, défaut `true`) ainsi qu'au toggle « Frais kilométriques » (le composant `Toggle` partagé gagne un nouveau prop `disabled`, sans effet sur ses autres usages). Sans la permission : bandeau d'avertissement identique à celui de `/dashboard/parametres`, bouton « + Nouvelle prestation » masqué, tous les contrôles d'édition/désactivation/suppression visuellement grisés et réellement inertes (`&lt;fieldset disabled&gt;`). Revérifié dans les deux états avec le compte de test (permission retirée puis accordée temporairement) : comportement correct dans les deux cas, aucune régression sur le chemin autorisé.

## P1-9 — Le widget « Demandes de rendez-vous » de l'agenda induit en erreur sur les demandes en attente

- **Catégorie** : UX
- **Page** : `/dashboard/agenda`
- **Composant** : widget « Demandes de rendez-vous » en haut de l'agenda
- **Description** : le widget est silencieusement limité à la semaine actuellement affichée, mais son texte (« ✓ Toutes les demandes ont été traitées ») est formulé comme une affirmation globale et définitive. Avec 2 demandes réellement en attente la semaine suivante, le widget affiche « 0 en attente » alors que la carte KPI du tableau de bord et le panneau global des rendez-vous affichent correctement 2.
- **Résultat attendu** : soit le widget doit être global (aligné sur le KPI), soit son texte doit préciser la portée (« Aucune demande cette semaine »).
- **Impact utilisateur** : un praticien qui ne consulte que la semaine en cours peut croire à tort qu'aucune demande client n'attend de réponse.
- **Priorité** : P1
- **Complexité** : Faible (changement de texte) à moyenne (rendre le widget global).
- **Statut** : 🟢 Corrigé et testé — le widget reste volontairement scopé à la période affichée (cohérent avec le reste de la page, qui est elle-même navigable par semaine/jour), mais le message d'état vide est désormais honnête sur cette portée : `AgendaView` calcule un total global des demandes en attente (déjà disponible sans requête supplémentaire, via `useAppointments()`) et `PendingRequestsPanel` distingue « ✓ Toutes les demandes ont été traitées » (vrai globalement) de « Aucune demande pour cette période. N demande(s) en attente sur une autre période. » (des demandes existent ailleurs). Revérifié en reproduisant exactement le scénario de l'audit (2 demandes réellement en attente hors de la semaine affichée) : le message scopé honnête s'affiche, plus aucune fausse affirmation de complétude. Aucune régression sur le test E2E de chevauchement de créneaux (même page).

## P1-10 — Un clic direct sur l'en-tête d'une section « Adresse » du formulaire de réservation peut ne pas l'ouvrir

- **Catégorie** : Fonctionnel
- **Page** : réservation publique, étape « Vous & votre animal »
- **Composant** : `src/components/booking/details-step.tsx`
- **Description** : cliquer sur l'en-tête de la section accordéon « Adresse » juste après avoir rempli la section « Coordonnées » peut laisser `aria-expanded="false"` et le panneau à `height:0px` — l'en-tête suivant (« Votre animal ») se retrouve visuellement à l'endroit où l'utilisateur clique, et la saisie part dans le mauvais champ. Le chemin fiable (cliquer sur « Continuer », qui saute automatiquement vers la première section en erreur) fonctionne correctement à chaque test.
- **Résultat attendu** : cliquer sur n'importe quel en-tête d'accordéon doit systématiquement l'ouvrir, quel que soit le moment.
- **Impact utilisateur** : un client qui a l'habitude d'utiliser des accordéons pourrait cliquer directement sur les en-têtes plutôt que d'utiliser « Continuer », et se retrouver bloqué à saisir son adresse dans le vide sans comprendre pourquoi.
- **Priorité** : P1
- **Complexité** : Moyenne — probable condition de course entre la validation différée (blur) du dernier champ de la section précédente et le clic sur l'en-tête suivant ; nécessite investigation du timing des effets dans `details-step.tsx`.
- **Statut** : 🟢 Corrigé et testé — cause réelle identifiée : `toggleGroup` inversait l'état (« ouvert → fermé ») sur simple clic de l'en-tête déjà ouvert. Or cliquer sur l'en-tête « Adresse » déclenche d'abord (au `mousedown`, avant le `click`) le `blur` du dernier champ de « Coordonnées », qui appelle `advanceFrom("contact")` et ouvre déjà « Adresse » — le `click` qui suit voyait alors une section déjà ouverte et la refermait aussitôt. Correction : `toggleGroup` ouvre désormais systématiquement la section cliquée sans jamais la refermer par un second clic sur son propre en-tête (une bascule vers une autre section reste le seul moyen d'en fermer une). Revérifié en reproduisant exactement le scénario de l'audit (clic sur l'en-tête « Adresse » juste après avoir rempli « Coordonnées ») : la section s'ouvre et le reste, le champ devient réellement saisissable. Revérifié aussi le parcours complet du formulaire exclusivement via les clics d'en-tête (au lieu de « Continuer ») jusqu'à activation du bouton final, et le fait de recliquer sur une section déjà ouverte ne la ferme plus (comportement désormais sans surprise). Aucune régression sur les tests E2E de l'autocomplétion d'adresse.

---

# Problèmes P2 (importants mais contournables)

| ID | Titre | Page/Composant | Priorité | Complexité |
|---|---|---|---|---|
| P2-11 | ⚪ Vérifié, ne se reproduit pas — voir note détaillée après ce tableau. `document.documentElement.scrollWidth` dépasse la largeur de viewport à 1280px/768px, mais il ne s'agit pas d'un débordement visuel réel | Clients, Agenda | — | — |
| P2-12 | 🟢 Corrigé et testé — voir note détaillée après ce tableau | Transversal | — | — |
| P2-13 | 🟢 Corrigé et testé — `aria-label="Rechercher un client, un animal"` + `role="search"` sur le formulaire (`dashboard-top-bar.tsx`). Vérifié : axe-core (`label`/`aria-input-field-name`) 0 violation, lecteur d'accessibilité expose le nom, recherche fonctionnelle (saisie → Entrée → navigation `?q=`) inchangée | `DashboardTopBar` | — | — |
| P2-14 | Rôle Secrétariat non testé en direct (2FA email non accessible pendant l'audit) — vérification uniquement par lecture de code | Sécurité | P2 | — |
| P2-15 | 🟢 Corrigé et testé — voir note détaillée après ce tableau | `appointments-actions.ts` | — | — |
| P2-16 | 🟢 Corrigé et testé — voir note détaillée après ce tableau | `Appointment.clientName` | — | — |
| P2-17 | ⚪ Vérifié, ne se reproduit pas — voir note détaillée après ce tableau | `week-planner.tsx` | — | — |
| P2-18 | 🟢 Corrigé et testé — voir note détaillée après ce tableau | `RevenueChart` | — | — |
| P2-19 | 🟢 Corrigé et testé — voir note détaillée après ce tableau | `updateAvailabilityAction` | — | — |
| P2-20 | 🟢 Corrigé et testé — voir note détaillée après ce tableau | `availability-settings-tab.tsx` | — | — |
| P2-21 | 🟢 Corrigé et testé — voir note détaillée après ce tableau | `submitPublicBookingAction` | — | — |
| P2-22 | 🟢 Corrigé et testé — voir note détaillée après ce tableau | `data/public-booking.ts` | — | — |
| P2-23 | L'action « Envoyer » des rappels est entièrement simulée — aucun email/SMS réel n'est envoyé (label honnête « simulation locale », contrairement aux Tournées) | `reminders-view.tsx` | P2 | Forte |
| P2-24 | `/dashboard/statistiques` est 100 % données fictives, derrière une permission réelle (`VIEW_FINANCES`) qui laisse penser à des chiffres fiables | `stats-view.tsx` | P2 | Forte |
| P2-25 | La table `TourAppointment` n'a aucun chemin d'écriture applicatif — seul le script de seed peut la peupler | `src/lib/tours.ts` | P2 | Moyenne |
| P2-26 | 🟢 Corrigé et testé — voir note détaillée après ce tableau | `src/lib/rate-limit.ts` etc. | — | — |
| P2-27 | ⚪ Faux positif, vérifié — `AUTH_EMAIL`/`AUTH_PASSWORD_HASH_BASE64` sont bien référencées et fonctionnelles (voir note détaillée), rien retiré | `.env.local.example` | — | — |
| P2-28 | 🟢 Corrigé et testé — `feature-placeholder.tsx` confirmé orphelin (0 importeur) puis supprimé | Code mort | — | — |
| P2-29 | 🟢 Corrigé et testé — voir note détaillée après ce tableau | `src/lib/audit.ts` | — | — |

## P2-26 — Note de correction (2026-08-29, Sprint 3)

Choix retenu (option « nettoyage à la volée » de `FIX_PLAN.md`, plutôt qu'une tâche cron) : cette app n'a pas d'infrastructure de planification externe, et `recordAttempt()` (`rate-limit.ts`) est déjà appelée sur tous les parcours limités en débit (connexion, réinitialisation de mot de passe, 2FA, réservation publique), donc un point d'ancrage naturel pour une purge opportuniste sans nouvelle dépendance.

`maybePurgeExpiredSecurityRecords()` : purge `RateLimitEvent` de plus de 24h (largement au-delà de la plus longue fenêtre de débit réellement utilisée dans l'app, 1h) et `TwoFactorCode`/`PasswordResetToken` expirés (`expiresAt` dépassé), avec une probabilité de déclenchement de 2% à chaque appel de `recordAttempt()` — pour ne pas ajouter trois suppressions à chaque requête limitée en débit. Best-effort (`try/catch`) : un échec de purge ne fait jamais échouer l'action de connexion/réservation en cours.

Vérifié en conditions réelles (probabilité temporairement forcée à 100% pour un test déterministe, restaurée à 2% après) : trois enregistrements périmés insérés (un `RateLimitEvent` de 48h, un `TwoFactorCode` et un `PasswordResetToken` expirés depuis 1h) → une vraie connexion déclenche `recordAttempt()` → les trois sont bien purgés (confirmé par requête directe). Propriété de sécurité vérifiée séparément : trois enregistrements **valides** (non expirés) insérés → une nouvelle connexion réelle → les trois **survivent** intacts, confirmant que la purge ne touche jamais une donnée encore active. Toutes les données de test nettoyées après vérification. `npx tsc --noEmit`, `npm run lint`, `npm run test:unit` (52/52) verts.

## P2-29 — Note de correction (2026-08-29, Sprint 3)

`logAudit()` (`src/lib/audit.ts`) lit désormais l'adresse IP (`x-forwarded-for` via `headers()` de `next/headers`) une seule fois, en interne, plutôt que d'exiger que chacun des ~15 sites d'appel la passe explicitement. Tous les appelants confirmés request-scoped (Server Actions et Server Components) via `grep`, donc `headers()` y est toujours valide.

Vérifié en conditions réelles (pas seulement en lecture de code) : connexion réelle effectuée, requête SQL directe sur les 5 entrées `AuditLog` les plus récentes juste après — la nouvelle entrée `LOGIN_SUCCEEDED` porte bien `ipAddress: "::1"` (IP locale de développement), tandis que les entrées antérieures à la correction restent à `null` comme avant (aucune modification rétroactive des données existantes, comportement attendu). `npx tsc --noEmit`, `npm run lint`, `npm run test:unit` (52/52) verts.

## P2-27 / P2-28 — Notes (2026-08-29, Sprint 3)

**P2-27 (faux positif)** : l'audit affirmait `AUTH_EMAIL`/`AUTH_PASSWORD_HASH_BASE64` « référencées nulle part ». Vérification directe (`grep` sur tout le projet) avant suppression : ces deux variables sont bien lues dans `prisma/seed.ts` (`seedUsers()`), un mécanisme optionnel de bootstrap d'un compte admin par variables d'environnement au premier seed — et correctement intégré au schéma **actuel** (écrit dans `User.passwordHash`, `role: "ADMIN"`, même modèle que les comptes de test bcrypt juste en dessous dans le même fichier), pas un reliquat d'un ancien schéma d'auth. Rien supprimé de `.env.local.example` : l'auraient fait aurait retiré la documentation d'une variable réellement fonctionnelle. Statut reclassé de 🔴 à ⚪ (vérifié, non fondé) plutôt que 🟢, puisqu'aucune modification n'était justifiée.

**P2-28 (confirmé et corrigé)** : `grep` sur tout le projet confirme 0 importeur de `FeaturePlaceholder`/`feature-placeholder` en dehors du fichier lui-même. Fichier supprimé. `npx tsc --noEmit` et `npm run lint` revérifiés après suppression : aucune référence cassée.

## P2-15 — Note de correction (2026-08-29, Sprint 3)

Même mécanisme que le limiteur déjà en place sur `submitPublicBookingAction` (`isRateLimited`/`recordAttempt`, `rate-limit.ts`), clé par IP uniquement (pas d'email sur cet endpoint). Seuil volontairement large (60 requêtes / 5 minutes) : l'usage légitime appelle cette action plusieurs fois par session de réservation (chargement initial de la fenêtre de 90 jours, revalidation au choix d'une date, revalidation juste avant la soumission) — l'objectif est de freiner un scraping/DoS visible, pas de gêner un vrai visiteur. Au-delà du seuil, l'action lève une erreur plutôt que de renvoyer un résultat vide silencieux : les deux points d'appel (`schedule-step.tsx`, `details-step.tsx`) avaient déjà une gestion d'erreur dégradée existante et bien conçue (créneaux affichés sans certitude + re-vérification obligatoire avant de continuer), donc aucune UI nouvelle n'était nécessaire.

Vérifié en conditions réelles (pas seulement en lecture de code) : chargement normal de la page de réservation → un seul appel enregistré, comportement inchangé ; 60 appels simulés pour la même IP puis un 61ᵉ déclenché en rechargeant la page → l'écran affiche bien l'état dégradé existant (« Impossible de vérifier les créneaux déjà pris... Une dernière vérification aura lieu avant de continuer »), aucune erreur JavaScript non gérée, le calendrier reste utilisable. Données de test nettoyées après vérification. `npx tsc --noEmit`, `npm run lint`, `npm run test:unit` (52/52) verts.

## P2-22 — Note de correction (2026-08-29, Sprint 3)

Reconfirmé : `loadProfessional()` (`app/reserver/[slug]/page.tsx`) partait de `bookingProfessionals[0]` (données de démonstration figées dans `data/public-booking.ts`) et écrasait tous les champs avec les vraies données DB — **sauf `zones`**, jamais réécrit, donc toujours les 3 zones figées avec leurs frais fixes d'origine, indépendamment de ce que le praticien configure réellement dans Tournées.

Nouvelle fonction `getPublicZones()` (`src/lib/tours.ts`) : construit les zones publiques à partir des vraies `Zone`/`City` (`getZones()`), avec `tourDays` dérivé des vraies tournées **actives** associées (`getTours()`) — plutôt qu'un jour figé, indépendant du statut réel de la tournée. Branchée dans `loadProfessional()` et dans `submitPublicBookingAction` (qui utilisait la même donnée figée pour calculer le prix final côté serveur).

**Bug plus profond découvert en vérifiant** (pas seulement l'hypothèse initiale de l'audit) : même une fois les zones réelles branchées, le frais par zone restait faux pour 2 zones sur 3. Cause réelle : `PublicZone.travelFee` portait un **seul frais par zone**, alors que le vrai modèle interne (`ServiceSettings.zoneFees`) permet un frais **différent par prestation** pour la même zone. Le rapprochement se faisait par nom (`zone.name`), mais l'éditeur de frais par zone (`ServiceModal`) proposait une liste de noms **statique et figée** (`serviceZoneNames = ["Rouen", "Le Havre", "Dieppe"]`, `data/settings.ts`) qui ne correspondait déjà plus aux vrais noms de zone (« Zone Rouen Nord », « Zone Le Havre », « Zone Dieppe ») — un service configuré pour facturer « Rouen » ne correspondait donc jamais à la vraie zone « Zone Rouen Nord », le frais retombait silencieusement à 0. Corrigé plus largement que le périmètre initial de P2-22 : `zoneFees` déplacé sur `PublicService` (une carte par prestation), `ServiceModal` reçoit désormais les vrais noms de zone en prop (chaîne complète : page `/dashboard/prestations` → `ServicesView` → `ServicesSettingsTab` → `ServiceModal`, remplaçant l'import de la liste statique), et la donnée déjà configurée en base (`Service.zoneFees` avec les anciennes clés courtes) a été remise à jour vers les vrais noms de zone pour ne pas perdre silencieusement un frais déjà saisi par le praticien. `bookingProfessionals` et `serviceZoneNames` — devenus entièrement morts une fois ces deux branchements faits — supprimés.

Vérifié en conditions réelles de bout en bout (pas seulement en lecture de code) : dans `ServiceModal` réel, passage d'une prestation en mode « Selon la zone » → les 3 champs affichés sont bien « Zone Dieppe », « Zone Le Havre », « Zone Rouen Nord » (les vrais noms, plus les anciens noms statiques) ; frais de 25 € saisi pour « Zone Rouen Nord » et enregistré, confirmé en base. Calcul serveur revérifié avec les données réelles (même logique que `submitPublicBookingAction`) : une adresse à Rouen (code postal 76000) résout bien la vraie zone « Zone Rouen Nord » et calcule un prix total de 95 € (70 € de base + 25 € de frais de zone) — confirmé exact. Test manuel du tunnel de réservation publique jusqu'à l'étape adresse pour confirmer que les vraies prestations/zones s'affichent (le test du calcul de prix final s'appuyant sur l'autocomplétion d'adresse IGN, une API externe, s'est fait par vérification directe du calcul serveur plutôt que via l'autocomplétion en direct, pour ne pas dépendre de sa disponibilité). Donnée de test entièrement nettoyée et prestation modifiée remise à son état d'origine après vérification. `npx tsc --noEmit`, `npm run lint`, `npm run test:unit` (52/52, 2 nouveaux tests couvrant le calcul de frais par service/zone) verts.

## P2-21 — Note de correction (2026-08-29, Sprint 3)

Choix retenu (option « nettoyer si le create échoue juste après » de `FIX_PLAN.md`) plutôt que reporter la création du client après confirmation du créneau — un changement plus large de séquencement, pour un gain équivalent sur un cas déjà rare (fenêtre de course très étroite entre la vérification `hasConflict()` et l'écriture réelle).

`findOrCreateClientAndAnimal()` (`appointments-actions.ts`) renvoie désormais aussi `createdClientId`/`createdAnimalId` — `null` si la fiche existait déjà (retrouvée par email/nom), l'id réel seulement si elle vient d'être créée par cet appel précis. Nouvelle fonction `cleanupOrphanedClientAndAnimal()` appelée dans la branche `isSlotUniqueConstraintError` de `submitPublicBookingAction` (la requête perdante de la course) : supprime uniquement les enregistrements que **cet appel** vient de créer, jamais une fiche préexistante — propriété de sécurité critique, une correction de propreté ne doit jamais risquer de supprimer les données d'un vrai client existant. Nettoyage best-effort (comme `findOrCreateClientAndAnimal` déjà en place) : un échec de suppression ne fait jamais échouer la réponse à l'utilisateur, l'orphelin resterait alors — statu quo d'avant cette correction, pas une régression.

Vérifié directement (pas seulement en lecture de code), en isolant la propriété de sécurité critique de la logique de nettoyage plutôt qu'en tentant de reproduire une vraie course réseau (intrinsèquement dépendante du timing, sans garantie de reproduction fiable même avec deux requêtes concurrentes) : scénario A (client ET animal nouvellement créés, comme un premier visiteur perdant la course) → les deux sont bien supprimés après nettoyage ; scénario B (client **préexistant** retrouvé par email, seul l'animal est nouveau) → seul l'animal est supprimé, **le client existant survit intact** — la propriété de sécurité critique tient. Câblage revérifié par lecture : l'appel de nettoyage est bien placé dans l'unique branche `catch` qui gère la perte de course. `npx tsc --noEmit`, `npm run lint`, `npm run test:unit` (50/50) verts. Donnée de test entièrement nettoyée après vérification.

## P2-20 — Note de correction (2026-08-29, Sprint 3)

Choix retenu (option « implémenter réellement » de `FIX_PLAN.md`) plutôt que retirer le réglage : le libellé existant (« Temps minimum après un rendez-vous à domicile ») décrivait déjà sans ambiguïté la sémantique attendue, rendant l'implémentation directe préférable à une régression de fonctionnalité.

Correction centralisée sur les deux points d'entrée qui décident déjà si un créneau est libre : `hasConflict()` (`appointments-actions.ts`, utilisée par la création/modification interne ET la soumission de réservation publique) et `getOccupiedSlotsAction()` (créneaux occupés affichés au calendrier public et en aperçu). Les deux traitent désormais tout rendez-vous **à domicile** existant comme occupant sa durée réelle **+ le temps de trajet configuré**, avant qu'un autre rendez-vous (cabinet ou domicile) puisse démarrer — le rendez-vous suivant n'a pas besoin d'être lui-même à domicile pour être bloqué, conformément au libellé. Un rendez-vous au cabinet n'ajoute aucun tampon (aucun trajet à prévoir après une consultation sur place). Texte de la carte de réglage mis à jour (« servira plus tard » → description du comportement réel, maintenant actif).

Vérifié en conditions réelles avec de vrais appels aux server actions (pas seulement en lecture de code) : temps de trajet temporairement réglé à 30 minutes, rendez-vous à domicile de test créé 09h30–10h00 ; tentative de création d'un rendez-vous à 10h15 (dans la fenêtre de 30 min) → rejetée avec le message de conflit existant, rien persisté en base (vérifié par requête directe) ; tentative à 10h30 (exactement à la limite du tampon) → acceptée et persistée. Page de réservation publique revérifiée après correction (aucune erreur console, page fonctionnelle). Donnée de test nettoyée et réglage remis à sa valeur d'origine (0 minute) après vérification. `npx tsc --noEmit`, `npm run lint`, `npm run test:unit` (50/50) verts.

## P2-19 — Note de correction (2026-08-29, Sprint 3)

Reconfirmé avant correction : `updateAvailabilityAction` sauvegardait directement, sans jamais consulter la table `Appointment`.

Correction : `findAvailabilityConflicts()` (`business-profile-actions.ts`) charge tous les rendez-vous `CONFIRMED`/`PENDING` à venir et réutilise `fitsWithinOpenHours` (déjà couvert par des tests unitaires, y compris pour un rendez-vous qui chevauche plusieurs heures) pour vérifier chacun contre la **nouvelle** configuration de disponibilités proposée. `updateAvailabilityAction(input, force = false)` : si des conflits existent et `force` n'est pas passé, renvoie la liste des conflits sans rien sauvegarder ; `AvailabilitySettingsTab` (via `settings-view.tsx`) affiche alors une confirmation native listant les rendez-vous concernés (jusqu'à 5, puis un compte) et ne rappelle l'action avec `force: true` que si l'utilisateur confirme explicitement vouloir sauvegarder quand même.

Bug réel trouvé et corrigé pendant la vérification (pas seulement lors de la conception) : la première version comparait `appointment.date` brut (une valeur Prisma `DateTime`) au jour de la semaine via `.getDay()`, qui utilise le fuseau horaire **local du serveur**. Un rendez-vous existant dans les données de démonstration porte un horodatage non normalisé à minuit (`...T22:56:05.600Z`, un artefact de qualité de données du seed) — converti en heure locale du serveur (UTC+2 en été), cet horodatage franchit minuit et retombe sur le jour suivant, un dimanche fermé, provoquant un **faux conflit** sur un rendez-vous du samedi qui n'était pourtant pas concerné par le changement testé. Corrigé en reconstruisant systématiquement une date ancrée à midi heure locale à partir du seul jour calendaire UTC (`parseDateIdToLocalNoon(date.toISOString().slice(0,10))`), indépendante de tout horodatage bruité ou du fuseau du serveur.

Vérifié en conditions réelles avec de vraies boîtes de dialogue `confirm()` interceptées par Playwright (pas seulement en lecture de code) : rendez-vous de test confirmé créé sur un mardi 18h (dans les horaires actuels) ; réduction des horaires du mardi (20h → 17h) via la vraie interface → dialogue listant exactement le rendez-vous concerné, sans le faux positif initialement détecté ; refus du dialogue → disponibilités **non** sauvegardées (revérifié après rechargement) ; acceptation du dialogue → disponibilités sauvegardées avec succès (revérifié après rechargement) ; restauration des horaires d'origine → aucun dialogue (aucun conflit, comportement normal préservé). Donnée de test et permission temporaire nettoyées après vérification. `npx tsc --noEmit`, `npm run lint`, `npm run test:unit` (50/50) verts.

## P2-18 — Note de correction (2026-08-29, Sprint 3)

Cause réelle, différente de l'hypothèse initiale de l'audit (« format de date dépendant de la locale ») : `DashboardActivityChart` calculait sa série de données (dates de la semaine + libellés de jour) directement pendant le rendu via `referenceDate()`, qui lit `new Date()` — l'horloge murale **et le fuseau horaire** de l'environnement d'exécution. Ce composant `"use client"` est malgré tout rendu côté serveur au premier chargement (comportement standard de Next.js) : le rendu SSR utilise le fuseau du serveur, la première passe d'hydratation côté client utilise le fuseau du navigateur de l'utilisateur — quand les deux diffèrent (cas réel en production : serveur en UTC, utilisateur dans un autre fuseau), les dates de la semaine calculées peuvent différer, produisant un vrai mismatch d'hydratation React reproduit dans la console (confirmé lors du balayage de smoke-test du Sprint 2).

Correction : nouveau hook réutilisable `useHasMounted()` (`src/components/ui/use-has-mounted.ts`, `useSyncExternalStore` avec `getServerSnapshot` figé à `false`) garantit que le HTML SSR et la toute première passe client rendent tous deux un graphique vide identique ; le calcul réel de la série (dépendant de `referenceDate()`) n'a lieu qu'une fois `mounted` passé à `true` côté client, dans un `useMemo` pendant le rendu — pas dans un `useEffect`, qui aurait déclenché la règle ESLint stricte de ce projet (`react-hooks/set-state-in-effect`, qui interdit tout `setState` direct dans un effet, même trivial comme `setMounted(true)`).

Vérifié en conditions réelles (pas seulement en lecture de code) : 0 erreur de console liée à l'hydratation sur `/dashboard` après correction (contre l'erreur confirmée avant), les 7 points de données du graphique se peuplent correctement juste après le montage, capture d'écran desktop et mobile sans régression visuelle. `npx tsc --noEmit`, `npm run lint`, `npm run test:unit` (50/50) verts.

## P2-16 — Note de correction (2026-08-29, Sprint 3)

Reconfirmé avant correction : requête SQL directe trouvant 3 rendez-vous liés au client « Loi Duboc » (`clientId` non nul) affichant encore « Loic Duboc », exactement l'exemple cité par l'audit initial.

Décision de stratégie (les deux options étaient proposées par `FIX_PLAN.md`) : resynchroniser à chaque modification plutôt que remplacer par une jointure à l'affichage. Raison structurelle, pas seulement de performance — `clientId`/`animalId` sont **nullables** sur `Appointment` : les rendez-vous « volants » sans fiche client (visibles dans l'agenda, ex. « Client Volant De Passage ») n'ont **aucune** autre source pour leur nom que le champ dénormalisé. Une jointure à l'affichage renverrait `NULL` pour ces rendez-vous précisément — remplacer la dénormalisation aurait cassé une fonctionnalité réelle plutôt que d'en corriger une.

Correction : `updateClientAction` et `updateAnimalAction` (`clients-actions.ts`) enveloppent désormais la mise à jour de la fiche source et un `prisma.appointment.updateMany()` correspondant dans une même transaction (`prisma.$transaction`), pour que les deux écritures réussissent ou échouent ensemble. `revalidatePath("/dashboard/agenda")` et `revalidatePath("/dashboard")` ajoutés aux deux actions (l'agenda affiche aussi ces champs).

Vérifié en conditions réelles, pas seulement par lecture de code : édition du prénom du client « Loi Duboc » → « Loïc Duboc » via la vraie modale (`/dashboard/clients/...`), confirmée par une requête SQL immédiatement après : les 4 rendez-vous liés à ce `clientId` (dont un `CANCELLED`, hors du filtre `status` — `updateMany` n'en exclut aucun) affichent tous désormais « Loïc Duboc ». Balayage de toute la base après correction : 0 désynchronisation restante entre `Appointment` et son `Client`/`Animal` source. `npx tsc --noEmit` et `npm run lint` verts.

**Constat annexe, hors périmètre** : 6 rendez-vous existants ont `clientId` NULL avec un nom « Loic Duboc » sans accent (rendez-vous volants, jamais liés à une fiche) — ce ne sont pas des désynchronisations (il n'y a pas de fiche source dont ils auraient dérivé) mais un signe que le rapprochement automatique client/rendez-vous lors de la réservation publique ne les a pas liés à la fiche existante. Sujet distinct (qualité du rapprochement, pas de la resynchronisation), non traité ici.

## P3-37 — Note de correction (2026-08-29)

Point transversal (« formulaires de création/édition du tableau de bord », au pluriel) : plutôt qu'une correction isolée, un hook réutilisable `useUnsavedChangesWarning(isDirty)` a été créé (`src/components/ui/use-unsaved-changes-warning.ts`, même esprit que `useModalFocusTrap` de P0-3) et appliqué aux 8 formulaires de création/édition du tableau de bord : `appointment-form.tsx`, `blocked-slot-modal.tsx`, `zone-modal.tsx`, `tour-modal.tsx`, `service-modal.tsx`, `reminder-modal.tsx`, `animal-edit-modal.tsx`, `client-edit-modal.tsx`. Chaque formulaire capture un instantané JSON de son brouillon au montage (`useState(() => JSON.stringify(...))` — une lecture directe de `ref.current` pendant le rendu déclenchait la règle ESLint `react-hooks/refs`, d'où le choix d'un état React plutôt qu'une ref) et compare cet instantané à l'état courant pour dériver `isDirty`. Le hook couvre deux cas : `beforeunload` natif du navigateur (fermeture d'onglet/rafraîchissement) et une fonction `confirmDiscard()` à appeler avant toute fermeture pilotée par l'app (bouton « Annuler »/« × », touche Échap).

Cas particulier détecté et traité : `AppointmentForm` est imbriqué dans `GlobalAppointmentsManager`, qui a son **propre** bouton de fermeture (« × » du panneau) et sa propre gestion d'Échap (`useModalFocusTrap`) — un utilisateur en train d'éditer un rendez-vous pouvait donc fermer tout le panneau sans passer par le formulaire, contournant sa protection. Corrigé en remontant l'état `isDirty` au parent via un prop `onDirtyChange`, que `GlobalAppointmentsManager` stocke (`formDirty`) pour garder son propre bouton « × » et son Échap au courant (`confirmDiscardChanges`, une version autonome exportée du même module, pour éviter d'enregistrer un second écouteur `beforeunload` redondant).

Vérifié en conditions réelles avec de vraies boîtes de dialogue `confirm()` interceptées par Playwright (pas seulement en lecture de code) :
- `BlockedSlotModal` : champ « Motif » rempli puis clic sur « Annuler » → boîte de dialogue affichée, modale reste ouverte au refus ; champ vidé (redevenu propre) puis « Annuler » → fermeture immédiate sans boîte de dialogue.
- `AppointmentForm` dans `GlobalAppointmentsManager` : champ client rempli puis touche Échap → boîte de dialogue affichée (prouvant que la remontée d'état au panneau parent fonctionne), modale reste ouverte au refus ; champ vidé puis Échap → fermeture immédiate sans boîte de dialogue.
- Sauvegarde réussie d'un créneau bloqué (avec un vrai texte saisi) : la modale se ferme sans déclencher de boîte de dialogue de confirmation (l'instantané est bien remis à jour après succès), donnée créée confirmée en base puis nettoyée après vérification.
- Suite de tests unitaires (50/50), `npx tsc --noEmit` et `npm run lint` sur l'ensemble du projet : verts.
- Balayage des pages `/dashboard`, `/dashboard/agenda`, `/dashboard/clients`, `/dashboard/tournees`, `/dashboard/prestations`, `/dashboard/rappels` + ouverture d'un échantillon de modales (prestations, tournées, clients) : aucune erreur console nouvelle. La seule erreur trouvée (mismatch d'hydratation sur `RevenueChart`) est le problème P2-18 déjà catalogué, sans rapport avec ce correctif, non traité ici (prévu en Sprint 3).

## P3-33 — Note de correction (2026-08-29)

Reproduit en conditions réelles avant correction (pas seulement en lecture de code) : une tournée de test activée pour aujourd'hui avec un rendez-vous positionné (lat/lng) pour retomber près du libellé de ville « Le Havre » sur `SimulatedMap`. Cause réelle : `SimulatedMap` affiche 4 noms de ville à des positions en `%` fixes, indépendantes de la hauteur réelle du conteneur ; sur la mini-carte du tableau de bord (`dashboard-next-tour.tsx`, `heightClassName="h-40"`, 160px), l'espace vertical est bien plus compressé que sur la carte complète de la page Tournées (520px), donc une puce de rendez-vous positionnée près d'un libellé le recouvre visuellement (capture d'écran à l'appui : « Le Havre » apparaissait tronqué en « HAVRE », « Montivilliers » coupé en haut du cadre).

Correction volontairement ciblée : ajout d'un prop `showLabels` (par défaut `true`, rétrocompatible) à `SimulatedMap` ; désactivé uniquement sur l'usage compact du tableau de bord (`showLabels={false}`), inchangé sur la carte complète de `tour-detail.tsx`. Un évitement de collision générique entre puces et libellés aurait été disproportionné pour une carte déjà explicitement annoncée comme simulée (bandeau « Carte simulée · aucune donnée Mapbox ») ; les numéros des puces + l'infobulle au survol (`title`) restent suffisants à cette échelle, et le nom de la zone / les stats du jour sont déjà affichés en texte au-dessus de la carte.

Vérifié : capture d'écran après correction — 0 libellé de ville détecté sur la mini-carte (donc 0 chevauchement possible), tandis que la carte complète de la page Tournées continue d'afficher ses libellés normalement (non régressée). Donnée de test (tournée activée, rendez-vous positionné) entièrement nettoyée et tournée remise à son état d'origine (`INACTIVE`, `dateId` NULL) après vérification.

## P3-34 / P3-35 / P3-36 — Notes de correction (2026-08-29)

**P3-34** : `appointment-form.tsx`, le texte du bouton de soumission dépendait uniquement de `pending`, jamais de la présence d'un `appointment` existant. Corrigé : `appointment ? "Enregistrer les modifications" : "Créer le rendez-vous"`. Vérifié en ouvrant le formulaire de création (bouton affichait bien « Créer le rendez-vous », capturé directement dans la sortie d'un test Playwright).

**P3-35** : cause réelle trouvée dans `blocked-slot-modal.tsx` — le libellé de durée calculait `${option / 60}h...` sans arrondi ; pour l'option 90 (minutes), `90 / 60` vaut `1.5` en JavaScript (division non entière), produisant `1.5h30` au lieu de `1h30`. Corrigé avec `Math.floor(option / 60)`. Vérifié : les 5 options du menu déroulant affichent désormais `30 min, 1h, 1h30, 2h, 3h`.

**P3-36** : `CalendarEventCard` (`week-planner.tsx`) posait le même `aria-label` générique « Ouvrir le rendez-vous de {animal} à {heure} » sur tous les types d'événements sélectionnables (rendez-vous, tournée, créneau bloqué), ce dernier n'ayant pas d'`animal` défini. Corrigé avec un libellé différencié par `event.kind` : créneau bloqué → « Ouvrir le créneau bloqué : {titre} à {heure} », tournée → « Ouvrir la tournée {titre} à {heure} », rendez-vous → libellé inchangé. Vérifié en créant un créneau bloqué de test sur la grille réelle : libellé accessible lu directement dans le DOM = « Ouvrir le créneau bloqué : Test P3-36 à 17:30 ». Donnée de test supprimée après vérification.

Revérifié `npx tsc --noEmit` et `npm run lint` après les trois correctifs : aucune erreur.

## P3-32 — Note de correction (2026-08-29)

Le formulaire interne (`appointment-form.tsx`) utilise `Field` (`settings-fields.tsx`), un composant distinct de `BookingField` (formulaire public) mais avec la même limitation documentée : il ne peut pas injecter `aria-describedby` sur son enfant (contrôle opaque). Contrairement au formulaire public, `Field` n'exposait aucun moyen de le faire — le `hint` affiché (« Facultatif ») n'était donc jamais annoncé par un lecteur d'écran en train de naviguer un des 3 champs concernés (Complément d'adresse, Code postal, Ville, visibles en mode Domicile). Le formulaire interne n'a pas d'erreurs par champ (une seule bannière d'erreur globale en haut, déjà correctement annoncée via `role="alert"`) — seule l'association d'indice (hint) manquait réellement, contrairement à ce que le titre de l'audit laissait supposer pour les erreurs.

Correction : ajout de `fieldDescribedBy(id, { hasHint })` à `settings-fields.tsx` (même pattern que `bookingFieldDescribedBy`), `Field` accepte désormais un `id` optionnel (rétrocompatible, aucun des ~15 autres appels de `Field` dans le reste de l'app n'est affecté) et pose `id={`${id}-hint`}` sur son indice. Câblé sur les 3 champs concernés dans `appointment-form.tsx`.

Vérifié : lecture DOM confirmant que `aria-describedby` de chacun des 3 champs résout bien vers l'élément portant le texte « Facultatif » ; saisie fonctionnelle inchangée (rempli « Étage 2 » dans Complément d'adresse avec succès) ; scan axe-core complet sur la modale ouverte en mode Domicile — les 2 catégories de violations restantes (`aria-allowed-role`, `color-contrast`) proviennent du calendrier affiché en arrière-plan (cartes `<article role="button">`, couleurs `#547781`/`#234E5A`), préexistantes et sans rapport avec ce correctif ; capture d'écran desktop de la modale ouverte sans régression visuelle.

**Constat annexe, hors périmètre** : le scan a révélé que les cartes de rendez-vous du calendrier (`<article role="button">` dans `week-planner.tsx`) déclenchent la règle axe-core `aria-allowed-role` (16 nœuds) — `role="button"` n'est pas dans la liste des rôles autorisés pour `<article>` selon les spécifications ARIA strictes. Non corrigé ici (composant différent, hors périmètre P3-32), à évaluer lors d'un futur audit.

## P3-30 / P3-31 — Note de correction (2026-08-29)

**P3-30 (corrigé)** : cause réelle — `CalendarEventCard` (`week-planner.tsx`) calcule la largeur d'une puce en divisant 100 % de la colonne du jour par le nombre de rendez-vous qui se chevauchent (`columnWidthPercent = 100 / columns`), sans plancher. Avec 5-6 rendez-vous superposés sur un jour très chargé, cela produit des puces de quelques pixels de large, sous le minimum légal WCAG de 24px. Correction : `minWidth: "24px"` sur la puce (prioritaire sur le calcul en `%` uniquement dans ce cas extrême, sans effet sur le cas normal), plus un `zIndex` croissant par colonne (`10 + column`, `30` si sélectionné) pour que les puces les plus à droite passent proprement par-dessus leurs voisines quand elles doivent déborder de leur emplacement calculé — comme dans Google Calendar/Outlook — au lieu d'un empilement au hasard de l'ordre du DOM.

Vérifié en conditions réelles : 6 rendez-vous de test insérés en base sur des créneaux qui se chevauchent (10h00 à 10h25, 30 min chacun), rechargement de l'agenda, mesure de la largeur rendue de chacune des 6 puces (`getBoundingClientRect().width`) — toutes à exactement 24px, chacune individuellement visible et ciblable. Capture d'écran à l'appui. Données de test nettoyées après vérification. Revérifié aussi le rendu normal (aucun chevauchement) desktop et mobile : aucune régression, la largeur des puces isolées reste inchangée (bien au-dessus du plancher de 24px dans ce cas).

**P3-31 (non traité, décision consciente de périmètre)** : contrairement à P3-30, ce point ne décrit pas un échec du minimum légal WCAG (24px) — les boutons/filtres concernés (29–42px) le respectent déjà ; il s'agit d'une recommandation de confort (cible 44px) sur un ensemble large et transversal de composants dans tout le tableau de bord (« de nombreux boutons/filtres »). Élargir chacun d'eux représenterait un changement de mise en page significatif et diffus, avec un risque de régression visuelle disproportionné par rapport à un gain qui reste du confort et non de l'accessibilité bloquante. `FIX_PLAN.md` demandait explicitement de prioriser d'abord la puce qui échoue réellement au minimum légal (P3-30, traité ci-dessus). P3-31 reste donc non traité ici, à reprendre dans un futur passage dédié au polish visuel transversal plutôt que dans ce sprint.

## P2-17 — Note d'investigation (2026-08-29) : ne se reproduit pas

Revérifié en conditions réelles avant toute correction (glisser-déposer simulé via événements pointeur réels sur `/dashboard/agenda`, connecté). Lecture du code de `week-planner.tsx` (`finishDrag()`) : `setDrag(null)` est appelé de façon inconditionnelle en tout début de fonction, avant même de vérifier si le créneau cible est fermé ou en conflit — l'aperçu de glissement et l'opacité réduite (`isDragging` → `opacity-30`) de la carte d'origine sont donc déjà réinitialisés au relâchement du pointeur, que le dépôt soit accepté ou rejeté.

Confirmé par deux scénarios réels distincts : (1) glisser un rendez-vous existant directement sur le créneau d'un autre rendez-vous du même jour (conflit) et (2) le glisser sur une plage fermée (hors horaires d'ouverture). Dans les deux cas, le toast d'erreur « Ce créneau n'est pas disponible » s'affiche bien, et une vérification immédiate puis 1,5s après le relâchement ne trouve aucun élément avec `opacity-30` — les deux cartes concernées gardent un rendu normal (capture d'écran à l'appui). Aucune régression, aucune correction de code nécessaire : le symptôme décrit par l'audit initial ne se manifeste pas avec le code actuel.

## P2-12 — Note de correction (2026-08-29)

Cause réelle : `--theme-muted` (token derrière `text-animeo-muted`, utilisé partout comme texte secondaire) était défini à deux endroits — `globals.css` (`#6b7780`) et, comme pour P1-4, une valeur inline concurrente dans `dashboard-theme-provider.tsx` (`#6B7780`) qui prend le dessus sur tout le tableau de bord. Contre le fond de l'app (`#f7faf9`), cette valeur atteint ~4,37:1, sous le seuil. Une première correction à `#66727C` suffisait sur fond blanc/quasi-blanc mais restait sous le seuil (4,16:1) sur le pire cas réel rencontré : les pastilles/cartes teintées utilisant `--theme-soft` (~`#e4eeec`, luminance plus basse qu'un fond blanc). Valeur finale retenue : `#5C6A74` (même teinte, encore légèrement assombrie), qui atteint ~4,7:1 sur ce pire cas et ~5,3–5,6:1 sur les fonds plus clairs. Le mode sombre (`#A8B8BD` sur fond `#101D22`, ~8,4:1) était déjà largement conforme et n'a pas été modifié.

Vérifié avec axe-core (`color-contrast`) sur `/dashboard`, `/dashboard/agenda`, `/dashboard/clients`, `/dashboard/parametres` et `/reservation` (page publique) avant/après : toutes les violations portant sur `text-animeo-muted` ont disparu (agenda : 49 → 0 nœuds liés à ce token). Revérifié visuellement desktop (1280px) et mobile (390px) : le texte secondaire reste lisible sans paraître trop appuyé.

**Constat annexe, hors périmètre de ce correctif** : le même scan axe-core a révélé plusieurs violations de contraste préexistantes et non liées à `text-animeo-muted` — un badge `text-[#9a671c]` sur `bg-[#fff4dd]` (tableau de bord), un libellé décoratif `opacity-60` (`#74898f` sur blanc, boutons « Modifier » Cabinet/Domicile), les numéros de jours désactivés du mini-calendrier (`text-[#bcc5c7]`, ratio 1,75:1 — très faible), et le texte des pastilles de rendez-vous en tournée (`text-[#234E5A]`/`opacity-75`, agenda). Aucun de ces éléments n'était dans la liste `AUDIT_COMPLET.md`/`FIX_PLAN.md` initiale ; ce sont des constats nouveaux, non corrigés ici pour rester dans le périmètre du sprint, à ajouter au prochain audit ou à un futur sprint P2/P3.

## P2-11 — Note d'investigation (2026-08-29) : ne se reproduit pas comme défaut visible

Revérifié en conditions réelles (Playwright, connecté, `/dashboard/clients` @1280px et `/dashboard/agenda` @768px) avant toute correction, conformément au processus. Le symptôme technique décrit par l'audit initial existe bien : `document.documentElement.scrollWidth` (1321px / 828px) dépasse `window.innerWidth` (1280px / 768px), et `window.scrollTo()` accepte un décalage horizontal non nul (41px / 60px) — reproductible de façon identique sur 3 exécutions consécutives, donc pas un artefact transitoire.

Mais aucune de ces vérifications indépendantes ne confirme un débordement visuel réel :
- `document.body.scrollWidth`, `document.body.offsetWidth` et `document.body.getBoundingClientRect().width` valent exactement 1280px (aucun débordement) — seul `documentElement.scrollWidth` diverge, pas `body`.
- `document.documentElement.offsetWidth` et `getBoundingClientRect().width` valent aussi exactement 1280px — seule la propriété `scrollWidth` (pas les autres métriques de layout de `<html>`) montre un écart.
- Un scan exhaustif de tous les éléments de la page (y compris avec prise en compte des ancêtres `overflow-x: auto/hidden/scroll`) n'a trouvé aucun élément réellement non confiné dépassant le viewport. Le conteneur du tableau clients (`overflow-x: auto`, largeur mesurée 942px) confine correctement son tableau interne de 1048px via son propre défilement.
- Une capture d'écran prise après `window.scrollTo(41, 0)` (le décalage maximal accepté) est visuellement identique à la capture non décalée — aucun contenu ne se déplace réellement à l'écran.

**Conclusion** : il s'agit d'une particularité connue de Chromium où `documentElement.scrollWidth` peut être gonflé par l'étendue de défilement interne d'un conteneur `overflow-x: auto` imbriqué (ici, le wrapper du tableau clients / de la grille de l'agenda), même quand ce conteneur confine correctement son contenu et qu'aucun débordement n'est visible ou n'affecte l'utilisateur. Contrairement à P1-6 (où l'hypothèse de correction initiale de l'audit s'est révélée incomplète mais le bug lui-même était bien réel et visible), ici le bug décrit par l'audit ne se manifeste pas comme un défaut utilisateur constatable : rien ne déborde à l'écran, rien ne se coupe, le défilement horizontal du document ne produit aucun changement visuel. Aucune correction de code n'a donc été appliquée — il n'y a pas de symptôme réel à corriger. Statut reclassé de 🔴 à ⚪ (vérifié, non reproductible visuellement) plutôt que 🟢 (corrigé), puisqu'aucune modification n'était nécessaire.

---

# Problèmes P3 (amélioration / polish)

| ID | Titre | Page/Composant |
|---|---|---|
| P3-30 | 🟢 Corrigé et testé — voir note détaillée après ce tableau | Agenda (vue semaine) |
| P3-31 | ⚪ Non traité, décision documentée — voir note détaillée après ce tableau | Transversal |
| P3-32 | 🟢 Corrigé et testé — `fieldDescribedBy` (même pattern que `bookingFieldDescribedBy` du formulaire public) ajouté à `settings-fields.tsx`, câblé sur les 3 champs à indice du mode Domicile (Complément d'adresse, Code postal, Ville) dans `appointment-form.tsx` | `appointment-form.tsx` |
| P3-33 | 🟢 Corrigé et testé — voir note détaillée après ce tableau | Dashboard |
| P3-34 | 🟢 Corrigé et testé — bouton dit désormais « Créer le rendez-vous » à la création, « Enregistrer les modifications » en édition | `appointment-form.tsx` |
| P3-35 | 🟢 Corrigé et testé — cause réelle : `option / 60` sans `Math.floor()` (90/60 = 1.5 en JS) ; option 90 min affiche désormais « 1h30 » | Blocage de créneau |
| P3-36 | 🟢 Corrigé et testé — libellé accessible désormais différencié par type d'événement (créneau bloqué / tournée / rendez-vous) | Agenda |
| P3-37 | 🟢 Corrigé et testé — voir note détaillée après ce tableau | Transversal |

---

# Ce qui fonctionne bien (à préserver, ne pas modifier sans raison)

- **Prévention des chevauchements de rendez-vous** (dashboard) : testée avec deux clients sur le même créneau, rejetée avec un message clair.
- **Protection contre la double réservation publique** : testée avec deux navigateurs soumettant simultanément le même créneau — un seul rendez-vous créé, l'autre rejeté proprement grâce à une défense à deux niveaux (vérification applicative + contrainte unique en base) qui fonctionne exactement comme conçu.
- **Calendrier de réservation publique** : modèle ARIA « grid » complet (flèches, Home/End/PageUp/PageDown, annonces live), excellent exemple à reproduire pour corriger P0-3.
- **Système de notifications (toasts + cloche)** : gestion du focus, `aria-live`, badge fidèle au contenu réel — solide.
- **Persistance de la progression de réservation** (sessionStorage + historique navigateur) : rafraîchissement et bouton retour testés, aucune perte de données.
- **Limitation de débit sur la connexion** : déclenche bien après le seuil configuré, message clair.
- **Séparation des rôles pour Statistiques et Administration** : appliquée côté serveur (pas seulement l'UI masquée), vérifiée par navigation directe par URL.
- **Validation de formulaire** (réservation publique) : erreurs précises, associées aux champs, en français clair.

---

# Maturité des fonctionnalités

| Fonctionnalité | Niveau initial | Niveau après correction | Niveau recommandé V1 |
|---|---|---|---|
| Prise de rendez-vous (réservation publique) | 4/5 | 4.5/5 | 4/5 |
| Agenda | 3.5/5 | 4/5 | 4/5 |
| Notifications (toasts + cloche) | 4/5 | 4/5 | 4/5 |
| Prestations | 3.5/5 | 4/5 | 4/5 |
| Disponibilités | 3/5 | 3/5 | 4/5 |
| Paramètres | 3/5 | 3/5 | 3/5 |
| Sécurité / Auth | 3/5 | 4/5 | 4/5 |
| Clients | 2/5 | 4/5 | 4/5 |
| Animaux | 3/5 | 4/5 | 4/5 |
| Rappels | 2.5/5 | 2.5/5 | 3/5 |
| Accessibilité (transversal) | 2/5 | 4/5 | 4/5 |
| Tournées / Déplacements | 1/5 | 3.5/5 | 3/5 (déjà atteint) |
| Statistiques | 1/5 | 1/5 | 2/5 (ou retirer le menu tant que ce n'est pas réel) |

## Agenda

### Ce qui existe actuellement
- Vues jour/semaine/mois/année, création/modification/annulation/complétion de rendez-vous, glisser-déposer pour reprogrammer, blocage de créneaux, filtres (statut, mode, tournée).

### Ce qui fonctionne bien
- Détection de chevauchement fiable (comparaison d'intervalles, pas juste d'heure de départ).
- Blocage/déblocage de créneau, double-clic protégé.

### Ce qui est incomplet
- Carte glissée sur un créneau invalide reste visuellement figée (P2-17).

### Corrigé depuis l'audit initial
- Le widget « Demandes de rendez-vous » indique désormais explicitement quand des demandes existent hors de la période affichée, au lieu d'affirmer à tort que tout est traité (P1-9).

### Sous-fonctionnalités manquantes
- Pas de vue « liste » compacte pour scanner rapidement une longue journée.
- Pas de récurrence de rendez-vous (consultations de suivi périodiques).

### Cas particuliers non gérés
- Aucun avertissement de perte de saisie si on quitte le formulaire de rendez-vous sans sauvegarder.

### Automatisations possibles
- Suggestion automatique du prochain créneau disponible lors de la création d'un rendez-vous.

## Prise de rendez-vous (réservation publique)

### Ce qui existe actuellement
- Tunnel en 4 étapes (consultation+mode → créneau réel basé sur les disponibilités → coordonnées/adresse/animal en accordéon → confirmation), emails de confirmation réels, référence de réservation, ajout au calendrier (.ics).

### Ce qui fonctionne bien
- Calendrier accessible au clavier de bout en bout, revalidation du créneau à chaque transition d'étape (protège contre une réservation qui vient d'être prise), persistance de l'état sur rafraîchissement.

### Ce qui est incomplet
- Zones/frais de déplacement encore des données figées, pas les vraies zones du praticien (P2-22).

### Corrigé depuis l'audit initial
- Le clic sur l'en-tête « Adresse » ouvre désormais systématiquement la section (P1-10).
- Le sélecteur de date de naissance ne piège plus le focus clavier au simple `Tab` (P1-5).

### Sous-fonctionnalités manquantes
- Pas de rappel automatique par SMS/email avant le rendez-vous (distinct de l'email de confirmation immédiat, déjà réel).
- Pas de possibilité pour le client d'annuler/reprogrammer lui-même sa demande via un lien.

## Clients

### Ce qui existe actuellement
- Liste, recherche, fiche détaillée, suppression (avec permission), et désormais création et modification (voir ci-dessous).

### Corrigé depuis l'audit initial
- Création d'un client et modification de ses coordonnées fonctionnent réellement depuis le tableau de bord (P1-7) — c'était le point le plus faible du produit du point de vue « CRM », désormais comblé.

### Cas particuliers non gérés
- Désynchronisation possible entre le nom d'un client et le nom affiché sur ses rendez-vous passés (P2-16, dénormalisation historique — la correction de P1-7 n'a modifié que la création/l'édition à partir de maintenant, pas les enregistrements déjà désynchronisés).

### Sous-fonctionnalités manquantes
- Pas de changement de statut Actif/Inactif depuis l'interface (le champ existe en base mais n'est pas exposé dans le nouveau formulaire, volontairement laissé hors du périmètre P1 — à valider si utile).

## Animaux

### Ce qui existe actuellement
- Modification et suppression d'un animal existant (avec validation), et désormais ajout d'un nouvel animal à un client existant.

### Corrigé depuis l'audit initial
- Ajout d'un nouvel animal à un client existant, avec pictogramme généré automatiquement selon l'espèce (même logique que la création via la réservation publique) (P1-7).

## Prestations

### Ce qui existe actuellement
- CRUD complet (créer, modifier, désactiver, supprimer), prix différenciés cabinet/domicile, frais de déplacement (fixe/zone/kilométrique), types d'animaux, photo.

### Corrigé depuis l'audit initial
- Les contrôles sont désormais masqués/désactivés sans la permission requise, avec un bandeau explicite (P1-8).

## Disponibilités

### Ce qui existe actuellement
- Horaires par jour, plusieurs plages par jour (permet une pause déjeuner), cabinet/domicile indépendants par plage, fermetures exceptionnelles (date + heure + portée + motif), vacances (plage de dates).

### Ce qui est incomplet
- Aucun contrôle de conflit avec des rendez-vous déjà confirmés lors d'une réduction d'horaires (P2-19).
- Réglage « Temps de déplacement » présent mais sans aucun effet (P2-20).

### Sous-fonctionnalités manquantes
- Pas de copie d'un jour vers d'autres jours (dupliquer les horaires du lundi sur le reste de la semaine).
- Pas de détection automatique des jours fériés.
- Pas d'aperçu visuel du résultat sans aller vérifier la page de réservation publique.

## Tournées / Déplacements

### Ce qui existe actuellement
- Interface complète de création/modification/activation de tournées et de zones, avec une carte clients (Leaflet, réelle), et désormais une vraie persistance en base sur les deux surfaces où elle est éditable (page dédiée et onglet Paramètres).

### Corrigé depuis l'audit initial
- **Tout est désormais réellement persisté** (P0-2) — c'était la fonctionnalité la moins aboutie du produit malgré une UI complète ; elle est maintenant fonctionnelle de bout en bout, avec le rejet serveur correct d'une suppression de zone encore utilisée par une tournée.

### Ce qui reste incomplet
- La table technique `TourAppointment` n'a toujours aucun chemin d'écriture applicatif (P2-25) — distincte de `Tour`/`Zone`, désormais réelles ; les rendez-vous affichés sur une tournée restent ceux du seed initial.

### Niveau actuel : 3.5/5 — CRUD complet et persistant ; il manque encore le calcul réel des rendez-vous rattachés à une tournée (P2-25) pour atteindre un niveau avancé.

## Rappels

### Ce qui existe actuellement
- Suivi de statut (à relancer / envoyé / repris / ignoré), programmation, filtres, statistiques de rappels.

### Ce qui est incomplet
- L'action « Envoyer » est une simulation complète — aucun email/SMS n'est réellement envoyé (P2-23), même si c'est honnêtement indiqué à l'utilisateur (contrairement aux Tournées).

## Statistiques

### Ce qui existe actuellement
- Graphiques et indicateurs avec filtres période/prestation/espèce.

### Ce qui est incomplet
- 100 % de données fictives, aucune requête réelle sur les rendez-vous/clients (P2-24), derrière une vraie permission qui suggère des données fiables.

## Sécurité / Authentification

### Ce qui existe actuellement
- Session JWT signée, double authentification par email, verrouillage après tentatives échouées (limité en base, adapté au serverless), rôles/permissions vérifiés côté serveur, journal d'audit.

### Corrigé depuis l'audit initial
- Boucle de redirection infinie sur invalidation de session corrigée (P0-1) — c'était le point le plus grave du produit du point de vue sécurité, car il touchait le mécanisme censé protéger l'utilisateur.

### Ce qui reste incomplet
- `getOccupiedSlotsAction` public sans limitation de débit (P2-15, risque faible).

---

# Fonctionnalités potentiellement manquantes (à valider, pas des bugs)

Ces suggestions ne sont **pas** des corrections de bugs — ce sont des trous fonctionnels identifiés en comparant le produit aux attentes standards d'un logiciel de réservation/CRM professionnel. Chacune doit être évaluée par vous avant tout développement.

| Fonctionnalité | Utilité | Pour qui | Importance | Complexité estimée |
|---|---|---|---|---|
| Création/édition de client depuis le tableau de bord | Combler le trou P1-7 — c'est en réalité un bug de complétude plus qu'une « nouveauté » | Praticien/secrétariat | Élevée | Moyenne |
| Envoi réel des rappels (email a minima) | Le module Rappels ne sert à rien tant que rien ne part réellement | Praticien (fidélisation client) | Élevée | Forte (nécessite un fournisseur d'envoi déjà en place pour les emails de réservation — réutilisable) |
| Annulation/reprogrammation en libre-service par le client (lien dans l'email de confirmation) | Réduit la charge du praticien pour les changements simples | Client final | Moyenne | Moyenne |
| Rappel de rendez-vous à venir (J-1, distinct du mail de confirmation) | Réduit les rendez-vous manqués, standard du secteur | Client final / praticien | Moyenne-Élevée | Moyenne (réutilise l'infrastructure email existante) |
| Export ou impression de la fiche client/consultation | Utile pour un praticien qui doit partager un dossier | Praticien | Faible-Moyenne | Faible |
| Vue agenda « liste » compacte | Confort de lecture sur une journée chargée | Praticien | Faible | Faible |

---

# Limites de cet audit

- Le rôle Secrétariat n'a pas pu être testé en direct au-delà de la connexion (double authentification par email non accessible pendant l'audit). Les vérifications de séparation des rôles pour ce compte reposent sur la lecture du code, qui montre une logique de permission uniforme (non spécifique au compte) — donc probablement fiable, mais non confirmée en conditions réelles.
- L'onglet « Personnalisation » et certains sous-onglets de `/dashboard/parametres` ont été chargés sans erreur mais pas testés en CRUD complet, faute de temps.
- Les mesures de performance ont été prises en mode développement (`next dev`), pas en production (`next start`) — les temps de chargement réels seront probablement meilleurs, mais aucun audit Lighthouse en conditions de production n'a été effectué.
- Le contraste a été mesuré automatiquement (axe-core) sur 4 pages ; les autres pages n'ont pas été scannées mais utilisent la même palette de couleurs, donc les mêmes problèmes sont probables.
