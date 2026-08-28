# Prompt — Notifications du tableau de bord et système de toasts

> À poser à la racine du repo, à côté de `AUDIT-RESERVATION.md` et `PROMPT-CALENDRIER.md`.
> Prompt de démarrage : « Lis `PROMPT-NOTIFICATIONS.md` et applique la Partie A. Arrête-toi avant la Partie B. »

Deux chantiers indépendants et livrables séparément :

- **Partie A** — système de toasts, pour remplacer le `feedback` dupliqué et couvrir les vues qui n'ont aucun retour d'action.
- **Partie B** — la cloche de notifications du header.

---

## Skills à utiliser

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<requête>" --domain ux
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<requête>" --stack nextjs
```

| Skill | Usage |
|---|---|
| `ui-ux-pro-max` | Catégorie 8 « Forms & Feedback » et catégorie 1 « Accessibility » |
| `vercel-react-best-practices` | Provider, contexte, effets, patterns React 19 |
| `web-design-guidelines` | Finition visuelle |
| `playwright-cli` | Tests |

Requêtes de départ, une intention par recherche :

```
"toast notification timing dismissal"       --domain ux
"error message placement severity"          --domain ux
"live region announcement politeness"       --domain ux
"notification badge count screen reader"    --domain ux
"popover focus management escape"           --domain ux
```

Vérifier chaque résultat avant application. Ce document et les règles du repo priment.

---

# PARTIE A — Système de toasts

## A1. L'existant à remplacer

Deux implémentations parallèles du même mécanisme :

- `src/components/settings/settings-view.tsx:54` et `:126`
- `src/components/settings/services-view.tsx:23` et `:91`

Toutes deux : `useState<string | null>` nommé `feedback`, rendu dans une bannière verte.

Trois défauts à ne pas reproduire :

1. **Succès et erreur partagent la même chaîne.** `setFeedback(result.error)` et
   `setFeedback("Prestation créée")` aboutissent au même endroit, avec le même style vert et un `✓`
   ajouté automatiquement. Une erreur s'affiche donc comme un succès.
2. **Contournement en dur.** `settings-view.tsx:128` teste `feedback.startsWith("Le lien")` pour
   éviter le `✓` sur certains messages. Symptôme direct du point précédent.
3. **`role="status"` pour tout.** Correct pour un succès, insuffisant pour une erreur, qui demande
   `role="alert"`.

Le reste du tableau de bord — agenda, clients, tournées, rendez-vous, rappels — n'a **aucun** retour
d'action.

## A2. Choix technique : Sonner

Installer `sonner` (aucune dépendance transitive).

```bash
npm install sonner
```

Justification : ce qui est difficile dans un toast n'est pas l'affichage mais l'empilement, la pause
du minuteur au survol, le balayage pour fermer, l'annonce aux lecteurs d'écran sans double lecture,
et `prefers-reduced-motion`. Sonner traite tout cela.

**Ne pas installer shadcn/ui pour autant.** Le projet n'utilise pas Radix ni shadcn ; importer
`Toaster` directement depuis `sonner` et l'habiller avec les tokens existants.

## A3. Implémentation

**Montage.** Un seul `<Toaster />` dans le layout du dashboard (`src/app/dashboard/layout.tsx`),
pas dans chaque vue.

**Habillage.** Utiliser les tokens du projet, jamais de couleurs en dur :
`--color-animeo-success` (`#36a26b`), `--color-animeo-error` (`#d95c5c`),
`--color-animeo-info` (`#5b8def`), `--color-animeo-dark`, `--color-animeo-soft`.
Ces tokens existent dans `src/app/globals.css` et ne sont pas encore exploités.

**Module d'abstraction.** Créer `src/lib/notify.ts` qui enveloppe Sonner, pour que les composants
ne l'importent pas directement :

```ts
notify.success(message)
notify.error(message)
notify.promise(promise, { loading, success, error })
```

Cela permet de changer de librairie plus tard sans toucher aux appelants, et d'imposer le bon rôle
ARIA selon le type.

**Branchement sur les server actions.** Les actions renvoient déjà `{ ok: true, ... }` ou
`{ ok: false, error }`. Convention :

```ts
const result = await saveAppointmentAction(input);
if (!result.ok) return notify.error(result.error);
notify.success("Rendez-vous enregistré");
```

**Durées.** Succès 4 s, erreur persistante jusqu'à fermeture manuelle — une erreur ne doit pas
disparaître avant d'avoir été lue.

**Ne pas toaster ce qui est déjà visible.** Si l'effet de l'action est immédiatement visible à
l'écran (une ligne qui disparaît d'un tableau), le toast est redondant. Le réserver aux actions dont
le résultat n'est pas évident, et aux erreurs.

## A4. Migration

1. Créer `src/lib/notify.ts` et monter le `Toaster`.
2. Migrer `services-view.tsx`, puis `settings-view.tsx`. Supprimer le `feedback` local, la bannière,
   et le contournement `startsWith("Le lien")`.
