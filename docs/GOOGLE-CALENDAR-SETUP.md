# Configurer Google Calendar pour Animéo

Ce guide explique comment configurer Google Cloud pour activer l'intégration Google Agenda (Paramètres → Intégrations). Suivez-le dans l'ordre — chaque étape dépend de la précédente.

## Ce que fait cette intégration

- Chaque membre de l'équipe (Paramètres → Intégrations) peut connecter **son propre** compte Google — indépendamment du compte utilisé pour se connecter au logiciel.
- Le logiciel reste la source de vérité : un rendez-vous est toujours créé/modifié en base **avant** d'être répercuté sur Google. Une panne Google n'affecte jamais la réservation elle-même.
- Les périodes occupées du compte Google connecté sont utilisées pour ne pas proposer un créneau déjà pris ailleurs — jamais le contenu des événements (titre, invités...) n'est lu ou affiché publiquement.

## Architecture technique (rappel rapide)

- Aucune donnée n'existe en dehors de ce cabinet : `CalendarConnection` est rattachée à un `User` (un membre du staff), pas à un "professionnel" séparé — ce logiciel gère un seul cabinet avec plusieurs comptes.
- Les jetons OAuth (access token, refresh token) sont chiffrés (AES-256-GCM) avant stockage — jamais en clair, jamais journalisés.
- `src/lib/calendar/` contient toute la logique Google ; le reste de l'application (rendez-vous, réservation publique) ne connaît que l'abstraction `CalendarProvider`, jamais les détails Google directement.

## 1. Créer ou sélectionner un projet Google Cloud

