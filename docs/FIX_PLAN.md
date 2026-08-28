# Plan de correction — Animéo

Basé sur `AUDIT_COMPLET.md`. Ordre recommandé : Sprint 1 avant tout le reste — les P0 touchent soit la sécurité de session, soit une fonctionnalité qui trompe activement l'utilisateur (Tournées), soit l'accès de base pour une catégorie entière d'utilisateurs (clavier).

Statuts : 🔴 À corriger · 🟠 En cours · 🟢 Corrigé et testé · ⚪ À vérifier

---

## SPRINT 1 — CRITIQUE (P0 / P1)

Objectif : plus aucun bug qui trompe l'utilisateur sur l'état réel de ses données, plus aucun blocage total (session ou clavier).

1. 🔴 **P0-1** — Supprimer le cookie de session dans `dal.ts`/`requireUser()` avant la redirection vers `/login`, pour casser la boucle infinie.
2. 🔴 **P0-2** — Implémenter les server actions manquantes pour `Tour`/`Zone` (création, modification, activation/désactivation, suppression) et les brancher dans `tours-view.tsx` à la place de l'état local. À défaut de temps immédiat, envisager un bandeau « Fonctionnalité en construction, non sauvegardée » tant que ce n'est pas fait — ne jamais laisser une UI de sauvegarde convaincante sans backend.
3. 🔴 **P0-3** — Créer un hook de piège de focus réutilisable (focus initial, cycle `Tab` interne, `Échap`, retour de focus au déclencheur) et l'appliquer aux 9 modales listées dans l'audit.
4. 🔴 **P1-4** — Assombrir le token de couleur teal utilisé en texte/fond de bouton pour atteindre 4,5:1 ; revérifier avec axe-core sur les 4 pages déjà scannées + `/dashboard/parametres` et `/dashboard/prestations`.
5. 🔴 **P1-5** — Sélecteur de date de naissance : ouverture sur clic/Entrée explicite uniquement, jamais sur `onFocus`.
6. 🔴 **P1-6** — Ajouter un `padding-bottom` mobile au conteneur de page pour libérer la zone occupée par les boutons flottants.
7. 🔴 **P1-7** — Créer `createClientAction`/`updateClientAction`/`createAnimalAction` et remplacer les 3 stubs (« Nouveau client », « Modifier », « Ajouter un animal »).
8. 🔴 **P1-8** — Appliquer le même `canEdit={hasPermission(...)}` que `/dashboard/parametres` à `/dashboard/prestations`.
9. 🔴 **P1-9** — Corriger le texte du widget « Demandes de rendez-vous » de l'agenda (ou le rendre global) pour ne plus affirmer « tout traité » quand ce n'est vrai que pour la semaine affichée.
10. 🔴 **P1-10** — Investiguer et corriger la condition de course sur l'ouverture de la section « Adresse » du formulaire de réservation (timing entre validation différée du champ précédent et clic sur l'en-tête suivant).

**Après ce sprint** : relancer `npm run lint`, `npx tsc --noEmit`, `npm run test:unit`, `npm test` ; retester manuellement chaque correction desktop + mobile ; vérifier l'absence de régression sur les fonctionnalités directement liées (ex. : le hook de piège de focus ne doit pas casser les 3 modales qui fonctionnaient déjà) ; mettre à jour `AUDIT_COMPLET.md` et ce fichier.

---

## SPRINT 2 — EXPÉRIENCE UTILISATEUR (UX / UI / responsive / accessibilité)

11. 🔴 **P2-11** — Corriger la fuite de débordement horizontal à 1280px/768px (le contenu large doit rester confiné à son propre défilement interne, pas remonter au document).
12. 🔴 **P2-12** — Assombrir légèrement le token de texte atténué (gris secondaire) pour dépasser 4,5:1.
13. 🔴 **P2-13** — Ajouter un `aria-label` ou un `<label>` masqué au champ de recherche global de l'en-tête.
14. 🔴 **P2-17** — Réinitialiser l'état visuel (opacité/bordure) d'une carte de rendez-vous glissée quand le dépôt est rejeté, sans attendre un rechargement.
15. 🔴 **P3-30 / P3-31** — Revoir la taille des puces de rendez-vous qui se chevauchent et des boutons/filtres sous 44px, en priorisant d'abord la puce qui échoue réellement au minimum légal WCAG (24px).
16. 🔴 **P3-32** — Étendre l'association `aria-describedby` déjà utilisée sur le formulaire de réservation publique au formulaire interne de rendez-vous.
17. 🔴 **P3-34 / P3-35 / P3-36** — Microcopie : libellé du bouton de sauvegarde selon création/édition, correction de « 1.5h30 », libellé accessible du créneau bloqué.
18. 🔴 **P3-33** — Corriger le chevauchement du badge sur la mini-carte du tableau de bord.
19. 🔴 **P3-37** — Ajouter un avertissement de perte de saisie (`beforeunload` ou confirmation) sur les formulaires de création/édition du tableau de bord.

**Après ce sprint** : re-scanner avec axe-core les mêmes 4 pages + les pages touchées ; retester au clavier les parcours corrigés ; captures d'écran desktop (1440/1280) et mobile (390/320) ; mettre à jour les deux documents.

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
