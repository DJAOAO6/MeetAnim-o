# Audit et refonte du tunnel de réservation publique — MeetAnim'o

> À poser à la racine du repo, puis lancer Claude Code dessus.
> Prompt de démarrage suggéré :
> « Lis `AUDIT-RESERVATION.md`. Commence par la Phase 0, puis attends ma validation avant la Phase 1. »

---

## Contexte technique

- Next.js 16 (App Router, server actions), React 19, TypeScript, Tailwind v4
- Prisma 7 + Neon (Postgres serverless)
- Playwright déjà configuré (`playwright.config.ts`, un seul test dans `tests/`)
- Lire `AGENTS.md` : cette version de Next.js a des breaking changes, consulter
  `node_modules/next/dist/docs/` avant d'écrire du code.

### Périmètre

| Fichier | Rôle |
|---|---|
| `src/app/reserver/[slug]/page.tsx` | Route publique |
| `src/components/booking/public-booking-flow.tsx` | Orchestrateur des 5 écrans |
| `src/components/booking/location-service-steps.tsx` | Étape 1 — service + mode |
| `src/components/booking/details-step.tsx` | Étape 2 — propriétaire + animal (23 Ko) |
| `src/components/booking/schedule-step.tsx` | Étape 3 — date + heure |
| `src/components/booking/summary-steps.tsx` | Étape 4 + écran de succès |
| `src/components/booking/booking-ui.tsx` | Primitives partagées (`BookingField`, `BookingActions`) |
| `src/lib/appointments-actions.ts` | `submitPublicBookingAction`, `getOccupiedSlotsAction`, `hasConflict` |
| `src/lib/availability.ts` | Vraie logique de disponibilité — **non utilisée par la page publique** |
| `src/data/public-booking.ts` | Données de démo + génération des dates |

### Skills disponibles dans ce repo — à utiliser

13 skills sont installés dans `.claude/skills/` (déclarés dans `skills-lock.json`). Les utiliser
plutôt que de raisonner de mémoire.

| Skill | À utiliser pour |
|---|---|
| `ui-ux-pro-max` | Phases 3 et 5 — accessibilité, contrastes, typographie, responsive, motion |
| `web-design-guidelines` | Phase 5 — finition visuelle (Vercel Labs) |
| `vercel-react-best-practices` | Phase 4 — état, effets, patterns React 19 |
| `playwright-cli` | Tests E2E — génération, traces, mocking, projets mobiles |
| `prisma-cli` | Phase 2 — `migrate dev`, et lire `references/agent-safety.md` **avant** toute migration |
| `prisma-client-api` | Phase 2 — voir `references/transactions.md` pour la correction de la race condition |

