# Effacement d’un espace professionnel — procédure RGPD

À l’usage du super-hôte de 1002 Pattes. Ce document décrit ce que fait la suppression d’un espace, ce qu’elle ne peut pas faire, et ce qu’il reste à faire à la main.

**Cadre.** Le professionnel est responsable du traitement des données de ses clients ; 1002 Pattes est son sous-traitant. À la fin du contrat, ou sur demande d’effacement (RGPD art. 17), 1002 Pattes doit effacer ses données et celles de ses clients, après les lui avoir restituées s’il le souhaite (art. 28.3.g et art. 20).

---

## 1. Le parcours, côté plateforme

Depuis `/plateforme`, sur la carte de l’espace :

| Action | Effet |
|---|---|
| **Suspendre…** (motif obligatoire) | Plus personne ne se connecte, la page de réservation et le flux d’agenda renvoient une erreur 404, aucune tâche automatique ne part (rappels, relances, tournées). L’assistance reste possible, en lecture seule. Réversible avec **Réactiver**. |
| **Supprimer l’espace…** | Affiche l’inventaire (comptes, clients, animaux, rendez-vous, documents) et propose l’**export**. Demande le motif et le nom exact de l’espace. Suspend aussitôt l’espace et **programme l’effacement à 7 jours**. Les administrateurs de l’espace reçoivent un email avec la date. |
| **Annuler la suppression** | Possible jusqu’à l’échéance. L’espace reste suspendu : il se réactive à part. |
| **Effacer immédiatement** (case à cocher dans la même fenêtre) | Réservé à une demande explicite du professionnel. Seconde confirmation obligatoire. Efface tout de suite. |
| **Télécharger l’export** | ZIP généré à la demande et jamais conservé : un fichier JSON par table, les comptes (sans empreinte de mot de passe), les agendas connectés (sans jeton), `clients.csv`, `animaux.csv`, `rendez-vous.csv`, et les comptes rendus du Studio en PDF. À remettre au professionnel **avant** l’effacement. |

L’effacement est exécuté par le planificateur à l’échéance (toutes les heures en production), ou tout de suite par « Effacer immédiatement ». Code : `src/lib/platform/organization-deletion.ts`.

**Garde-fou.** Hors production, l’effacement refuse de s’exécuter, sauf sur une base dont le nom finit par `_test` (ou avec `ALLOW_ORGANIZATION_PURGE=1`, que seul le script de rejeu pose).

---

## 2. Ce que l’effacement supprime, table par table

Ordre réel d’exécution : d’abord les prestataires, puis la base en **une seule transaction**. Dans cette transaction, l’espace visé est déclaré à la base : ses règles de cloisonnement (RLS) empêchent physiquement de toucher les tables cloisonnées d’un autre cabinet. Chaque table est vidée explicitement, sans compter sur les cascades. À la fin, la transaction vérifie qu’il ne reste rien ; sinon tout est annulé.

### Données de l’espace (colonne `organizationId`)

| Table | Contenu | Supprimée par |
|---|---|---|
| `AppointmentCalendarEvent` | identifiants des événements Google | `organizationId` |
| `TourStop` | arrêts de tournée, adresses, notes | `organizationId` |
| `TourRun` | tournées du jour, adresses de départ et d’arrivée | `organizationId` |
| `Reminder` | relances, notes | `organizationId` |
| `Consultation` | comptes rendus | `organizationId` |
| `AnimalDocument` | nom des documents (aucun fichier hors base) | `organizationId` |
| `StudioDocument` | documents du Studio, PDF et vignettes en base64 | `organizationId` |
| `StudioDocumentTemplate` | modèles propres à l’espace (pas ceux de 1002 Pattes) | `organizationId` |
| `Appointment` | rendez-vous, noms, lieux, notes | `organizationId` |
| `Animal` | animaux, historique, soins, photos | `organizationId` |
| `AnimalPlace` | lieux (haras, pensions) | `organizationId` |
| `Client` | clients : nom, téléphone, email, adresse | `organizationId` |
| `ClientImport` | historique des imports | `organizationId` |
| `BlockedSlot` | créneaux bloqués | `organizationId` |
| `City` | communes des zones | `organizationId` |
| `_TourZones` | liaison tournées ↔ zones (table implicite de Prisma) | tournées et zones de l’espace |
| `Tour` | modèles de tournée | `organizationId` |
| `Zone` | zones | `organizationId` |
| `Service` | prestations, photos | `organizationId` |
| `SavedPlace` | lieux enregistrés | `organizationId` |
| `MapView` | vues de carte enregistrées | `organizationId` |
| `BusinessProfile` | profil, page publique, photos, logo, horaires, réglages | `organizationId` |

### Données des comptes de l’espace

| Table | Supprimée par |
|---|---|
| `CalendarConnection` (email Google, jetons chiffrés) | comptes de l’espace — après révocation chez Google |
| `Session` | comptes de l’espace, et assistances ouvertes par l’un d’eux |
| `PasswordResetToken`, `TwoFactorCode` | comptes de l’espace |
| `AgendaPreferences`, `TourPreferences`, `DashboardPreferences` | comptes de l’espace |
| `User` | `organizationId` |