3. Vérifier `ToursSettingsTab`, qui reçoit `onNotify={setFeedback}` — la prop disparaît.
4. Ajouter des toasts là où il n'y a rien aujourd'hui : agenda, clients, tournées, rendez-vous, rappels.
5. **Cas particulier — la réservation publique.** `summary-steps.tsx` affiche `submitError` dans le
   flux de la page. **Ne pas le convertir en toast** : c'est une erreur bloquante qui demande une
   action de l'utilisateur, elle doit rester dans le formulaire. Un toast informe, une alerte bloque.

---

# PARTIE B — La cloche de notifications

## B1. Diagnostic

`src/components/dashboard/dashboard-header.tsx`

Ce n'est pas un système de notifications, c'est une **vue dérivée de l'état courant** :
`dueReminders` et `pendingAppointments` sont recalculés à chaque rendu. Conséquences :

- Pas de notion **lu / non lu**.
- Pas d'**horodatage** : impossible de savoir ce qui est arrivé depuis la dernière consultation.
- Pas d'**historique** : un rendez-vous validé disparaît sans trace.
- **Pas de temps réel** : `appointments` vient d'un contexte client, `reminders` d'une prop serveur.
  Une demande arrivée par la page publique n'apparaît qu'au rechargement. C'est le défaut le plus
  gênant en usage réel — le praticien ne voit pas arriver ses demandes.

## B2. Corrections immédiates (sans changement d'architecture)

- **[P1] Le badge ment.** `.slice(0, 4)` par groupe alors que `notificationCount` compte tout.
  Ajouter un « voir les N autres », ou aligner le compteur sur ce qui est réellement affiché.
- **[P1] `role="menu"` invalide.** Les enfants sont des `<button>` et des `<Link>`, pas des
  `menuitem`, et il n'y a pas de navigation aux flèches. Deux options : implémenter le pattern menu
  complet, ou — plus simple et plus honnête ici — abandonner `role="menu"`, mettre un conteneur avec
  `aria-labelledby`, et corriger `aria-haspopup="true"` en `aria-haspopup="dialog"`.
- **[P1] Changement de compteur non annoncé.** L'`aria-label` du bouton évolue, mais rien ne le
  signale hors focus. Ajouter une région `aria-live="polite"` discrète.
- **[P1] Focus non géré à l'ouverture.** Le focus reste sur le bouton ; à la fermeture par `Échap`,
  le rendre explicitement au déclencheur.
- **[P2] Lien de pied incohérent.** « Voir tous les rappels » pointe vers `/dashboard/rappels` même
  quand le panneau ne contient que des demandes de rendez-vous. Adapter au contenu.
- **[P2] Badge à 10 px.** Sous le minimum de 12 px. Le rapport de contraste blanc sur `#C1533C` est
  de 4,6:1 — conforme, mais tout juste : ne pas éclaircir cette couleur.
- **[P2] Au-delà de 99.** Aucun plafond d'affichage : le badge se déforme. Afficher `99+`.

## B2 bis. Rendre la cloche présente sur tout le logiciel

Aujourd'hui `DashboardHeader` est rendu **uniquement** par `dashboard-view.tsx:19`, donc la cloche
n'existe que sur `/dashboard`. Les pages agenda, clients, tournées, rappels, prestations,
statistiques et carte n'ont aucun en-tête.

**Ne pas dupliquer `DashboardHeader` sur chaque page.** Il mélange trois responsabilités : le message
d'accueil « Bonjour {prénom} / Voici votre journée en un coup d'œil » (propre au tableau de bord), la
recherche client, et la cloche. Le copier collerait l'accueil sur la page Clients.

### Découpe demandée

| Composant | Contenu | Rendu depuis |
|---|---|---|
| `NotificationsBell` | Bouton, badge, panneau | `DashboardTopBar` |
| `DashboardTopBar` | Recherche + `NotificationsBell` + avatar | `src/app/dashboard/layout.tsx` |
| `DashboardHeader` | Uniquement le titre d'accueil | `dashboard-view.tsx`, inchangé par ailleurs |

Placer `<DashboardTopBar />` dans le layout, à l'intérieur de `<main>` et avant `{children}`, pour
qu'il hérite du padding existant et bénéficie déjà de `AppointmentsProvider`.

### Collision avec la barre mobile existante

`dashboard-sidebar.tsx:58` rend déjà un `<header>` fixe en `h-16` sur mobile — c'est ce qui justifie
le `pt-16 md:pt-0` du conteneur du layout. **Ne pas empiler une seconde barre en dessous.**

Deux options, à trancher :

1. Sur mobile, ne pas rendre `DashboardTopBar` et **déplacer la cloche dans la barre existante** de
   la sidebar, à côté du bouton menu. Attention : cette barre est en `var(--theme-sidebar)` avec du
   texte blanc — vérifier le contraste du badge `#C1533C` sur ce fond, il a été calculé sur blanc.
2. Rendre `DashboardTopBar` sur toutes les tailles et retirer la barre mobile de la sidebar, en
   reportant le bouton menu dedans. Plus cohérent, mais plus risqué.

