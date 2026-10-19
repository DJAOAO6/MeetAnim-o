# Audit 2026-10 — Phase 4 : protection des données et conformité

*Établi le 19 octobre 2026 sur le commit `08034d3`. Lecture du code, plus trois essais rejouables sur la base de test locale. Aucune requête vers la production, aucun e-mail envoyé, aucun appel réel à un service tiers.*

**Je ne suis pas juriste.** Ce document confronte le code à ce que demandent le RGPD et la loi française, tels que je les comprends. Chaque point marqué ⚖️ est une **interprétation à faire valider** par un professionnel du droit, ou à vérifier sur cnil.fr. Rien ici ne doit être lu comme un avis juridique certain.

**Preuves.**

- Le code, cité `fichier:ligne`.
- `tests/audit/rgpd-donnees-client.spec.ts` (nouveau) : suppression d'un client et annuaire envoyé à chaque page. **Rouge = défaut prouvé**, comme en phase 3. Au 19 octobre : **2 rouges** (`RGPD-03`, `RGPD-08`).
- `tests/audit/rgpd-traceurs.spec.ts` (nouveau) : inventaire des cookies, du stockage du navigateur et des services tiers contactés. Toute requête vers un autre hôte que le serveur de test est **relevée puis bloquée** : aucune ne part réellement. Au 19 octobre : **2 verts**.
- Cible contrôlée avant les essais : hôte `localhost`, base `animeo_test`, table `_TestDatabase` présente, compte ni super-utilisateur ni dispensé du filtrage par ligne. Après les essais : 0 client, 0 rendez-vous, 0 arrêt, 0 tournée, 0 compte rendu, 0 ligne de journal résiduels ; permission et jeton d'agenda du compte de test revenus à leur valeur.
- Rejouer : `npm run test:e2e -- --project=setup`, puis `npm run test:e2e -- tests/audit/rgpd-*.spec.ts --project=chromium`.

Identifiants : `RGPD-xx`. Les constats des phases précédentes (`SEC-`, `FONC-`, `EXP-`, `TEST-`) sont cités sans être réécrits.

---

## En clair, pour Loïc

1. **Il manque les papiers qui encadrent la relation avec les professionnels.** Pas de conditions d'utilisation, pas de contrat de sous-traitance, pas de mentions légales. Le RGPD exige un contrat écrit entre un professionnel et le logiciel qui garde les données de ses clients. C'est la première chose à faire avant d'ouvrir à quelqu'un d'extérieur, et ce n'est pas du code.
2. **« Supprimer définitivement » un client ne l'efface pas.** Son nom, son adresse, la position GPS de son domicile et les notes restent dans ses rendez-vous, ses arrêts de tournée et ses comptes rendus ; le flux d'agenda et Google Agenda continuent de les publier. L'écran promet le contraire. Prouvé par un test.
3. **Chaque page de l'espace professionnel envoie au navigateur l'annuaire complet des clients** (téléphone, e-mail, adresse), même la page des tarifs. Prouvé par un test. Un téléphone perdu ou un ordinateur partagé expose tout le fichier.
4. **La politique de confidentialité affichée aux clients ne dit pas la vérité sur plusieurs points** : elle affirme que seul le professionnel voit les données, n'indique aucune durée, et ne cite ni l'hébergeur, ni le service d'e-mails, ni Google, ni les cartes.
5. **Rien n'est jamais purgé**, sauf les traces de sécurité de moins d'un jour. Clients inactifs, demandes refusées, journal avec les adresses IP des visiteurs : tout est gardé sans limite.
6. **Un professionnel ne peut pas remettre à un client la copie de ses données** depuis l'écran.
7. **En cas de fuite, rien n'alerte et aucune procédure n'est écrite**, alors que le délai légal pour prévenir la CNIL est de 72 heures.

Ce qui tient : l'effacement d'un espace entier est complet et prouvé ; les mots de passe, codes et jetons sont stockés hachés ou chiffrés ; les adresses e-mail sont masquées dans les compteurs et les journaux ; aucun cookie publicitaire ni de mesure d'audience ; les polices sont servies par le site lui-même.

---

## 1. Ce qui se règle dans le code, ce qui relève de Loïc

| Constat | Niveau | Dans le code | Document ou démarche (Loïc) |
|---|---|---|---|
| `RGPD-01` Pas de CGU ni de contrat de sous-traitance | **P0** | Faire accepter CGU et contrat à l'inscription, avec date et version enregistrées | Rédiger CGU/CGV et contrat de sous-traitance (art. 28) ⚖️ |
| `RGPD-02` Pas de mentions légales | **P0** | Une page et un lien en pied de page | Fournir l'identité de l'éditeur et de l'hébergeur ⚖️ |
| `RGPD-03` Supprimer un client ne l'efface pas | **P0** | Effacer ou anonymiser rendez-vous, arrêts, comptes rendus, événements Google ; corriger le texte de confirmation | Décider ce qui doit être conservé et pourquoi ⚖️ |
| `RGPD-04` Politique de confidentialité inexacte | P1 | Rendre la page fidèle (destinataires, durées, droits, base légale) | Valider le texte ⚖️ |
| `RGPD-05` Case « J'accepte » ni vérifiée ni enregistrée | P2 | Selon la base légale retenue : retirer la case, ou enregistrer le consentement | Choisir la base légale ⚖️ |
| `RGPD-06` Aucune durée de conservation, aucune purge | P1 | Purges planifiées (clients inactifs, demandes refusées, journal, sessions) | Fixer les durées ⚖️ |
| `RGPD-07` Pas d'export des données d'un client | P1 | Export d'une fiche (lisible et réutilisable) | — |
| `RGPD-08` Annuaire complet envoyé à chaque page | P1 | Charger les clients à la demande | — |
| `RGPD-09` Sous-traitants et transferts non établis | P1 | Héberger photos et fonds de carte, ou les déclarer | Liste, pays, contrats, localisation de l'hébergeur |
| `RGPD-10` Données des clients envoyées à Google Agenda | P2 | Choix d'un contenu minimal ; effacement à la suppression | Le dire dans le contrat de sous-traitance |
| `RGPD-11` Assistance sans information du professionnel | P2 | Prévenir le professionnel à chaque assistance | L'écrire dans le contrat |
| `RGPD-12` Photos d'animaux gardées dans le navigateur | P3 | Les enregistrer en base (le champ existe) | — |
| `RGPD-13` Ni détection ni procédure en cas de fuite | P1 | Alertes sur les événements anormaux (voir `EXP-02`) | Procédure de violation écrite |
| `RGPD-14` Pas de registre des traitements | P1 | — | Registre (art. 30.1 et 30.2) ⚖️ |
| `RGPD-15` Identité d'une personne nommée dans le dépôt public | P2 | Données fictives dans le peuplement et les tests | Accord de la personne, ou dépôt privé |
| `RGPD-16` Une réservation se rattache à une fiche par la seule adresse e-mail | P3 | Ne pas fusionner sans contrôle | — |
| `RGPD-17` Rappels et relances sans moyen de s'y opposer | P3 | Mention et lien d'opposition | Qualifier les relances ⚖️ |