### Données hors de l’espace qui le concernent

| Table | Supprimée par |
|---|---|
| `Invitation` | invitations de l’espace, et celles adressées à l’email d’un de ses membres |
| `AuditLog` | journal de l’espace ; lignes de plateforme qui le désignent (l’espace, ses comptes, ses invitations) ; anciennes lignes qui citeraient en clair une adresse de l’espace |
| `RateLimitEvent` | clés des adresses (membres et clients) et des comptes de l’espace, en empreinte et dans leur ancienne forme en clair |
| `Organization` | l’espace lui-même, en dernier |

### Ce qui reste

| Table | Contenu | Pourquoi |
|---|---|---|
| `DeletionRecord` | empreinte SHA-256 de l’identifiant de l’espace, empreinte HMAC de son lien de réservation, catégorie de motif, dates de demande et d’effacement, identifiant du compte de plateforme qui a demandé, nombre de lignes supprimées par table | Preuve de l’effacement, liste à rejouer après une restauration, et quarantaine du lien. **Aucune donnée personnelle.** |
| `AuditLog` d’autres espaces | actions qu’un membre de l’espace aurait faites ailleurs en tant que compte de plateforme | Ces lignes appartiennent au journal de l’autre espace ; leur auteur y devient anonyme. |

**Quarantaine du lien de réservation.** Pendant 6 mois après l’effacement, le lien (`/reserver/<lien>`) ne peut être repris par aucun espace : ni à l’onboarding, ni dans les Paramètres, ni à la création d’un espace par invitation. Un nouvel espace ne récupère donc pas les visiteurs ni les liens partagés de l’ancien.

### La preuve que rien ne reste

- `tests-unit/purge-coverage.test.ts` échoue si une table est ajoutée au schéma sans être classée : purgée, ou exclue avec sa raison.
- `tests/organization-erasure-canary.spec.ts` (sur la base de test) remplit chaque table de deux espaces, efface le premier, puis fouille toute la base en SQL brut : marqueur, identifiants, adresses en clair et en empreinte. Le résultat attendu est zéro occurrence, et le second espace doit être intact. Le test échoue aussi si la base contient une table inconnue de la purge.

Lancement, sur la base de test uniquement :

```
node -e "require('dotenv').config({path:'.env.test.local',quiet:true}); require('child_process').spawnSync('npx',['playwright','test','tests/organization-erasure-canary.spec.ts','tests/organization-deletion.spec.ts','--project=chromium'],{env:{...process.env,E2E_PORT:'3200'},stdio:'inherit',shell:true})"
```

---

## 3. Sauvegardes

Une sauvegarde est une photo de la base à un instant donné. On ne peut pas y effacer une ligne. Un espace effacé reste donc présent dans les sauvegardes antérieures, jusqu’à ce qu’elles expirent.

| Sauvegarde | Durée de conservation réelle | Où la vérifier |
|---|---|---|
| Iridflow — sauvegardes de la base de production (dont celles prises avant chaque déploiement) | **À compléter** | console Iridflow |
| Neon — historique de restauration (si une base Neon sert à un environnement) | **À compléter** | console Neon, réglage *history retention* |
| Autres copies (exports manuels, sauvegardes locales) | **À compléter** | — |

**Ce qu’il faut dire au professionnel :** ses données disparaissent de la base dès l’effacement, et des sauvegardes au plus tard au terme de la durée de conservation ci-dessus.

### Après toute restauration d’une sauvegarde

Une sauvegarde antérieure à un effacement fait revenir l’espace effacé. Sa table `DeletionRecord` ne connaît pas non plus les effacements faits depuis. La liste à rejouer doit donc venir de la base d’**avant** la restauration :

1. **Avant de restaurer**, sur la base actuelle, ou depuis l’ancienne base si elle existe encore :
   ```
   node scripts/replay-deletions.mjs --export preuves.json
   ```
   Le fichier ne contient que des empreintes, des dates et des nombres. Gardez-le jusqu’à la fin de la procédure.
2. **Restaurez** la sauvegarde.
3. **Sur la base restaurée** (DATABASE_URL pointée dessus ; le script affiche la base visée, sans mot de passe) :
   ```
   node scripts/replay-deletions.mjs --replay preuves.json             # liste ce qui serait effacé
   node scripts/replay-deletions.mjs --replay preuves.json --confirm   # efface et remet les preuves
   ```
   Le script retrouve chaque espace par l’empreinte de son identifiant, relance la vraie purge (prestataires, puis base, avec la vérification finale), et remet les preuves dans la base.

Si la base d’avant la restauration est perdue et qu’aucun export n’a été fait, la liste des effacements postérieurs à la sauvegarde est perdue elle aussi. **Recommandation : exporter les preuves régulièrement**, par exemple à chaque sauvegarde, et les conserver à part.