**L'option 1 est recommandée** pour un premier jet.

### Duplication de requête à éviter

Le layout devra charger `getReminders()` pour alimenter la cloche. Or la page tableau de bord les
charge déjà via `getDashboardOverviewData()`. Sans précaution : deux requêtes identiques à chaque
visite de `/dashboard`.

Envelopper `getReminders` dans `cache()` de React pour dédupliquer sur le rendu d'une même requête.
Vérifier au passage si d'autres lectures du layout et des pages se recoupent (`getAppointments`,
`getClientPickerOptions`).

Ne pas passer les rappels en prop à travers plusieurs niveaux : suivre le modèle
`AppointmentsProvider` déjà en place dans le layout.

### Pages concernées

Une fois dans le layout, la cloche apparaît automatiquement sur `/dashboard` et ses sous-routes :
agenda, clients (et `clients/[id]`), tournées, carte, rappels, prestations, statistiques, paramètres,
admin. Rien à modifier page par page.

**Exclusion :** vérifier `/dashboard/admin`, dont le contexte diffère. Confirmer que la cloche y a du
sens avant de la laisser.

### Points de vigilance

- La recherche client est en `hidden sm:block` dans le header actuel — conserver ce comportement dans `DashboardTopBar`.
- Le panneau est en `absolute right-0` : vérifier qu'il ne déborde pas du viewport sur les pages à conteneur étroit.
- La carte (`/dashboard/carte`) utilise Leaflet, qui applique ses propres `z-index` élevés. Le panneau est en `z-50` : contrôler qu'il passe bien au-dessus de la carte.
- Le panneau doit se fermer à chaque changement de route.

## B3. Temps réel

À trancher, par ordre de coût croissant :

1. **Rafraîchissement périodique** — `router.refresh()` toutes les 60 s quand l'onglet est visible
   (`document.visibilityState`). Quelques lignes, résout 90 % du besoin pour un praticien seul.
2. **Server-Sent Events** — une route qui pousse les nouveaux événements. Adapté au sens unique
   serveur → client, mais tient mal sur du serverless (Neon + fonctions courtes).
3. **WebSocket** — surdimensionné ici.

**Recommandation : l'option 1.** Le volume est faible et le besoin est « voir arriver une demande
dans la minute », pas « à la milliseconde ». Ne pas construire d'infrastructure temps réel pour ça.

## B4. Lu / non lu (optionnel, à valider avant de commencer)

Nécessite une table `Notification` en base et une migration Prisma — utiliser les skills
`prisma-cli` (lire `references/agent-safety.md` **avant** toute migration) et `prisma-client-api`.

Modèle minimal : `id`, `userId`, `type`, `entityType`, `entityId`, `title`, `body`, `readAt`,
`createdAt`. Émission depuis `submitPublicBookingAction` et depuis la logique de rappels.

**Ne pas commencer sans validation explicite.** C'est un vrai changement d'architecture ; les
corrections B2 et le rafraîchissement B3 apportent déjà l'essentiel de la valeur.

---

## Tests attendus (Playwright)

1. Une action réussie affiche un toast de succès qui disparaît seul.
2. Une action en échec affiche un toast d'erreur qui **persiste** jusqu'à fermeture.
3. Plusieurs actions rapprochées empilent les toasts sans en perdre.
4. Le toast est annoncé par la technologie d'assistance (vérifier la région live et son rôle).
5. Le panneau de notifications s'ouvre, se ferme par `Échap`, et rend le focus au bouton.
6. Le badge affiche `99+` au-delà de 99.
7. Le compteur du badge correspond au nombre d'éléments réellement atteignables.
8. Le panneau reste utilisable à 375 px sans déborder du viewport.
9. La cloche est présente et fonctionnelle sur agenda, clients, tournées, rappels et prestations.
10. Sur `/dashboard/carte`, le panneau s'affiche bien au-dessus de la carte Leaflet.
11. Le panneau se ferme lors d'un changement de route.
12. À 375 px, une seule barre d'en-tête est visible, pas deux.

## Définition de terminé

- [ ] `npm run lint` et `npx tsc --noEmit` sans erreur
- [ ] `npm test` vert
- [ ] Plus aucun `useState` nommé `feedback` dans `src/components/settings/`
- [ ] Le contournement `startsWith("Le lien")` a disparu
- [ ] Succès et erreurs sont visuellement et sémantiquement distincts partout
- [ ] Aucune couleur de toast en dur — tokens `--color-animeo-*` uniquement
- [ ] Aucun composant n'importe `sonner` directement, tout passe par `src/lib/notify.ts`
- [ ] L'erreur bloquante de `summary-steps.tsx` est restée dans le flux de la page
- [ ] Panneau de notifications entièrement utilisable au clavier
- [ ] `DashboardHeader` ne contient plus que le titre d'accueil
- [ ] La cloche est rendue une seule fois, depuis le layout, jamais dupliquée par page
- [ ] `getReminders` n'est exécutée qu'une fois par requête sur `/dashboard`
- [ ] Aucune double barre d'en-tête sur mobile
