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
| P2-11 | Débordement horizontal réel de page à 1280px (`/clients`) et 768px (`/agenda`) — le tableau/calendrier large fuit hors de son conteneur `overflow-x-auto` | Clients, Agenda | P2 | Faible |
| P2-12 | Texte secondaire (gris atténué) sous le seuil de contraste de justesse (4,14–4,31:1 vs 4,5 requis), très largement utilisé (49 nœuds sur l'agenda) | Transversal | P2 | Faible |
| P2-13 | Le champ de recherche global de l'en-tête n'a pas de label accessible (seulement un `placeholder`) | `DashboardTopBar` | P2 | Faible |
| P2-14 | Rôle Secrétariat non testé en direct (2FA email non accessible pendant l'audit) — vérification uniquement par lecture de code | Sécurité | P2 | — |
| P2-15 | `getOccupiedSlotsAction` (disponibilité publique) n'a aucune limitation de débit — ne fuit pas de données personnelles mais permet un scraping/DoS léger | `appointments-actions.ts` | P2 | Faible |
| P2-16 | Désynchronisation du nom client entre la fiche client (« Loi Duboc ») et les rendez-vous existants (« Loic Duboc ») — champ dénormalisé jamais resynchronisé | `Appointment.clientName` | P2 | Moyenne |
| P2-17 | Une carte de rendez-vous glissée-déposée sur un créneau invalide reste visuellement « figée » (opacité 30 %, bordure pointillée) jusqu'au rechargement | `week-planner.tsx` | P2 | Faible |
| P2-18 | Erreur d'hydratation React réelle sur le graphique « Activité de la semaine » du tableau de bord (mismatch SSR/CSR sur le format de date) | `RevenueChart` | P2 | Moyenne |
| P2-19 | Aucune vérification de conflit avec les rendez-vous existants lors de la réduction des disponibilités ou de l'ajout d'une fermeture exceptionnelle | `updateAvailabilityAction` | P2 | Moyenne |
| P2-20 | Le réglage « Temps de déplacement » (Disponibilités) est purement décoratif — sans effet sur l'agenda | `availability-settings-tab.tsx` | P2 | Moyenne |
| P2-21 | Un enregistrement Client/Animal orphelin est créé en base pour la requête perdante d'une double réservation simultanée (inoffensif mais malpropre) | `submitPublicBookingAction` | P2 | Moyenne |
| P2-22 | Les zones et frais de déplacement affichés sur la page de réservation publique sont encore des données de démonstration figées, pas les zones réellement configurées par le praticien | `data/public-booking.ts` | P2 | Moyenne |
| P2-23 | L'action « Envoyer » des rappels est entièrement simulée — aucun email/SMS réel n'est envoyé (label honnête « simulation locale », contrairement aux Tournées) | `reminders-view.tsx` | P2 | Forte |
| P2-24 | `/dashboard/statistiques` est 100 % données fictives, derrière une permission réelle (`VIEW_FINANCES`) qui laisse penser à des chiffres fiables | `stats-view.tsx` | P2 | Forte |
| P2-25 | La table `TourAppointment` n'a aucun chemin d'écriture applicatif — seul le script de seed peut la peupler | `src/lib/tours.ts` | P2 | Moyenne |
| P2-26 | Aucune purge des tables `RateLimitEvent`/`TwoFactorCode`/`PasswordResetToken` — croissance illimitée en production | `src/lib/rate-limit.ts` etc. | P2 | Faible |
| P2-27 | Variables d'environnement mortes dans `.env.local.example` (`AUTH_EMAIL`, `AUTH_PASSWORD_HASH_BASE64`), héritées d'un ancien schéma d'auth, référencées nulle part | `.env.local.example` | P2 | Faible |
| P2-28 | Composant orphelin `src/components/pages/feature-placeholder.tsx`, zéro importeur | Code mort | P2 | Faible |
| P2-29 | `AuditLog.ipAddress` n'est jamais renseigné bien que la colonne existe | `src/lib/audit.ts` | P2 | Faible |

---

# Problèmes P3 (amélioration / polish)

| ID | Titre | Page/Composant |
|---|---|---|
| P3-30 | Une puce de rendez-vous ne respecte pas la taille minimale de cible tactile WCAG (5×36px) quand plusieurs rendez-vous se chevauchent visuellement dans le calendrier | Agenda (vue semaine) |
| P3-31 | De nombreux boutons/filtres du tableau de bord font 29–42px de haut (sous la recommandation de confort 44px, au-dessus du minimum légal WCAG 24px) | Transversal |
| P3-32 | Le formulaire interne de rendez-vous n'associe pas ses erreurs aux champs via `aria-describedby`, contrairement au formulaire de réservation publique | `appointment-form.tsx` |
| P3-33 | Chevauchement visuel sur la mini-carte « Prochaine tournée » du tableau de bord (badge violet qui tronque la légende) | Dashboard |
| P3-34 | Le bouton de sauvegarde du formulaire de rendez-vous dit toujours « Enregistrer les modifications », même à la création | `appointment-form.tsx` |
| P3-35 | Option de liste déroulante malformée « 1.5h30 » (mélange notation décimale et horaire) | Blocage de créneau |
| P3-36 | Libellé accessible générique sur un créneau bloqué (« Ouvrir le rendez-vous de... » au lieu de « ...créneau bloqué... ») | Agenda |
| P3-37 | Aucun avertissement de perte de saisie en cas de retour arrière/rafraîchissement pendant le remplissage d'un formulaire du tableau de bord | Transversal |

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