---

## 2. Rôles et documents contractuels

**Cadre** ⚖️ : pour les données des clients et de leurs animaux, chaque professionnel est **responsable du traitement** et 1002 Pattes est son **sous-traitant** (RGPD art. 28) — c'est aussi la lecture de `docs/RGPD-EFFACEMENT.md`. Pour les comptes des professionnels (identité, connexions, journal), 1002 Pattes est **responsable du traitement**.

**Ce que le code montre** :

- L'inscription d'un professionnel (`/inscription/[token]`, `acceptInvitationAction`, `src/lib/platform/invitation-actions.ts:110`) crée l'espace et son compte **sans rien faire accepter** : ni conditions d'utilisation, ni contrat de sous-traitance, ni politique de confidentialité de la plateforme.
- Recherche de `CGU`, `CGV`, `conditions générales`, `mentions légales`, `sous-traitan`, `accord de traitement` dans `src/` : **aucun résultat**. Aucun document de ce type dans `docs/`.
- Aucune page n'informe un professionnel de ce que 1002 Pattes fait de **ses** données (adresse IP et navigateur dans `Session.userAgent` et `AuditLog.ipAddress`, journal de ses actions, accès de la plateforme par l'assistance).

Voir `RGPD-01` et `RGPD-02`.

---

## 3. Sous-traitants ultérieurs et transferts hors de l'Union européenne

*Obtenu par : relevé des hôtes appelés dans `src/` (phase 0, §4.2, revérifié), et observation réelle du navigateur (`rgpd-traceurs.spec.ts`). Pays et bases de transfert : **non vérifiés** dans les conditions de chaque service ; ce qui suit est à confirmer un par un.* ⚖️

| Service | Qui l'appelle | Données transmises | Pays (à vérifier) | Base du transfert |
|---|---|---|---|---|
| Hébergeur de l'application et de la base (Iridflow) | — | **toutes** | **non vérifié** (phase 0, §5) | contrat à établir |
| Mailjet | serveur (`src/lib/email/provider.ts:72`) | adresses e-mail des clients et des professionnels ; contenu des messages, dont nom du client, de l'animal, horaires, téléphone (`appointments-actions.ts`, envoi au professionnel) | France / UE annoncés par le prestataire — à vérifier | contrat du prestataire |
| IGN Géoplateforme (`data.geopf.fr`) | serveur | **adresses des clients** à géocoder (`src/lib/maps/geocoding-provider.ts:12`), saisies de la recherche d'adresse (`api/address-search`) | France (établissement public) | — |
| IGN Géoplateforme, photos aériennes | **navigateur** du professionnel (`real-map.tsx:53`) | adresse IP, zone regardée | France | — |
| `geo.api.gouv.fr` | serveur | noms et codes de communes, aucune donnée personnelle | France | — |
| HeiGIT — openrouteservice (`api.heigit.org`) | serveur (`routing-provider.ts:12`, `optimization-provider.ts:8`) | **positions des arrêts de tournée**, donc des domiciles des clients, sans nom | Allemagne | contrat ou conditions à vérifier |
| Google Agenda | serveur, si le professionnel le connecte | **nom, téléphone, e-mail du client, adresse du domicile**, animal, prestation (`src/lib/calendar/calendar-sync.ts:50-69`) | États-Unis possibles | ⚖️ à établir (cadre UE–États-Unis ou clauses types) |
| OpenStreetMap, tuiles du plan (`*.tile.openstreetmap.org`) | **navigateur**, y compris celui du **visiteur anonyme de la page de réservation** (observé) | adresse IP, zone regardée | Royaume-Uni (fondation) et réseau de diffusion — à vérifier | ⚖️ |
| OpenFreeMap (`tiles.openfreemap.org`) | navigateur du professionnel, page Tournées (`src/lib/maps/map-utils.ts:7`) | adresse IP, zone regardée | **non vérifié** (éditeur et pays) | ⚖️ |
| Unsplash (`images.unsplash.com`) | **navigateur du visiteur** de la page de réservation (observé) | adresse IP | non vérifié | ⚖️ |
| GitHub | — | le code source, **dépôt public**, dont une identité nommée (`RGPD-15`) | États-Unis | — |

**Quelles adresses de clients partent où** : l'adresse en clair va à l'IGN (géocodage, France) ; sa position, sans nom, va à HeiGIT (Allemagne) quand elle entre dans une tournée ; l'adresse complète **avec le nom, le téléphone et l'e-mail** va à Google quand le professionnel synchronise son agenda.

**Observé dans le navigateur** (`rgpd-traceurs.spec.ts`, requêtes bloquées) :

| Page | Tiers contactés |
|---|---|
| `/reserver/<lien du cabinet de test>`, visiteur sans compte | `a.`, `b.`, `c.tile.openstreetmap.org` ; `images.unsplash.com` |
| `/dashboard` | aucun |
| `/dashboard/carte` | `a.`, `b.`, `c.tile.openstreetmap.org` |

Aucune requête vers Google au chargement : **les polices sont bien servies par le site** (point laissé « à confirmer » en phase 0).

---

## 4. Information des personnes (art. 13 et 14)

`src/lib/privacy.ts` ne contient pas de texte d'information : ce sont des fonctions techniques (empreintes, masquage des adresses e-mail). Le seul texte est la page `/politique-de-confidentialite/[slug]` (`src/app/politique-de-confidentialite/[slug]/page.tsx`), rédigée au nom du professionnel, liée depuis la dernière étape de la réservation (`src/components/booking/summary-steps.tsx:92`).