---

## 4. Prestataires : ce qu’ils reçoivent, ce qu’ils gardent

| Prestataire | Reçoit | À l’effacement | À vérifier |
|---|---|---|---|
| **Mailjet** (emails) | adresses et contenu des emails envoyés | Suppression RGPD de chaque contact (membres et clients), sauf une adresse encore présente dans un autre espace (même compte Mailjet). Mailjet anonymise aussitôt et efface sous 30 jours d’après sa documentation (*GDPR Delete contacts*). Seulement si Mailjet est configuré. | L’historique des envois dans la console Mailjet. Si 1002 Pattes utilise des sous-comptes, la suppression doit y être faite aussi. |
| **Google** (agenda du professionnel) | événements créés par 1002 Pattes : noms, animaux, adresses | Événements créés par l’application supprimés de l’agenda Google, puis jeton révoqué. La déconnexion manuelle révoque aussi le jeton. | Si le professionnel s’était déconnecté avant, les événements restent dans **son** agenda (voir § 5). |
| **IGN Géoplateforme** (`data.geopf.fr`) | adresses à géocoder ; tuiles de la vue aérienne | Rien à effacer de notre côté : aucun compte, aucune donnée stockée pour nous. | Conservation de leurs journaux d’accès : **à confirmer** dans leurs conditions. |
| **geo.api.gouv.fr** | noms et codes de communes | Pas de donnée personnelle. | — |
| **HeiGIT — OpenRouteService, VROOM** (`api.heigit.org`) | coordonnées des arrêts de tournée | Rien à effacer de notre côté. | Conservation de leurs journaux : **à confirmer** dans leurs conditions. |
| **OpenStreetMap** (tuiles du plan) | téléchargées par le navigateur du visiteur | — | Seule l’adresse IP du visiteur leur parvient. |
| **Hébergeur (Iridflow)** | journaux du serveur | Depuis C9 : aucun corps d’email, adresses masquées dans les erreurs, aucune adresse en clair dans les clés de limitation ni dans l’audit. | Durée de rétention des journaux : **à compléter** (console Iridflow). |

**Prérequis de production.**
- **`SUPPORT_EMAIL`** : l’adresse donnée au professionnel d’un espace suspendu.
- **Mailjet configuré** : sans lui, aucun email ne part, ni l’annonce de suppression ni aucun autre. Le serveur l’annonce au démarrage.

---

## 5. Ce que le logiciel ne peut pas effacer

- **Les copies chez le professionnel :** l’export remis, les emails reçus (rappels, confirmations, codes), les PDF téléchargés, et son agenda Google s’il s’était déconnecté avant l’effacement.
- **Les copies chez ses clients :** les emails de confirmation et de rappel qu’ils ont reçus.
- **Les navigateurs des visiteurs :** le brouillon du parcours de réservation est gardé dans le `sessionStorage`, qui disparaît à la fermeture de l’onglet.
- **Les sauvegardes**, jusqu’à leur expiration (§ 3).
- **Ce que le professionnel a copié ailleurs** (tableurs, logiciels tiers) : cela relève de sa responsabilité.

---

## 6. Modèles de réponse

### Accusé de réception d’une demande de suppression

> Objet : Votre demande de suppression de compte 1002 Pattes
>
> Bonjour,
>
> Nous avons bien reçu votre demande de suppression de votre espace « [nom de l’espace] ».
>
> Votre espace est suspendu dès aujourd’hui : plus personne ne peut s’y connecter, votre page de réservation n’est plus accessible, et aucun email n’est plus envoyé à vos clients en votre nom.
>
> Ses données seront définitivement effacées le **[date, 7 jours plus tard]** : comptes, clients, animaux, rendez-vous, comptes rendus et documents, ainsi que les événements créés dans votre agenda Google et les contacts chez notre prestataire d’emails.
>
> Si vous souhaitez récupérer une copie de vos données avant cette date, répondez simplement à ce message : nous vous transmettrons un fichier contenant l’ensemble de vos données (tableaux lisibles et comptes rendus en PDF). Vous pouvez aussi annuler la suppression jusqu’à cette date.
>
> Bien cordialement,
> L’équipe 1002 Pattes

### Confirmation d’effacement

> Objet : Confirmation de la suppression de votre compte 1002 Pattes
>
> Bonjour,
>
> Nous vous confirmons que les données de votre espace « [nom de l’espace] » ont été définitivement effacées le **[date]**, de notre base comme chez nos prestataires (agenda Google, emails).
>
> Elles peuvent encore figurer dans nos sauvegardes techniques, qui ne sont pas consultées et expirent d’elles-mêmes au plus tard le **[date d’expiration, d’après le § 3]**. En cas de restauration d’une sauvegarde d’ici là, l’effacement serait appliqué de nouveau.
>
> Seule subsiste une trace technique sans aucune donnée personnelle, qui atteste de cet effacement.
>
> Bien cordialement,
> L’équipe 1002 Pattes
