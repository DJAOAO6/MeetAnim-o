# Plan de correction — Animéo

Basé sur `AUDIT_COMPLET.md`. Ordre recommandé : Sprint 1 avant tout le reste — les P0 touchent soit la sécurité de session, soit une fonctionnalité qui trompe activement l'utilisateur (Tournées), soit l'accès de base pour une catégorie entière d'utilisateurs (clavier).

Statuts : 🔴 À corriger · 🟠 En cours · 🟢 Corrigé et testé · ⚪ À vérifier

---

## SPRINT 1 — CRITIQUE (P0 / P1) — ✅ TERMINÉ (2026-08-29)

Objectif : plus aucun bug qui trompe l'utilisateur sur l'état réel de ses données, plus aucun blocage total (session ou clavier).

1. 🟢 **P0-1** — Supprimer le cookie de session dans `dal.ts`/`requireUser()` avant la redirection vers `/login`, pour casser la boucle infinie.
2. 🟢 **P0-2** — Implémenter les server actions manquantes pour `Tour`/`Zone` (création, modification, activation/désactivation, suppression) et les brancher dans `tours-view.tsx` à la place de l'état local.
3. 🟢 **P0-3** — Créer un hook de piège de focus réutilisable (focus initial, cycle `Tab` interne, `Échap`, retour de focus au déclencheur) et l'appliquer aux 9 modales listées dans l'audit.
4. 🟢 **P1-4** — Assombrir le token de couleur teal utilisé en texte/fond de bouton pour atteindre 4,5:1 ; revérifié avec axe-core sur les 4 pages déjà scannées.
5. 🟢 **P1-5** — Sélecteur de date de naissance : ouverture sur clic/Entrée explicite uniquement, jamais sur `onFocus`.
6. 🟢 **P1-6** — Réduit l'empreinte verticale du cluster de boutons flottants sur mobile (empilement horizontal, boutons plus petits) — le `padding-bottom` initialement envisagé ne fonctionnait pas pour le contenu chevauché en milieu de page ; voir le détail dans AUDIT_COMPLET.md.
7. 🟢 **P1-7** — Créé `createClientAction`/`updateClientAction`/`createAnimalAction` et remplacé les 3 stubs (« Nouveau client », « Modifier », « Ajouter un animal »).
8. 🟢 **P1-8** — Appliqué le même `canEdit={hasPermission(...)}` que `/dashboard/parametres` à `/dashboard/prestations`.
9. 🟢 **P1-9** — Le widget « Demandes de rendez-vous » de l'agenda précise désormais explicitement sa portée au lieu d'affirmer « tout traité » à tort.
10. 🟢 **P1-10** — Condition de course sur l'ouverture de la section « Adresse » corrigée (le clic sur un en-tête n'annule plus l'ouverture déclenchée par le `blur` du champ précédent).