| Ce que dit la page | Ce que fait le code | Écart |
|---|---|---|
| « Vos données ne sont accessibles qu'à [prénom nom] » (`page.tsx:75`) | Accessibles aussi aux autres comptes du cabinet, dont le secrétariat (`SEC-14`), au compte de plateforme pendant une assistance (`SEC-12`), à l'hébergeur ; transmises à Mailjet, à l'IGN, à HeiGIT, à Google si l'agenda est connecté (§3) | **faux** |
| Seule l'IGN est citée, « uniquement pour suggérer des adresses » (`page.tsx:75`) | L'adresse du client est aussi **géocodée côté serveur** et sa position enregistrée (`Client.latitude`, `clients-actions.ts:34-38`) ; le navigateur du visiteur contacte OpenStreetMap et Unsplash (§3) | incomplet |
| « Votre adresse, uniquement pour les consultations à domicile » (`page.tsx:60`) | Le champ « Adresse » est marqué obligatoire dans les deux modes ; au cabinet, c'est une saisie libre (`src/components/booking/details-step.tsx:426-448`) | **faux** |
| Finalité : « traiter votre demande et assurer le suivi de la consultation » (`page.tsx:68`) | S'y ajoutent : rappel automatique 24 ou 48 h avant (`scheduler/appointment-reminders.ts`), relances « à revoir » (`reminders-actions.ts`), tournées et carte, comptes rendus | incomplet |
| Durée : « le temps nécessaire […] puis supprimées à votre demande » (`page.tsx:68`) | Aucune durée, aucune purge (`RGPD-06`) ; et la suppression à la demande laisse des données (`RGPD-03`) | ni durée, ni effacement réel |
| Droits : accès, rectification, suppression (`page.tsx:82`) | — | ⚖️ manquent a priori : limitation, opposition, portabilité, **droit de saisir la CNIL** (art. 13.2.b et d) |
| — | Base légale absente | ⚖️ art. 13.1.c |
| — | L'adresse IP du visiteur est enregistrée **en clair** dans le journal à chaque réservation (`src/lib/audit.ts:66-71`, appelé par `appointments-actions.ts:1493`) et pseudonymisée dans les compteurs (`src/lib/privacy.ts:19`) | non mentionné |

**Consentement de la réservation** : la case « J'accepte l'utilisation de mes informations pour traiter cette demande » (`summary-steps.tsx:88-90`) n'existe que dans le navigateur. Le serveur ne la reçoit pas (`PublicBookingInput`, `appointments-actions.ts:1078-1124` : aucun champ de ce type) et n'en garde aucune trace. ⚖️ Pour prendre un rendez-vous demandé par la personne elle-même, la base habituellement retenue est l'exécution de mesures précontractuelles (art. 6.1.b), pas le consentement ; présenter une case de consentement est alors trompeur, et si le consentement était la base retenue, il faudrait pouvoir le prouver (art. 7.1). Voir `RGPD-05`.

**Information des professionnels** : aucune politique de confidentialité de la plateforme (§2).

---

## 5. Mentions légales (LCEN)

Aucune page de mentions légales dans `src/app/` (25 pages, phase 0 §2.2), aucun lien en pied de page de la page d'accueil, de la réservation ou de l'espace professionnel. ⚖️ La loi pour la confiance dans l'économie numérique (art. 6, III) impose d'indiquer l'éditeur du service et son hébergeur. Voir `RGPD-02`.

---

## 6. Cookies et traceurs

*Obtenu par : lecture du code et observation réelle (`rgpd-traceurs.spec.ts`).*

| Élément | Où | Rôle | Strictement nécessaire ? ⚖️ |
|---|---|---|---|
| Cookie `animeo-session` | `src/lib/auth/session.ts:5`, observé (`httpOnly`, `SameSite=Lax`) | session de connexion | oui |
| Cookie `animeo-2fa-pending` | `session.ts:8` | étape de double authentification | oui |
| Cookie `animeo-google-oauth-state` | `src/lib/calendar/google-oauth-state.ts:17` | protection du retour Google | oui |
| `sessionStorage` `animeo:booking:v1:<lien>` | `public-booking-flow.tsx`, observé | brouillon de la réservation, effacé à la fermeture de l'onglet | oui (service demandé) |
| `localStorage` : thème, menu, couleurs et polices récentes, application de navigation, notifications masquées | `dashboard-theme-provider.tsx`, `sidebar-provider.tsx`, `color-picker.tsx`, `font-picker.tsx`, `tour-run-timeline.tsx`, `notifications-bell.tsx` | préférences choisies par l'utilisateur | oui, a priori (personnalisation demandée) |
| `localStorage` `animeo-animal-photos-v1` | `src/components/clients/client-profile.tsx:39`, `:202` | **photos d'animaux**, hors de la base | voir `RGPD-12` |
| Tuiles OpenStreetMap, OpenFreeMap, photos Unsplash | navigateur (§3) | affichage | ne déposent pas de cookie observé ; transmettent l'adresse IP |

**Visiteur anonyme** : aucun cookie déposé (observé). **Professionnel** : seul le cookie de session (observé). Aucun outil de mesure d'audience, aucun script publicitaire, aucune police chargée depuis un tiers.

**Conclusion** ⚖️ : **aucun bandeau de consentement ne semble nécessaire** en l'état. Les tuiles de carte et les photos tierces ne sont pas des traceurs au sens des cookies, mais transmettent l'adresse IP du visiteur à un tiers : à mentionner dans l'information (§4), ou à supprimer en hébergeant ces ressources (`FONC-09`, `RGPD-09`). Ce point est à revoir dès qu'un outil de mesure ou de suivi serait ajouté.

---

## 7. Minimisation et durées de conservation (art. 5.1.c et e)

**Ce qui est purgé** : les tentatives de connexion et de réservation (plus de 24 h), les codes de double authentification et les liens de réinitialisation périmés (`src/lib/rate-limit.ts:31-40`, appelé à chaque passage du planificateur, `src/lib/scheduler/jobs.ts:38`). Et un espace entier, à sa suppression.

**Ce qui ne l'est jamais** (aucune suppression dans `src/lib/scheduler/` ni ailleurs, hors effacement d'un espace) :

| Donnée | Constat | Preuve |
|---|---|---|
| Clients inactifs | gardés sans limite ; l'**archivage ne supprime rien** (« rien n’est supprimé », `clients-actions.ts:93`) | `Client.archivedAt` |
| Rendez-vous passés, adresses, positions, notes | sans limite | `Appointment` |
| Demandes refusées ou expirées | la demande passe à « annulée » (`scheduler/expire-requests.ts:34`) ; **la fiche client créée par la réservation reste** (`appointments-actions.ts:1220`) | — |
| Journal (`AuditLog`), avec l'adresse IP en clair | sans limite (`SEC-30`) ; l'IP des **visiteurs anonymes** y entre à chaque réservation | `audit.ts:66-71`, `appointments-actions.ts:1493` |
| Sessions, avec le navigateur utilisé | les lignes révoquées ou expirées ne sont jamais supprimées | `Session.userAgent` ; recherche de `session.delete` : seulement à la suspension et à la suppression d'un espace (`organization-actions.ts:49`, `:134`) |
| Invitations expirées, historique des imports (nom du fichier) | sans limite | `Invitation`, `ClientImport.fileName` |
| Photos, PDF des comptes rendus | sans limite, en base | `StudioDocument.pdfBase64` |

**Données collectées sans usage ou au-delà du besoin** :

- L'adresse demandée **comme obligatoire** à un client qui vient au cabinet (§4).
- L'annuaire complet des clients envoyé à chaque page (`RGPD-08`).
- Les coordonnées du client recopiées dans chaque événement Google (`RGPD-10`).