1. Ouvrez [console.cloud.google.com](https://console.cloud.google.com/).
2. En haut de la page, cliquez sur le sélecteur de projet → **Nouveau projet**.
3. Donnez-lui un nom (ex. `Animeo Calendar`), validez.
4. Sélectionnez ce projet avant de continuer (le sélecteur en haut doit l'afficher).

## 2. Activer l'API Google Calendar

1. Menu ☰ → **API et services** → **Bibliothèque**.
2. Recherchez `Google Calendar API`.
3. Cliquez dessus, puis **Activer**.

## 3. Configurer l'écran de consentement OAuth

1. Menu ☰ → **API et services** → **Écran de consentement OAuth**.
2. Type d'utilisateur : **Externe** (sauf si vous avez un Google Workspace dédié à l'organisation, auquel cas **Interne** simplifie tout — pas de vérification Google nécessaire).
3. Renseignez :
   - Nom de l'application : `Animéo`
   - E-mail d'assistance utilisateur : votre adresse
   - Logo (optionnel)
   - Domaine de l'application / Politique de confidentialité : l'URL de votre page `/politique-de-confidentialite/...` si vous en publiez une
   - E-mail du développeur (le vôtre)
4. **Scopes** (étape "Autorisations") : ajoutez manuellement, ou laissez vide ici — les scopes sont demandés dynamiquement au moment de la connexion (voir §8). Si l'écran vous les demande explicitement, ajoutez :
   - `openid`
   - `.../auth/userinfo.email`
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/calendar.readonly`
5. **Utilisateurs test** (si type "Externe" et application non publiée) : ajoutez l'adresse Gmail de chaque membre du staff qui doit pouvoir se connecter pendant les tests. Sans cela, Google refuse la connexion pour tout compte non listé.

## 4. Créer les identifiants OAuth (Client ID)

1. Menu ☰ → **API et services** → **Identifiants**.
2. **Créer des identifiants** → **ID client OAuth**.
3. Type d'application : **Application Web**.
4. Nom : `Animéo — Web`.
5. **Origines JavaScript autorisées** (utile si vous ajoutez un jour un appel JS côté navigateur ; pas strictement nécessaire pour le flux actuel, mais recommandé) :
   - `http://localhost:3000` (développement)
   - `https://votre-domaine-de-production` (production)
6. **URI de redirection autorisés** — **obligatoire, doit correspondre exactement** :
   - `http://localhost:3000/api/calendar/google/callback` (développement)
   - `https://votre-domaine-de-production/api/calendar/google/callback` (production)
7. Validez. Notez le **Client ID** et le **Client Secret** affichés (le secret ne sera plus visible en clair ensuite — copiez-le maintenant).

## 5. Scopes utilisés

| Scope | Pourquoi |
|---|---|
| `openid`, `.../userinfo.email` | Retrouver l'adresse du compte Google connecté (affichée dans Paramètres → Intégrations) |
| `https://www.googleapis.com/auth/calendar.events` | Créer/modifier/supprimer les événements des rendez-vous |
| `https://www.googleapis.com/auth/calendar.readonly` | Lister les agendas disponibles et interroger les périodes occupées (FreeBusy) |

Aucun scope plus large (`.../auth/calendar`, accès complet) n'est demandé.

## 6. Variables d'environnement

Dans `.env.local` (développement) ou la configuration de votre hébergeur (production) :

```env
GOOGLE_CLIENT_ID=votre-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=votre-client-secret
CALENDAR_TOKEN_ENCRYPTION_KEY=une-clé-hexadécimale-de-64-caractères
NEXT_PUBLIC_APP_URL=https://votre-domaine-de-production
```

Pour générer `CALENDAR_TOKEN_ENCRYPTION_KEY` :

```bash
openssl rand -hex 32
```

**Ne changez jamais cette clé une fois des comptes connectés** : les jetons déjà chiffrés en base deviendraient illisibles. Si une rotation est indispensable (fuite suspectée), les intégrations existantes devront être déconnectées puis reconnectées après le changement.

`NEXT_PUBLIC_APP_URL` détermine l'URI de redirection utilisée par le logiciel (`${NEXT_PUBLIC_APP_URL}/api/calendar/google/callback`) — elle doit correspondre **exactement** à ce qui a été saisi à l'étape 4.6, y compris le protocole (`https://`) et l'absence de `/` final.

## 7. Configuration développement

1. Renseignez les 3 variables ci-dessus dans `.env.local`.
2. Ajoutez votre propre adresse Gmail comme "utilisateur test" (§3.5) si l'application n'est pas publiée.
3. Démarrez le serveur (`npm run dev`), allez dans Paramètres → Intégrations, cliquez sur **Connecter Google Agenda**.
4. Vérifiez que Google demande bien le consentement (et non une erreur `redirect_uri_mismatch` — dans ce cas, revérifiez l'étape 4.6).

## 8. Configuration production

1. Ajoutez l'URI de redirection **de production** dans les identifiants OAuth (§4.6) — les deux URIs (dev + prod) peuvent coexister dans la même liste.
2. Renseignez les 3 variables d'environnement dans la configuration de votre hébergeur (jamais commitées dans le dépôt Git — `.env.local.example` ne contient que des cases vides).
3. Vérifiez que `NEXT_PUBLIC_APP_URL` pointe vers le domaine réel de production.

## 9. Publier l'application OAuth (sortir du mode "test")

Tant que l'écran de consentement reste en mode **Test**, seuls les comptes listés en "utilisateurs test" (§3.5) peuvent se connecter, et l'autorisation expire au bout de 7 jours (à renouveler manuellement).

Pour un usage réel par l'équipe du cabinet (souvent 1 à 5 comptes), deux options :

- **Rester en mode Test** et ajouter chaque compte du staff comme utilisateur test — suffisant pour un petit cabinet, aucune vérification Google requise.
- **Publier l'application** (écran de consentement → **Publier l'application**) pour lever cette limite. Comme les scopes demandés (`calendar.events`, `calendar.readonly`) sont considérés "sensibles" par Google, une **vérification Google** est requise avant publication pour un usage par des comptes externes à votre organisation — cela peut prendre plusieurs jours et demande une politique de confidentialité publique. Si le Google Workspace du cabinet est de type "Interne", cette vérification n'est pas nécessaire.

## Dépannage

| Symptôme | Cause probable |
|---|---|
| `redirect_uri_mismatch` | L'URI de redirection ne correspond pas exactement à celle enregistrée (§4.6) — vérifiez le protocole et l'absence de `/` final |
| "Accès bloqué : cette application n'est pas vérifiée" | Compte non ajouté comme utilisateur test (§3.5), ou application à publier (§9) |
| Connexion réussie mais "Google n'a pas renvoyé de refresh token" | Le compte avait déjà autorisé l'application sans consentement explicite récent — déconnectez puis reconnectez (le logiciel redemande systématiquement le consentement) |
| ⚠ "Synchronisation Google à vérifier" dans Paramètres → Intégrations | Le refresh token a été révoqué côté Google (mot de passe changé, accès retiré manuellement) — cliquez sur **Reconnecter** |