**Vérifications effectuées après ce sprint** : `npm run lint`, `npx tsc --noEmit`, `npm run test:unit` (50/50), `npm run build`, et la suite E2E (`npm test`, par lots pour éviter la limitation de débit de connexion propre à l'environnement de test) — tous verts, à l'exception d'un échec préexistant et documenté, sans rapport avec ces corrections (dérive de date dans les données de démonstration de disponibilité). Chaque correction a été revérifiée manuellement en conditions réelles (Playwright), desktop et mobile quand l'interface était concernée, avec nettoyage systématique des données de test créées. `AUDIT_COMPLET.md` a été mis à jour (statuts, scores, fiches de maturité).

---

## SPRINT 2 — EXPÉRIENCE UTILISATEUR (UX / UI / responsive / accessibilité)

11. ⚪ **P2-11** — Vérifié le 2026-08-29, ne se reproduit pas comme défaut visible : `documentElement.scrollWidth` dépasse le viewport (particularité Chromium liée au conteneur `overflow-x:auto` imbriqué) mais `body`, `getBoundingClientRect()` et une capture d'écran après scroll forcé confirment l'absence de tout débordement visuel réel. Aucune correction de code nécessaire — voir la note détaillée dans AUDIT_COMPLET.md.
12. 🟢 **P2-12** — `--theme-muted` assombri à `#5C6A74` (globals.css + valeur inline concurrente dans dashboard-theme-provider.tsx, même schéma que P1-4) ; vérifié avec axe-core sur 5 pages, 0 violation restante liée à ce token.
13. 🟢 **P2-13** — `aria-label` + `role="search"` ajoutés au champ de recherche global de l'en-tête ; vérifié avec axe-core et test fonctionnel de bout en bout (saisie → navigation).
14. ⚪ **P2-17** — Vérifié le 2026-08-29, ne se reproduit pas : `finishDrag()` réinitialise déjà l'état visuel de façon inconditionnelle avant toute validation. Testé sur un vrai conflit et un vrai créneau fermé, aucune carte ne reste figée. Aucune correction de code nécessaire — voir la note détaillée dans AUDIT_COMPLET.md.
15. **P3-30 / P3-31** — 🟢 P3-30 : `minWidth: 24px` + z-index croissant par colonne sur les puces de rendez-vous chevauchantes ; vérifié avec 6 rendez-vous de test superposés, toutes les puces à 24px et individuellement ciblables. ⚪ P3-31 : non traité (déjà au-dessus du minimum légal, confort seulement, changement transversal risqué) — décision documentée dans AUDIT_COMPLET.md.
16. 🟢 **P3-32** — `fieldDescribedBy` ajouté à `settings-fields.tsx` (même pattern que le formulaire public) et câblé sur les 3 champs à indice du formulaire de rendez-vous interne ; vérifié (résolution DOM, saisie fonctionnelle, axe-core).
17. 🟢 **P3-34 / P3-35 / P3-36** — Bouton « Créer le rendez-vous »/« Enregistrer les modifications » selon le contexte ; « 1.5h30 » → « 1h30 » (`Math.floor` manquant) ; libellé accessible différencié par type d'événement sur le calendrier. Tous vérifiés en conditions réelles.
18. 🟢 **P3-33** — Reproduit puis corrigé : libellés de ville masqués sur la mini-carte compacte (`showLabels={false}`), conservés sur la carte complète des tournées. Vérifié avec une tournée de test activée et un rendez-vous positionné pour recouvrir un libellé ; donnée nettoyée après coup.
19. 🟢 **P3-37** — Hook réutilisable `useUnsavedChangesWarning` (`beforeunload` + `confirmDiscard()`) appliqué aux 8 formulaires de création/édition du tableau de bord, avec remontée d'état pour le cas imbriqué `AppointmentForm`/`GlobalAppointmentsManager`. Vérifié avec de vraies boîtes de dialogue interceptées (dirty → prompt, propre → fermeture directe, sauvegarde → pas de prompt résiduel).

**SPRINT 2 — ✅ TERMINÉ (2026-08-29)**. Bilan : P2-11 vérifié non reproductible (artefact technique sans conséquence visible) ; P2-12, P2-13, P3-30, P3-32 à P3-37 corrigés et testés ; P2-17 vérifié non reproductible (déjà corrigé structurellement) ; P3-31 non traité par choix conscient de périmètre (déjà conforme au minimum légal, confort seulement, changement transversal risqué — documenté dans AUDIT_COMPLET.md). Vérifications effectuées après ce sprint : `npx tsc --noEmit`, `npm run lint`, `npm run test:unit` (50/50), tous verts ; axe-core sur `/dashboard`, `/dashboard/agenda`, `/dashboard/clients`, `/dashboard/parametres`, `/reservation` ; captures d'écran desktop et mobile pour chaque correction visuelle ; nettoyage systématique de toutes les données de test créées pendant la vérification (appointments, blocked slots, tournée activée temporairement).

---

## SPRINT 3 — QUALITÉ (code / performance / tests)

20. 🔴 **P2-16** — Décider d'une stratégie pour les champs dénormalisés (`Appointment.clientName`/`animalName`) : soit les resynchroniser à chaque modification du client/animal source, soit les remplacer par une jointure à l'affichage si la dénormalisation n'apporte pas de bénéfice de performance mesurable.
21. 🔴 **P2-18** — Corriger le mismatch d'hydratation React sur `RevenueChart` (probablement un format de date dépendant de la locale, à figer côté serveur).
22. 🔴 **P2-19** — Ajouter une vérification de conflit (comptage des rendez-vous confirmés touchés) avant de sauvegarder une réduction de disponibilité, avec confirmation explicite si des rendez-vous existants seraient concernés.
23. 🔴 **P2-20** — Soit implémenter réellement l'effet du « Temps de déplacement » sur le calcul des créneaux disponibles, soit retirer temporairement ce réglage de l'interface tant qu'il n'a pas d'effet (ne pas laisser un réglage actif sans effet).
24. 🔴 **P2-21** — Éviter la création d'un Client/Animal orphelin pour la requête perdante d'une double réservation (créer le client seulement après confirmation que le créneau est bien obtenu, ou nettoyer si le create échoue juste après).
25. 🔴 **P2-22** — Brancher les zones réelles (`getZones()`) et leurs frais de déplacement configurés à la page de réservation publique, à la place des données figées de `data/public-booking.ts`.
26. 🔴 **P2-15** — Ajouter une limitation de débit légère sur `getOccupiedSlotsAction`, cohérente avec celle déjà en place sur la soumission de réservation.
27. 🔴 **P2-26** — Ajouter une tâche de purge (cron ou nettoyage à la volée) pour `RateLimitEvent`/`TwoFactorCode`/`PasswordResetToken`.
28. 🔴 **P2-27 / P2-28** — Supprimer `AUTH_EMAIL`/`AUTH_PASSWORD_HASH_BASE64` de `.env.local.example` et supprimer `src/components/pages/feature-placeholder.tsx`.
29. 🔴 **P2-29** — Renseigner `AuditLog.ipAddress` dans `logAudit()`, ou retirer la colonne si elle n'a pas d'usage prévu.
30. 🔴 **Couverture de tests** — ajouter des tests E2E pour les parcours critiques actuellement non couverts, dans cet ordre de priorité : (a) connexion + double authentification + verrouillage, (b) le parcours complet de réservation publique jusqu'à l'écran de succès (aucun test actuel ne le couvre de bout en bout), (c) CRUD client/animal une fois P1-7 corrigé, (d) séparation des rôles secrétariat (une fois un accès de test possible sans 2FA email), (e) gestion des tournées une fois P0-2 corrigé.

**Après ce sprint** : `npm run build` en plus des vérifications habituelles ; envisager un passage Lighthouse en mode production (`next start`) pour confirmer les temps de chargement mesurés en dev.

---

## SPRINT 4 — POLISH

31. 🔴 **P2-23 / P2-24** — Décision produit à prendre (pas une simple correction technique) : soit implémenter un canal d'envoi réel pour les rappels et des données réelles pour les statistiques, soit assumer clairement ces deux écrans comme des aperçus/maquettes dans l'interface elle-même (pas seulement en petit texte en bas de page) jusqu'à leur implémentation réelle.
32. 🔴 **P2-25** — Une fois P0-2 traité, réévaluer si `TourAppointment` reste nécessaire comme table séparée ou si une vraie relation vers `Appointment` doit la remplacer.
33. Cohérence visuelle générale : repasser sur les captures d'écran des sprints précédents pour repérer d'éventuelles incohérences mineures non cataloguées individuellement dans l'audit (espacements, tailles de texte) — ce sprint est le bon moment pour ce type de nettoyage à faible risque.

---

## Règle anti-régression (rappel, à appliquer à chaque sprint)

Avant chaque modification : comprendre le comportement actuel exact (relire le composant, si besoin le tester manuellement avant de toucher au code).

Après chaque modification :
1. Effectuer la correction.
2. Relancer `npx tsc --noEmit`, `npm run lint`, `npm run test:unit`, `npm test`.
3. Tester visuellement la fonctionnalité corrigée, desktop et mobile.
4. Vérifier les fonctionnalités directement liées et celles susceptibles d'être affectées (listées ci-dessous pour les cas non évidents) :
   - Le hook de piège de focus (P0-3) doit être revérifié sur les 3 modales qui géraient déjà correctement le focus, pour confirmer qu'elles continuent de fonctionner après la factorisation.
   - Toute correction de couleur de contraste (P1-4, P2-12) doit être revérifiée sur l'ensemble des pages qui utilisent le même token, pas seulement celle où le problème a été repéré.
   - La correction de P1-7 (création/édition client) doit être revérifiée avec la recherche de `/dashboard/clients` (P2-16 dépend du même chemin de données).
   - La correction de P0-2 (persistance des tournées) doit être revérifiée avec la carte clients et l'agenda, qui affichent tous deux des données de tournées.
5. Ne jamais marquer un problème 🟢 « Corrigé et testé » sur la seule base d'une modification de code — un test réel (manuel ou automatisé) doit confirmer le résultat attendu.
6. Si une correction introduit une régression, la corriger avant de poursuivre au problème suivant.

---

## Prochain audit

Une fois tous les problèmes retenus des 4 sprints traités : refaire l'audit complet dans les mêmes conditions (exploration réelle, pas de relecture de code seule), comparer avant/après, mettre à jour les scores de `AUDIT_COMPLET.md`. Ne jamais supposer qu'une correction fonctionne sans la retester dans le contexte réel de l'application.