⚖️ **Durées de référence à vérifier** sur cnil.fr : le référentiel de la CNIL sur la gestion commerciale (clients et prospects : durée de la relation, puis une période limitée après le dernier contact) ; la recommandation de la CNIL sur la journalisation (de l'ordre de six mois à un an pour les journaux). Pour les comptes rendus, une éventuelle obligation de conservation propre à la profession est à établir avec un juriste : si elle existe, elle justifie de garder ces documents, pas les autres données. Voir `RGPD-06`.

---

## 8. Droits des personnes (art. 15 à 22)

| Droit | Depuis l'interface du professionnel | Preuve |
|---|---|---|
| Accès, portabilité (15, 20) | **non** : aucun export d'une fiche ; seul le compte de plateforme exporte un espace entier | `FONC-05` ; `src/lib/csv-export.ts` importé seulement par `organization-export.ts` |
| Rectification (16) | oui : fiche client et animal modifiables | `updateClientAction` (`clients-actions.ts:282`), `updateAnimalAction` (`:407`) |
| Effacement (17) | **incomplet** (`RGPD-03`) | ci-dessous |
| Opposition (21) | rien ne marque un client « ne plus me contacter » | `RGPD-17` |
| Archivage ≠ suppression | **bien distingués** à l'écran et dans le code : archiver est réversible et ne supprime rien | `clients-actions.ts:89-118` |

### Ce que laisse la suppression d'un client — vérifié

`deleteClientAction` et `deleteClientsAction` (`src/lib/clients-actions.ts:53-71`, `:133-160`) suppriment la ligne `Client`. La base fait le reste selon les règles du schéma :

| Supprimé en cascade | Conservé, détaché (`SetNull`) — **avec le nom, l'adresse ou la position du client** |
|---|---|
| `Animal` (`schema.prisma:459`), et avec lui `Consultation` (`:512`), `AnimalDocument` (`:539`) | `Appointment` : `clientName`, `location`, `postalCode`, `city`, `latitude`, `longitude`, `notes` (`:641-662`) |
| `Reminder` (`:799`) | `TourStop` (rattaché au rendez-vous, `:1144`) : `label` = « animal — nom du client », `address`, `latitude`, `longitude`, `notes` (`:1154-1179` ; recopie à l'ajout : `tour-runs-actions.ts:619-620`) |
| | `StudioDocument` : titre, contenu, PDF (`:566-569`) |
| | `AppointmentSlotOption`, `AppointmentCalendarEvent` (suivent le rendez-vous, qui reste) |

Et hors de la base :

- **Flux d'agenda** : il publie tous les rendez-vous non annulés, sans regarder si le client existe encore (`src/app/api/calendar/feed/[token]/route.ts:34-38`). Le nom continue d'y figurer.
- **Google Agenda** : l'événement, qui contient nom, téléphone, e-mail et adresse (`calendar-sync.ts:50-69`), n'est supprimé chez Google qu'à l'effacement d'un espace entier (`organization-deletion.ts:203`).
- **Mailjet** : le contact n'est effacé qu'à l'effacement d'un espace entier (`organization-deletion.ts:232`).
- **Photos d'animaux** du navigateur (`RGPD-12`).

**Prouvé** (`rgpd-donnees-client.spec.ts`, essai « RGPD-03 ») : un client, son animal, un rendez-vous à domicile avec position et note, un arrêt de tournée et un compte rendu sont créés ; `deleteClientAction` est appelée avec la session du praticien (permission accordée le temps de l'essai) et répond `ok`. Témoin : la fiche et l'animal ont disparu. Restent en base :

```
rendez-vous : {"clientName":"Camille AUDIT4Efface","location":"7 rue AUDIT4 Effacement","latitude":49.4431,"longitude":1.0993,"notes":"Portail vert — AUDIT4"}
arrêt       : {"label":"AUDIT4Filou — Camille AUDIT4Efface","address":"7 rue AUDIT4 Effacement","latitude":49.4431,"longitude":1.0993}
compte rendu: {"title":"Compte rendu AUDIT4 — Camille AUDIT4Efface"}
flux d'agenda : DESCRIPTION:Client : Camille AUDIT4Efface … LOCATION:7 rue AUDIT4 Effacement
```

**Ce que dit l'écran** : « Supprimer définitivement la fiche de [nom] et tous ses animaux ? Cette action est irréversible. » (`src/components/clients/client-profile.tsx:326` ; liste : `clients-list.tsx:331-332`). Et pour un animal : « historique de consultations et documents inclus » (`client-profile.tsx:400`), alors que ses comptes rendus du Studio restent (`StudioDocument.animal`, `SetNull`).

**Audit de pré-production** : son §9 notait bien que « les rendez-vous et comptes rendus sont conservés, détachés, et gardent le nom du client en texte », mais son tableau RGPD (§10) classait « Suppression d'un client : ✅ Définitive, avec cascade ». **Ce classement était inexact ; le défaut est toujours ouvert.** Garder un historique peut être légitime ⚖️ — mais alors l'écran doit le dire, et le professionnel doit pouvoir effacer réellement quand un client l'exige.

### `docs/RGPD-EFFACEMENT.md` confronté au code

| Affirmation | Vérification |
|---|---|
| Chaque table de l'espace est vidée, puis la transaction vérifie qu'il ne reste rien | conforme : `src/lib/platform/organization-deletion.ts`, `src/lib/deletion-plan.ts` ; `tests-unit/purge-coverage.test.ts` relancé le 19 octobre : **4/4** ; `tests/organization-erasure-canary.spec.ts` vert dans la suite du 9 octobre (phase 1) |
| Événements Google supprimés, jeton révoqué ; contacts Mailjet effacés | conforme (`organization-deletion.ts:203`, `:232`) — **pour un espace entier seulement** |
| Ce qui reste : `DeletionRecord`, sans donnée personnelle | conforme au schéma (empreintes, dates, compteurs) |
| §3 Sauvegardes : durées « à compléter » | **toujours à compléter** (`EXP-01`). L'audit de pré-production indiquait « quotidiennes à 3 h, 30 jours de conservation » — **non revérifié** (aucune requête vers l'hébergeur dans cet audit) |
| §4 Journaux de l'IGN, de HeiGIT, de l'hébergeur : « à confirmer », « à compléter » | toujours ouverts |
| §5 Ce que le logiciel ne peut pas effacer : ne cite que le `sessionStorage` | **incomplet** : les photos d'animaux gardées dans le `localStorage` des navigateurs du cabinet (`RGPD-12`) n'y figurent pas |
| Rien sur l'effacement d'**un seul client** | le document ne traite que l'espace entier ; pour un client, voir ci-dessus |

---

## 9. Sécurité (art. 32), fiche par fiche du *Guide de la sécurité des données personnelles* de la CNIL

*Intitulés repris de l'édition 2024 du guide ; numérotation et contenu exact à vérifier sur cnil.fr.*

| Thème du guide | État | Constats |
|---|---|---|
| Authentifier les utilisateurs | mots de passe forts (10 caractères, 4 types) et bcrypt coût 12 ; limitation des essais ; double authentification **facultative** et **contournable par essais** | `SEC-01` (P1, prouvé), `SEC-03`, `SEC-04`, `SEC-05`, `SEC-06`. ⚖️ À comparer à la recommandation de la CNIL sur les mots de passe (2022) |
| Gérer les habilitations | cloisonnement entre cabinets solide tant que la base filtre ; **pas de restriction des données de soin pour le secrétariat** ; annuaire complet à tous | `SEC-08`, `SEC-14`, `RGPD-08` |
| Tracer les opérations | journal complet des actions sensibles, y compris la consultation d'une fiche client (`CLIENT_VIEWED`, `src/lib/clients.ts:166`) ; **sans durée** ; IP peu fiable | `SEC-30`, `SEC-31`, `RGPD-06` |
| Sauvegarder | rien d'établi dans le dépôt | `EXP-01` |
| Prévoir la continuité | un déploiement ne se défait pas | `EXP-03` |
| Gérer les incidents et violations | aucune alerte, aucune procédure | `EXP-02`, `RGPD-13` |
| Encadrer la sous-traitance | aucun contrat, ni en amont (professionnels) ni en aval (prestataires) | `RGPD-01`, `RGPD-09` |
| Sécuriser les sites web | HTTPS assuré par l'hébergeur (non revérifié) ; **aucun en-tête de sécurité posé par l'application** ; téléphone masqué envoyé quand même | `SEC-27`, `SEC-15` (P1, prouvé) |
| Sécuriser les serveurs | conteneur sous administrateur ; bibliothèques à failles critiques | `SEC-28`, `SEC-26` |
| Chiffrer, hacher, signer | mots de passe hachés (bcrypt), jetons hachés (SHA-256), jetons Google chiffrés (AES-256-GCM, `calendar-encryption.ts:16-44`), adresses e-mail pseudonymisées (HMAC, `privacy.ts:14`) ; **chiffrement de la base au repos et de la connexion à la base : non vérifiés** (réglages de l'hébergeur) | `SEC-03` (un seul secret pour trois usages) |
| Encadrer les développements | dépôt public sans secret dans l'historique ; tests de cloisonnement en intégration continue ; **suite complète hors intégration continue** ; données d'une personne nommée dans le dépôt | `TEST-03`, `SEC-23`, `RGPD-15` |
| Minimiser | voir §7 | `RGPD-06`, `RGPD-08` |

---

## 10. Violation de données (art. 33 et 34)

- **Détecter** : le journal (`AuditLog`) permet de reconstituer après coup qui a lu ou modifié quoi, y compris pendant une assistance (`src/lib/audit.ts:96-98`). Mais **rien ne prévient en temps réel** : pas d'alerte, pas de route de santé, pas de collecte des erreurs (`EXP-02`) ; ni sur un volume anormal d'échecs de connexion, ni sur un export d'espace.
- **Notifier** : aucune procédure dans le dépôt (recherche de « violation », « registre », « analyse d'impact », « AIPD » : aucun résultat pertinent). ⚖️ En tant que sous-traitant, 1002 Pattes doit prévenir chaque professionnel concerné « dans les meilleurs délais » (art. 33.2) ; le professionnel a 72 heures pour notifier la CNIL (art. 33.1). En tant que responsable des comptes des professionnels, 1002 Pattes notifie lui-même.
- **Établir l'étendue** d'une fuite : le journal le permet par cabinet ; il faut une liste des contacts des administrateurs de chaque espace (elle existe en base : `User.role = ADMIN`).

Voir `RGPD-13`.

---

## 11. Documents à tenir

| Document | État | Avis |
|---|---|---|
| Registre des traitements (art. 30.1, comme responsable : comptes des professionnels) | absent | ⚖️ à tenir : l'exemption des structures de moins de 250 personnes ne vaut pas pour un traitement non occasionnel |
| Registre des catégories d'activités (art. 30.2, comme sous-traitant) | absent | ⚖️ à tenir, même raison |
| Analyse d'impact (art. 35) | absente | **Avis motivé, à valider** ⚖️ : pas obligatoire à mon sens au stade actuel — pas de données de santé humaine (les soins concernent des animaux), pas de profilage ni de surveillance systématique, un seul cabinet. Mais trois éléments pèsent : la **position GPS du domicile** de chaque client, centralisée ; l'**agrégation de plusieurs cabinets** sur une même plateforme ; l'**accès de la plateforme à tous les espaces** par l'assistance. Une analyse d'impact courte est recommandée avant d'ouvrir à plusieurs cabinets, et deviendrait probablement nécessaire à grande échelle. Les champs libres (notes, antécédents) peuvent recevoir des informations sur la santé du propriétaire si un professionnel en saisit : à proscrire dans les conditions d'utilisation |
| Politique de sauvegarde | absente | `EXP-01` |
| Procédure d'incident et de violation | absente | `RGPD-13` |
| Procédure d'effacement d'un espace | **existe** (`docs/RGPD-EFFACEMENT.md`) | à compléter : sauvegardes, journaux des prestataires, effacement d'un client |

---

## 12. Données de test dans le dépôt public

- **Identité d'une personne nommée** : `prisma/seed.ts:150-200` crée l'administrateur et le profil du cabinet de démonstration avec le prénom, le nom, le nom commercial, une adresse e-mail sur le domaine du cabinet et une adresse postale à Rouen. Ces mêmes nom et lien de réservation apparaissent dans une vingtaine de tests (`git grep -c` : 27 fichiers suivis, dont `docs/audit-2026-10/03-ATTAQUES.md`). D'après l'audit de pré-production (`DATA-02`), il s'agit de l'identité de la praticienne du premier cabinet. **Non vérifié** : si l'adresse postale est réelle. Elle reste de toute façon dans l'historique git (`src/data/settings.ts`, avant correction de `DATA-02`).
- **Comptes de test** à mot de passe en clair, sur le domaine du cabinet : `SEC-23` (valeurs non reprises ici).
- **Clients de démonstration** : adresses e-mail en `example.fr` (fictives) ; noms produits par `faker` ; quatre numéros de téléphone écrits à la main (`prisma/seed.ts:109-133`) qui **ne sont pas** dans les tranches réservées aux œuvres de fiction ⚖️ (à vérifier sur arcep.fr) : un abonné réel pourrait les détenir. **Non vérifié.**
- Aucune adresse de messagerie grand public (Gmail, Orange, etc.) trouvée dans l'historique de `prisma/seed.ts`, `src/data` et `tests` (`git log --all -p`, filtré).
- Aucune capture d'écran, aucun export ni sauvegarde de base suivis par git (`git ls-files`, hors données de la compétence `.claude/skills/ui-ux-pro-max`).

Voir `RGPD-15`.

---

## 13. Constats

**`RGPD-01` · P0 · Pas de conditions d'utilisation ni de contrat de sous-traitance avec les professionnels**
- *En clair* : un professionnel confie à 1002 Pattes le fichier de ses clients sans qu'aucun contrat ne dise ce que la plateforme a le droit d'en faire, qui d'autre y touche, ni ce qui se passe en cas de fuite. La loi impose ce contrat écrit.
- *Preuve* : `acceptInvitationAction` (`src/lib/platform/invitation-actions.ts:110`) n'enregistre aucune acceptation ; recherche de `CGU`, `CGV`, `conditions générales`, `sous-traitan` dans `src/` et `docs/` : aucun document.
- *Scénario d'échec* : un contrôle de la CNIL, ou un litige avec un professionnel ; la plateforme ne peut opposer aucune règle écrite (responsabilités, assistance, sous-traitants, restitution des données).
- *Correctif* — **Loïc** ⚖️ : rédiger CGU/CGV et un contrat de sous-traitance conforme à l'art. 28.3 (objet, durée, instructions, confidentialité, sécurité, sous-traitants ultérieurs listés, assistance de la plateforme, notification des violations, restitution et effacement, audits). **Code** : case d'acceptation à l'inscription, avec date et version du texte enregistrées ; nouvelle acceptation quand le texte change.
- *Effort* : M (documents) + S (code). *Audits précédents* : pré-production §10, « contrats de sous-traitance à vérifier » — **toujours ouvert**.

**`RGPD-02` · P0 · Aucune mention légale**
- *En clair* : le site ne dit nulle part qui l'édite ni qui l'héberge. C'est une obligation légale pour tout site professionnel.
- *Preuve* : aucune page ni lien dans `src/app/` (phase 0, §2.2 ; recherche de « mentions légales » : aucun résultat).
- *Correctif* — **Loïc** ⚖️ : fournir l'identité de l'éditeur (nom ou raison sociale, adresse, contact, numéro d'immatriculation le cas échéant, directeur de la publication) et de l'hébergeur. **Code** : une page `/mentions-legales` et un lien en pied de page de la page d'accueil, de la réservation et de l'espace professionnel.
- *Effort* : S. *Audits précédents* : non relevé.

**`RGPD-03` · P0 · « Supprimer définitivement » un client laisse son nom, son adresse et la position de son domicile**
- *En clair* : quand un client demande à être effacé, le professionnel clique sur « Supprimer définitivement » et l'écran confirme. En réalité, le nom, l'adresse, la position GPS du domicile et les notes restent dans les rendez-vous, les tournées et les comptes rendus, et continuent d'être publiés dans le flux d'agenda et chez Google.
- *Preuve* : §8 ; `prisma/schema.prisma:642`, `:644`, `:1144`, `:567`, `:569` ; `tests/audit/rgpd-donnees-client.spec.ts`, essai « RGPD-03 » : **rouge**, quatre restes relevés (rendez-vous, arrêt, compte rendu, flux d'agenda).
- *Scénario d'échec* : un client exerce son droit à l'effacement ; le professionnel le lui confirme de bonne foi ; ses coordonnées restent lisibles par tout le cabinet, dans le flux d'agenda (qui peut être confié à un service tiers) et dans Google Agenda.
- *Correctif* — **Code** : à la suppression d'un client, effacer ou anonymiser `clientName`, `location`, positions et notes de ses rendez-vous ; les libellés, adresses et positions des arrêts liés ; supprimer les événements Google liés ; effacer le contact Mailjet si l'adresse n'est plus utilisée dans l'espace ; décider du sort des comptes rendus (suppression, ou conservation explicite et annoncée). Corriger les textes de confirmation (`client-profile.tsx:326`, `:400`, `clients-list.tsx:331-332`). Un test qui fouille la base après suppression, sur le modèle de `organization-erasure-canary.spec.ts`. **Loïc** ⚖️ : décider ce qui peut ou doit être conservé (comptes rendus, traces comptables) et pour combien de temps.
- *Effort* : M. *Audits précédents* : pré-production §10 « ✅ Définitive, avec cascade » — **inexact à l'époque, toujours ouvert**.

**`RGPD-04` · P1 · La politique de confidentialité ne correspond pas à ce que fait le logiciel**
- *En clair* : la page lue par les clients affirme que seul le professionnel voit leurs données et ne cite presque aucun prestataire. Elle ne donne aucune durée de conservation et omet des droits.
- *Preuve* : §4, tableau des écarts (`src/app/politique-de-confidentialite/[slug]/page.tsx:60`, `:68`, `:75`, `:82`).
- *Correctif* — **Code** : texte fidèle : destinataires (équipe du cabinet, plateforme et son assistance, hébergeur, Mailjet, IGN, HeiGIT, Google si connecté, fonds de carte), finalités réelles (rappels, relances, tournées), durées issues de `RGPD-06`, base légale, tous les droits dont la réclamation auprès de la CNIL, journal et adresse IP. Une politique propre à la plateforme pour les professionnels. **Loïc** ⚖️ : faire valider les deux textes.
- *Effort* : S (code) + S (validation). *Audits précédents* : pré-production §10 « ✅ Page `/politique-de-confidentialite/[slug]` » — la page existe, **son contenu n'avait pas été confronté au code**.

**`RGPD-05` · P2 · La case « J'accepte » de la réservation n'est ni vérifiée ni conservée**
- *En clair* : le formulaire demande au client d'accepter l'usage de ses données, mais le serveur n'en sait rien et n'en garde aucune trace. Si c'est vraiment un consentement, il est impossible à prouver ; si ce n'en est pas un, la case induit en erreur.
- *Preuve* : `src/components/booking/summary-steps.tsx:88-90` (navigateur seulement) ; `PublicBookingInput` sans champ correspondant (`src/lib/appointments-actions.ts:1078-1124`).
- *Correctif* — **Loïc** ⚖️ : fixer la base légale (vraisemblablement l'art. 6.1.b). **Code** : en ce cas, remplacer la case par une phrase d'information avec le lien ; sinon, envoyer la case au serveur, la refuser absente, et l'enregistrer avec la date et la version du texte.
- *Effort* : S. *Audits précédents* : pré-production §10, « ⚠️ à vérifier juridiquement » — **toujours ouvert**.

**`RGPD-06` · P1 · Aucune durée de conservation ni purge des données des clients et du journal**
- *En clair* : tout ce qui entre reste pour toujours : clients perdus de vue, demandes refusées, adresses IP des visiteurs, historique des connexions. Le RGPD demande de fixer une durée et de s'y tenir.
- *Preuve* : §7 ; seules purges : `src/lib/rate-limit.ts:31-40`.
- *Correctif* — **Loïc** ⚖️ : fixer une durée par catégorie (clients sans rendez-vous depuis N années, demandes refusées ou expirées, journal, sessions, invitations, imports). **Code** : purges dans le planificateur, en commençant par le journal, les sessions et les fiches créées par une demande jamais acceptée ; avertir le professionnel avant la purge d'un client inactif ; l'adresse IP du journal pseudonymisée comme celle des compteurs.
- *Effort* : M. *Audits précédents* : pré-production §10 « ❌ Aucune » — **partiellement corrigé** (traces de sécurité purgées depuis), le reste **toujours ouvert**.

**`RGPD-07` · P1 · Un professionnel ne peut pas remettre à un client la copie de ses données**
- *En clair* : si un client demande « quelles données avez-vous sur moi ? », le professionnel doit tout recopier à la main.
- *Preuve* : `FONC-05` ; `src/lib/csv-export.ts` n'est importé que par `organization-export.ts` ; l'export d'un espace est réservé au compte de plateforme (`src/app/plateforme/export/[organizationId]/route.ts:10`).
- *Correctif* — **Code** : depuis la fiche client, un export (fiche, animaux, rendez-vous, comptes rendus en PDF), lisible et réutilisable ; inscrit au journal ; protégé contre les formules (`SEC-21`).
- *Effort* : M. *Audits précédents* : pré-production §10 « ❌ Absent » — **toujours ouvert**.

**`RGPD-08` · P1 · Chaque page envoie au navigateur l'annuaire complet des clients (ex-`PERF-01`)**
- *En clair* : en ouvrant n'importe quelle page de l'espace professionnel, même celle des tarifs, le navigateur reçoit le téléphone, l'e-mail et l'adresse de tous les clients non archivés, avec leurs animaux et les adresses de leurs lieux. Un ordinateur partagé, une extension de navigateur indiscrète ou un téléphone perdu exposent tout le fichier.
- *Preuve* : `src/app/dashboard/layout.tsx:87-89` appelle `getClientPickerOptions` (`src/lib/clients.ts:123-155` : `phone`, `email`, `address`, `city`, animaux, lieux avec positions) et le transmet à `ClientDirectoryProvider` (`layout.tsx:104`) et à `GlobalAppointmentsManager` (`:154`). `tests/audit/rgpd-donnees-client.spec.ts`, essai « RGPD-08 » : **rouge** — téléphone, e-mail et adresse d'un client présents dans le HTML de `/dashboard/prestations`. S'y ajoutent les rendez-vous d'une fenêtre d'environ neuf mois, avec le téléphone du client (`src/lib/appointments.ts:87-99`).
- *Correctif* — **Code** : recherche de client côté serveur, à la frappe (une action existe déjà : `searchClientsAndAnimalsAction`, `clients-actions.ts:513`) ; ne charger les coordonnées qu'à l'ouverture d'une fiche ou d'un rendez-vous.
- *Effort* : M. *Audits précédents* : pré-production `PERF-01` (P1) — **partiellement corrigé** : l'historique des rendez-vous est désormais borné (`defaultAppointmentRange`), mais l'annuaire complet des clients part toujours avec chaque page.

**`RGPD-09` · P1 · Les sous-traitants ultérieurs, leurs pays et leurs contrats ne sont pas établis**
- *En clair* : la plateforme confie des données à une dizaine de services, dont certains peut-être hors d'Europe, sans liste tenue, sans contrat vérifié, et sans savoir où est hébergée la base.
- *Preuve* : §3 ; localisation de l'hébergeur non vérifiée (phase 0, §5) ; tuiles et photos tierces chargées par le navigateur des visiteurs (observé).
- *Correctif* — **Loïc** : obtenir de l'hébergeur la localisation des serveurs, des sauvegardes et le contrat de sous-traitance ; vérifier pays et contrat de chaque service ; publier la liste dans le contrat (`RGPD-01`). **Code** : héberger les photos par défaut (`FONC-09`) ; remplacer les tuiles OpenStreetMap par un fond français (IGN) ou auto-hébergé, au moins sur la page publique.
- *Effort* : M (démarches) + S (code). *Audits précédents* : pré-production §10 « sous-traitants à déclarer » — **toujours ouvert**.

**`RGPD-10` · P2 · Google Agenda reçoit le téléphone, l'e-mail et l'adresse des clients**
- *En clair* : quand un professionnel relie son agenda Google, chaque rendez-vous y est copié avec les coordonnées complètes du client. Le professionnel n'en est pas averti, et la suppression d'un client ne retire pas ces copies.
- *Preuve* : `src/lib/calendar/calendar-sync.ts:50-69` ; suppression des événements seulement à l'effacement d'un espace (`organization-deletion.ts:203`).
- *Correctif* — **Code** : contenu minimal par défaut (animal, prestation, lien vers 1002 Pattes), coordonnées en option ; avertissement à la connexion ; suppression des événements à la suppression d'un client (`RGPD-03`). **Loïc** ⚖️ : le décrire dans le contrat de sous-traitance (transfert choisi par le professionnel).
- *Effort* : S. *Audits précédents* : non relevé.

**`RGPD-11` · P2 · Le professionnel n'est pas prévenu quand la plateforme entre dans son espace**
- *En clair* : la plateforme peut ouvrir l'espace d'un professionnel pour l'aider, pendant 30 minutes, et y écrire. Il ne le découvre que s'il ouvre son journal.
- *Preuve* : `SEC-12` ; `src/lib/platform/assistance-actions.ts:31-66` (aucun envoi d'e-mail).
- *Correctif* — **Code** : e-mail à l'administrateur de l'espace au début de chaque assistance, avec le motif. **Loïc** ⚖️ : l'écrire dans le contrat (qui, quand, pourquoi, lecture ou écriture).
- *Effort* : S. *Audits précédents* : fonction postérieure.

**`RGPD-12` · P3 · Les photos d'animaux sont gardées dans le navigateur, hors de la base**
- *En clair* : la photo ajoutée depuis la fiche client reste dans l'ordinateur qui l'a ajoutée. Elle n'est ni exportée, ni effacée avec le client ou l'espace, et reste après la déconnexion sur un poste partagé.
- *Preuve* : `src/components/clients/client-profile.tsx:39`, `:70`, `:202` ; le message le dit (« enregistrée dans ce navigateur », `:207`) ; un champ `Animal.photo` existe pourtant en base. Absent de `docs/RGPD-EFFACEMENT.md` §5.
- *Correctif* — **Code** : enregistrer en base ; vider ce stockage à la déconnexion.
- *Effort* : S. *Audits précédents* : non relevé.

**`RGPD-13` · P1 · Aucune détection ni procédure en cas de fuite de données**
- *En clair* : si des données fuient, personne n'est alerté, et rien n'est écrit sur qui prévenir, dans quel ordre, ni dans quels délais (72 heures pour la CNIL).
- *Preuve* : §10 ; `EXP-02`.
- *Correctif* — **Loïc** ⚖️ : procédure écrite (qualifier, contenir, prévenir les professionnels concernés, aider à la notification, tenir un registre des violations). **Code** : alertes sur des signaux simples (rafale d'échecs de connexion, export d'un espace, échec de la seconde barrière au démarrage `SEC-08`), en s'appuyant sur `EXP-02`.
- *Effort* : S (procédure) + M (alertes). *Audits précédents* : non relevé.

**`RGPD-14` · P1 · Pas de registre des traitements**
- *En clair* : la loi demande de tenir la liste écrite de ce que la plateforme fait des données, comme responsable et comme sous-traitant.
- *Preuve* : aucun document dans le dépôt (recherche de « registre ») ; §11.
- *Correctif* — **Loïc** ⚖️ : les deux registres (modèle sur cnil.fr) ; ce rapport (§3, §7) en fournit la matière.
- *Effort* : S. *Audits précédents* : pré-production §10 « ❌ Aucune trace » — **toujours ouvert**.

**`RGPD-15` · P2 · L'identité d'une personne nommée est publiée dans le dépôt public**
- *En clair* : le code public contient le nom, l'adresse e-mail professionnelle et une adresse postale d'une praticienne, et des numéros de téléphone qui pourraient appartenir à de vraies personnes.
- *Preuve* : §12 ; `prisma/seed.ts:109-133`, `:150-200`.
- *Correctif* — **Code** : identité fictive (domaine `example.fr`, numéros dans les tranches de fiction) dans le peuplement et les tests. **Loïc** : obtenir l'accord de la personne ou rendre le dépôt privé — retirer ces données du code actuel ne les retire pas de l'historique.
- *Effort* : S (code), M si l'historique doit être réécrit. *Audits précédents* : relevé en phase 1 (§2.1), renvoyé ici.

**`RGPD-16` · P3 · Une réservation se rattache à une fiche existante par la seule adresse e-mail**
- *En clair* : quelqu'un qui réserve en tapant l'adresse e-mail d'un autre client voit sa demande, avec son texte libre, rangée dans la fiche de cet autre client, qui sort au passage des archives.
- *Preuve* : `findOrCreateClientAndAnimal`, `src/lib/appointments-actions.ts:1212-1218`.
- *Correctif* — **Code** : signaler au professionnel une demande dont le nom diffère de la fiche trouvée, au lieu de la rattacher en silence. *Effort* : S. *Audits précédents* : non relevé.

**`RGPD-17` · P3 · Les rappels et relances n'offrent aucun moyen de s'y opposer**
- *En clair* : un client reçoit des rappels et des invitations à revenir sans pouvoir dire « je n'en veux plus », sinon en écrivant au professionnel.
- *Preuve* : aucune mention d'opposition dans `src/lib/email/templates.ts` (recherche de « désinscri », « ne plus recevoir », « opposer » : aucun résultat dans les messages aux clients).
- *Correctif* — **Loïc** ⚖️ : dire si la relance « à revoir » relève de la prospection. **Code** : mention et lien d'opposition, marque « ne plus contacter » sur la fiche, respectée par les envois. *Effort* : S.

---

## 14. Points des audits précédents revérifiés dans cette phase

| Point | Origine | Statut au 19 octobre 2026 |
|---|---|---|
| Politique de confidentialité | pré-production §10 (✅) | page présente, **contenu inexact** (`RGPD-04`) |
| Suppression d'un client | pré-production §10 (✅) | **classement inexact à l'époque, toujours ouvert** (`RGPD-03`) |
| Export des données d'un client | pré-production §10 (❌) | **toujours ouvert** (`RGPD-07`) |
| Suppression d'un compte professionnel et de ses données | pré-production §10 (❌) | **corrigé** (effacement d'un espace, chantier C9 ; tests de purge verts) |
| Durées de conservation, purge | pré-production §10 (❌) | **partiellement corrigé** : traces de sécurité seulement (`RGPD-06`) |
| Consentement à la réservation | pré-production §10 (⚠️) | **toujours ouvert** (`RGPD-05`) |
| Cookies : session uniquement | pré-production §10 (✅) | **confirmé par observation** ; s'y ajoutent les tiers contactés par le navigateur, non relevés à l'époque (§6) |
| Journaux | pré-production §10 (⚠️) | **partiellement corrigé** (`SEC-29`) |
| `PERF-01` — données des clients envoyées à chaque page | pré-production (P1) | **partiellement corrigé** (`RGPD-08`) |
| Localisation de l'hébergeur | pré-production §10 (⚠️) | **toujours non vérifiée** (`RGPD-09`) |
| Registre des traitements | pré-production §10 (❌) | **toujours ouvert** (`RGPD-14`) |
| Polices servies par le site | phase 0, §4.2 (à confirmer) | **confirmé** par observation |
| `docs/RGPD-EFFACEMENT.md` | 5 octobre 2026 | conforme au code pour un espace entier ; sauvegardes et prestataires « à compléter » ; photos du navigateur omises (§8) |

## 15. Non vérifié dans cette phase

- La localisation et les contrats de l'hébergeur, de ses sauvegardes et de ses journaux ; le chiffrement de la base au repos et de la connexion à la base.
- Le pays, les conditions et la base de transfert de chaque service tiers (§3) : tirés des noms de domaine et de connaissances générales, pas des contrats.
- Que l'adresse postale du peuplement de démonstration soit réelle ; que les numéros de téléphone de démonstration soient attribués.
- Le comportement en production (build de production, en-têtes réellement servis) : les essais tournent sur le serveur de développement local.
- L'existence d'une obligation légale de conservation propre aux comptes rendus d'ostéopathie animale.

## Récapitulatif

| Niveau | Constats |
|---|---|
| **P0** | `RGPD-01` pas de CGU ni de contrat de sous-traitance · `RGPD-02` pas de mentions légales · `RGPD-03` suppression d'un client incomplète (prouvé) |
| **P1** | `RGPD-04` politique de confidentialité inexacte · `RGPD-06` aucune durée de conservation · `RGPD-07` pas d'export d'un client · `RGPD-08` annuaire envoyé à chaque page (prouvé) · `RGPD-09` sous-traitants non établis · `RGPD-13` ni détection ni procédure de violation · `RGPD-14` pas de registre |
| **P2** | `RGPD-05` case de consentement · `RGPD-10` Google Agenda · `RGPD-11` assistance sans information · `RGPD-15` identité dans le dépôt public |
| **P3** | `RGPD-12` photos dans le navigateur · `RGPD-16` rattachement par e-mail · `RGPD-17` opposition aux rappels |