**Chemin du script `ui-ux-pro-max`.** Son `SKILL.md` documente
`${CLAUDE_PLUGIN_ROOT}/.claude/skills/ui-ux-pro-max/scripts/search.py`, mais il est installé
directement dans ce repo. Depuis la racine du projet, la commande réelle est :

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<requête>" --domain ux
```

Le skill dispose d'un catalogue `nextjs` (`data/stacks/nextjs.csv`) : utiliser `--stack nextjs`
pour le guidage d'implémentation, jamais un défaut générique.

Son contrat de requête impose une intention dominante par recherche, 2 à 5 termes utiles, et une
vérification du résultat avant application. Pour l'accessibilité : interroger d'abord le résultat
observable (`"error summary validation" --domain ux`), puis seulement la stack. Ne pas accepter un
résultat générique pour un critère WCAG précis. Ses résultats sont des recommandations — le présent
document et les règles du repo priment.

### Règles à respecter

1. **Ne rien casser côté dashboard.** `saveAppointmentAction` et `updateAppointmentStatusAction` partagent `hasConflict` avec le flux public : toute correction doit valoir pour les deux.
2. **Une phase = une série de commits atomiques.** Pas de refonte massive en un seul diff.
3. **`npm run lint` et `npx tsc --noEmit` doivent passer** après chaque phase.
4. Ne pas introduire de nouvelle dépendance sans la justifier.
5. Toute migration Prisma passe par `prisma migrate dev`, jamais par une édition manuelle du schéma déjà migré.

---

## Phase 0 — Reconnaissance (aucune modification)

Avant de toucher au code, produire `AUDIT-FINDINGS.md` contenant :

1. Le parcours utilisateur réel, étape par étape, avec la liste exacte des champs demandés et ceux qui sont obligatoires.
2. La traçabilité de la donnée : d'où vient chaque valeur affichée (base, `getBusinessProfile`, ou `src/data/public-booking.ts` en dur).
3. La confirmation ou l'infirmation de chacun des constats listés plus bas, avec fichier et ligne.
4. Tout problème supplémentaire trouvé, classé selon la même grille.

Puis **s'arrêter et attendre validation.**

---

## Constats à vérifier et corriger

Gravité : **P0** = corrige avant toute mise en production · **P1** = important · **P2** = amélioration.

### A. Logique métier et intégrité des données

- **[P0] Les créneaux affichés ne viennent pas des vraies disponibilités.**
  `src/data/public-booking.ts:205-206` définit `bookingStartDate = new Date(2026, 7, 25)` et
  `bookingLimitDate = new Date(2026, 10, 24)`, avec des horaires codés en dur dans `slotsByWeekday`.
  `getDayAvailability()` (`src/lib/availability.ts`), alimentée par le profil métier, n'est jamais
  appelée depuis le tunnel public. Conséquences : vacances (`availability.vacations`) et fermetures
  exceptionnelles (`availability.closures`) ignorées, horaires réels ignorés, et **après le
  24/11/2026 la page affiche « Aucun créneau n'est disponible »**.
  → Générer les dates côté serveur à partir de la vraie disponibilité, sur une fenêtre glissante
  (ex. J+1 → J+90) calculée à chaque requête.

- **[P0] Les rendez-vous peuvent se chevaucher.**
  `hasConflict()` (`appointments-actions.ts:55`) ne compare que `date` + `start` exact, sans jamais
  utiliser `duration`. Un rendez-vous de 60 min à 09:00 laisse 09:30 réservable. Même erreur côté
  client : `availableSlots` dans `schedule-step.tsx` filtre par égalité stricte sur `start`.
  → Comparer des intervalles `[start, start + duration)`. Appliquer la correction aux deux appelants.

- **[P0] Aucune validation serveur de l'entrée publique.**
  `submitPublicBookingAction` valide `owner`, `animal` et `geo` via Zod, mais laisse passer sans
  contrôle `date`, `start`, `duration`, `price`, `serviceName` et `mode`. Il est donc possible de
  poster une date passée, une durée arbitraire, ou un prix à 0 €.
  → Schéma Zod pour l'entrée complète. **Recalculer `price` côté serveur** depuis
  `getPublicServices()` + les frais de déplacement, ne jamais faire confiance à la valeur du client.
  Vérifier que le service existe, que le mode est activé (`cabinetEnabled` / `homeEnabled`), et que
  la date est dans le futur et dans la fenêtre de réservation.

- **[P0] Aucun rate limiting sur l'action publique.**
  `src/lib/rate-limit.ts` existe et protège déjà le login et le reset de mot de passe, mais rien ne
  protège `submitPublicBookingAction` — qui crée en cascade `Client`, `Animal` et `Appointment`.
  → Limiter par IP et par email. Prévoir aussi un piège anti-bot discret (honeypot ou délai minimum
  de remplissage) plutôt qu'un captcha.

- **[P1] Race condition assumée mais non corrigée.**
  Le commentaire au-dessus de `hasConflict` reconnaît qu'il n'y a ni contrainte unique ni
  transaction. Deux soumissions simultanées sur le même créneau passent toutes les deux.
  → Index unique partiel sur `(date, start)` pour les statuts ≠ `CANCELLED`, ou transaction, avec
  gestion propre de l'erreur de contrainte renvoyée à l'utilisateur.

- **[P1] Décalage de fuseau horaire.**
  `toDate()` construit la date en UTC (`${dateId}T00:00:00.000Z`) alors que `toDateId()` côté client
  utilise l'heure locale du navigateur. Un client hors métropole peut réserver un jour décalé.
  → Fixer explicitement le fuseau du praticien (`Europe/Paris`) et normaliser des deux côtés.

- **[P1] `getOccupiedSlotsAction` est publique, non limitée et large.**
  Elle expose l'occupation de l'agenda sur toute la fenêtre en un appel, sans authentification ni
  limite de débit. Pas de fuite d'identité, mais fuite d'information métier et scan trivial.
  → Restreindre la plage demandée, limiter le débit, ne renvoyer que le mois consulté.

- **[P1] Données de démo mélangées aux données réelles.**
  `loadProfessional()` part de `bookingProfessionals[0]` puis écrase certains champs avec le vrai
  profil. Les `zones` — et donc les **frais de déplacement facturés** — viennent toujours de la
  donnée de démo. Idem `publicBookingTours` et `publicBookingMapClients` dans `schedule-step.tsx`.
  → Faire venir zones et tournées de la base, ou masquer la fonctionnalité tant que ce n'est pas le cas.

### B. Confiance, conformité, communication

- **[P0] Mention trompeuse.** Le pied de page de `public-booking-flow.tsx` affiche « Aucune donnée
  n'est envoyée pour cette démonstration » alors que la soumission crée réellement un `Client`, un
  `Animal` et un `Appointment` en base. À supprimer.

- **[P0] Lien de politique de confidentialité mort.** Dans `summary-steps.tsx`, « Politique de
  confidentialité » est un `<span>` stylé comme un lien, sans destination. La case de consentement
  RGPD renvoie donc vers rien. Créer la page et le lien (nouvel onglet).

- **[P1] Écart de prix inexpliqué.** Le récapitulatif affiche une ligne « Consultation » puis un
  « Total estimé » qui inclut `travelFee`, sans jamais afficher de ligne « Frais de déplacement ».
  Le client voit deux nombres différents sans explication.

- **[P1] Aucun email de confirmation.** `src/lib/email` existe. Le seul retour est l'écran de succès,
  perdu au moindre rafraîchissement. Envoyer un email au client **et** une notification au praticien.

- **[P2] Écran de succès pauvre.** Pas de référence de demande mise en avant, pas de lien
  « ajouter au calendrier » (.ics), aucun moyen d'annuler ou de modifier.

### C. Accessibilité (cible WCAG 2.1 AA / RGAA)

- **[P1] Labels implicites sur des widgets composés.** `BookingField` (`booking-ui.tsx:7`) enveloppe
  son contenu dans un `<label>` sans `htmlFor`. Acceptable pour un `<input>` simple, cassé pour
  `breed-combobox`, `birth-date-picker` et le sélecteur d'espèce. **Aucun `htmlFor` dans tout le
  dossier `booking/`.**
  → `id` généré + `htmlFor`, et `aria-describedby` pour le hint et le message d'erreur.

- **[P1] Erreurs de saisie non annoncées.** Aucun `aria-invalid` sur les champs en erreur. Le
  `role="alert"` est placé dans le label et se redéclenche à chaque rendu.

- **[P1] Changement d'étape silencieux.** Le passage d'un écran à l'autre ne déplace pas le focus et
  n'annonce rien. Un utilisateur au lecteur d'écran reste sur un bouton qui a disparu.
  → Déplacer le focus sur le titre de la nouvelle étape (`tabIndex={-1}`) et annoncer via `aria-live`.

- **[P1] Contrastes à mesurer et corriger.** Suspects : `text-white/75` et `text-white/80` sur
  `bg-animeo` (#4FAF9F) dans les cartes de dates recommandées, `text-animeo-muted` sur blanc, et
  `disabled:opacity-70` sur le bouton principal. Mesurer chaque paire, viser 4.5:1 (3:1 pour le
  texte large).

- **[P2] Sélecteurs de date et d'heure.** Grilles de `<button aria-pressed>` sans `role="group"` +
  `aria-labelledby`, et sans navigation aux flèches. Envisager le pattern grille de calendrier.

- **[P2] Faux lien.** Le `<span className="underline">` de la politique de confidentialité imite un
  lien sans être atteignable au clavier — corrigé en même temps que le point B.

- **[P2] Focus visible.** Les boutons de créneaux ne définissent qu'un style `hover`. Ajouter un
  `focus-visible` explicite et contrasté partout.

### D. Parcours et friction

- **[P0] Toute la saisie est perdue en cas de rafraîchissement.** Tout l'état vit dans `useState`
  dans `public-booking-flow.tsx`, sans persistance ni synchronisation avec l'URL. Un rafraîchissement,
  une notification, un appel entrant → tout est à refaire.
  → Persister l'état (sessionStorage) et créer une entrée d'historique par étape.

- **[P0] Le bouton Retour du navigateur quitte la page.** Aucune entrée d'historique n'est poussée
  entre les étapes. Le réflexe le plus courant sur mobile fait sortir du tunnel.

- **[P1] Ordre des étapes contre-productif.** `details-step.tsx` (23 Ko) demande identité, téléphone,
  email, adresse complète, espèce, race, date de naissance et motif **avant** que l'utilisateur ait
  vu le moindre créneau. C'est le point d'abandon le plus probable.
  → Tester l'inversion : service → créneau → coordonnées. Réduire aussi le nombre de champs
  obligatoires au strict nécessaire pour une *demande* (le reste peut être collecté après validation).

- **[P1] Le créneau n'est pas réservé pendant la saisie.** L'erreur « ce créneau vient d'être
  réservé » ne peut apparaître qu'après le formulaire entier.
  → Verrou temporaire (5–10 min) à la sélection, avec compte à rebours visible ; ou au minimum
  revérifier la disponibilité au passage à l'étape suivante plutôt qu'à la fin.

- **[P1] Réinitialisations silencieuses.** Changer de service (`onServiceChange`) efface le mode,
  l'adresse, la date et l'heure sans aucun avertissement. Idem `changeMode` et `changeAddress`.

- **[P2] Échec réseau masqué.** Si `getOccupiedSlotsAction` échoue, le `catch` est vide : tous les
  créneaux apparaissent libres, y compris ceux qui sont pris. Afficher un état dégradé explicite.

### E. Responsive et rendu

- **[P1] Barre d'actions collée à la barre système iOS.** `BookingActions` est en `sticky bottom-0`
  sans `env(safe-area-inset-bottom)`.

- **[P1] Curseur de progression qui déborde.** Le point de `BookingProgress` est positionné en
  `left: {percent}%` avec `-translate-x-1/2` : il déborde du conteneur à 0 % et à 100 %.

- **[P2] Grille de dates trop longue sur mobile.** `grid-cols-2` avec `min-h-24` sur trois mois de
  dates impose un défilement considérable. Envisager une vue calendrier mensuelle compacte.

- **[P2] Débordement horizontal non signalé.** Le sélecteur de mois est en `overflow-x-auto` sans
  indicateur visuel qu'il y a d'autres mois à droite.

- **[P2] Contrôler tout le tunnel à 320, 375, 768 et 1440 px**, y compris les états d'erreur, de
  chargement et « aucun créneau ».

---

## Ordre d'exécution demandé

| Phase | Contenu | Livrable |
|---|---|---|
| **0** | Reconnaissance, aucune modification | `AUDIT-FINDINGS.md` + validation |
| **1** | Sécurité serveur : validation Zod complète, prix recalculé, rate limiting, retrait de la mention trompeuse | Commits + tests unitaires |
| **2** | Intégrité : chevauchements, disponibilités réelles, fuseau, contrainte unique — *skills `prisma-cli`, `prisma-client-api`* | Migration Prisma + tests |
| **3** | Accessibilité : labels, erreurs, focus, contrastes — *skill `ui-ux-pro-max`, domaine `ux`* | Rapport avant/après |
| **4** | Friction : persistance d'état, historique navigateur, ordre des étapes — *skill `vercel-react-best-practices`* | Commits |
| **5** | Responsive et finition visuelle — *skills `ui-ux-pro-max` (`--stack nextjs`) et `web-design-guidelines`* | Captures avant/après |
| **6** | Emails de confirmation et écran de succès | Commits |

À la fin de chaque phase : résumé de ce qui a changé, ce qui reste, et ce qui a été volontairement écarté.

---

## Tests attendus (Playwright, `tests/`)

Le projet n'a qu'un seul test aujourd'hui. Utiliser le skill `playwright-cli` (génération de tests,
traces, mocking réseau, `storage-state`). Ajouter au minimum :

1. **Parcours nominal** cabinet, de la première étape à l'écran de succès.
2. **Parcours nominal** domicile avec autocomplétion d'adresse.
3. **Créneau pris entre-temps** : le message d'erreur s'affiche et l'utilisateur peut choisir un autre horaire.
4. **Chevauchement** : un soin de 60 min à 09:00 rend 09:30 indisponible.
5. **Validation serveur** : une soumission forgée avec un prix à 0 € ou une date passée est rejetée.
6. **Rafraîchissement en cours de tunnel** : la saisie est conservée.
7. **Navigation clavier** : parcours complet sans souris, focus visible à chaque étape.
8. **Mobile** : ajouter un projet Playwright `devices["iPhone 13"]` et rejouer le parcours nominal.

## Définition de terminé

- [ ] `npm run lint` et `npx tsc --noEmit` sans erreur
- [ ] `npm test` vert, y compris les nouveaux tests
- [ ] Aucune donnée de démo (`bookingProfessionals`, `publicBookingTours`, `publicBookingMapClients`, `slotsByWeekday`) n'alimente plus une valeur affichée ou facturée
- [ ] Aucun prix ni durée provenant du client n'est enregistré tel quel
- [ ] Contrastes mesurés et conformes AA sur l'ensemble du tunnel
- [ ] Parcours complet réalisable au clavier seul
- [ ] Page de politique de confidentialité existante et liée
- [ ] Les recommandations retenues de `ui-ux-pro-max` sont tracées dans le rapport de phase, avec la
      requête utilisée et la raison de l'écart quand une recommandation a été écartée
