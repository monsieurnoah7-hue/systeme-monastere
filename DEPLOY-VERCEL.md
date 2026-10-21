# Déploiement gratuit — Vercel + Neon PostgreSQL

> 0 FCFA/mois, sans carte bancaire. Migration VPS future : `docker compose up -d`.

## Étape 1 — Créer les comptes (5 min, gratuits)

### Neon.tech (base de données PostgreSQL) — ✅ fait
1. Projet « Système de gestion monastère » créé, région **AWS Europe Central 1 (Frankfurt)**
   → déployez donc Vercel en region `fra1` (proche de Frankfurt) pour la latence minimale.
2. **Pooled connection string** copiée (avec `-pooler` + `sslmode=require`) — compatible pg sans config SSL.
3. Migrations + seed déjà appliqués sur la base (17 tables, 5 comptes de démo).

### Vercel (frontend + API)
1. Allez sur https://vercel.com → **Sign up** → continuez avec GitHub
2. Le compte gratuit suffit (Hobby plan)

## Étape 2 — Importer le dépôt

1. Sur https://vercel.com/new → importez `monsieurnoah7-hue/systeme-monastere`
2. Ne lancez **pas** le build → **Continue to Dashboard**
3. Le `vercel.json` du dépôt configure déjà tout :
   - build `npm run build --workspace=apps/web` → `apps/web/dist`
   - rewrites `/api/*` et `/files/*` → fonction serverless `api/index.ts`
   - SPA fallback → `index.html`

## Étape 3 — Variables d'environnement

Settings → Environment Variables :

| Nom | Valeur | Origine |
|---|---|---|
| `DATABASE_URL` | connection string Neon (avec `-pooler` et `sslmode=require`) | manuelle |
| `BOOTSTRAP_PASSWORD` | mot de passe fort aléatoire (compte de secours `direction`) | manuelle |
| `CRON_SECRET` | secret aléatoire (64 hex) protégeant le cron de sauvegarde | manuelle |
| `BLOB_READ_WRITE_TOKEN` | jeton du store Blob « monastere-backups » | ajouté automatiquement par `npx vercel blob create-store monastere-backups --access private` (env `development`, `preview` **et** `production`) |

> `CRON_SECRET` et `BLOB_READ_WRITE_TOKEN` sont aussi dans `.env.local` (gitignoré) pour les
> tests locaux — le CLI Vercel entoure leurs valeurs de guillemets, l'API les lit sans boucles.

C'est tout : le front et l'API sont sur le même domaine → pas de CORS à configurer.

> **Identifiants de production (5 comptes)** — tous avec mot de passe fort, à conserver
> **hors du dépôt** (le dépôt GitHub est public) : l’ancien compte `admin` (valeur de
> `BOOTSTRAP_PASSWORD`) a désormais le rôle `direction` — un seul rôle de direction existe,
> et les comptes `direction` / `magasinier` / `chef` / `ouvrier` ont été durcis individuellement
> avec `apps/api/src/db/set-user-password.ts` (anciens mdp `*226` refusés : HTTP 401).

## Étape 4 — Deploy

1. Deployments → **Redeploy**
2. Au premier appel, l'API exécute automatiquement les migrations (verrou PostgreSQL,
   sûr même avec plusieurs fonctions démarrant en parallèle) et crée le compte `direction` de secours.
3. Ouvrez `https://systeme-monastere.vercel.app` → `direction` + `BOOTSTRAP_PASSWORD`

> Région confirmée : `vercel inspect` → `λ api/index [fra1]` (Francfort, à côté de Neon).

## Étape 5 — Seed des données de démonstration (optionnel)

En local, une fois, avec la variable `DATABASE_URL` de Vercel :
```bash
cd apps/api
DATABASE_URL="<neon-url>" npx tsx src/db/seed.ts
```
(ou `npx vercel env pull .env.local` puis `npm run seed`)

## Étape 6 — Rotation des mots de passe (recommandé)

Changer le mot de passe de n'importe quel compte (sans toucher au hash manuellement) :
```bash
cd apps/api
DATABASE_URL="<neon-url>" TARGET_LOGIN="<login>" TARGET_PASSWORD="<nouveau-mdp-fort>" npx tsx src/db/set-user-password.ts
```
Vérification : l'ancien mdp doit renvoyer 401, le nouveau 200.

## Sauvegardes automatiques (actives)

- **Cron quotidien** : `vercel.json` → `GET /api/cron/backup` tous les jours à **03:00 UTC**
  (4h locales), protégé par `CRON_SECRET` (en-tête `Authorization: Bearer …`).
- **Destination** : store Blob privé **« monastere-backups »** (offert : 1 Go, 10 Go de
  transfert/mois sur le plan Hobby — la base actuelle fait ~8 Mo, dump gzip ~110 Ko).
- **Contenu** : dump JSON gzip de toutes les tables (18 tables), rétention **30 jours**
  (`BACKUP_RETENTION_DAYS`), purge automatique des plus vieux.
- **À la demande, depuis n'importe quel appareil** : écran **Paramètres → Sauvegardes &
  maintenance** (compte `admin`) :
  - « Sauvegarder maintenant » → crée une sauvegarde cloud ;
  - « Télécharger l'export (.gz) » → export instantané hors ligne ;
  - la liste des sauvegardes cloud avec « Télécharger » par ligne.
  - équivalent API : `POST /api/admin/backup` (export), `POST /api/admin/backup/save` (cloud),
    `GET /api/admin/backups`, `GET /api/admin/backups/download?backup=<chemin>`.

### Restaurer une sauvegarde

```bash
cd apps/api
# récupérer le fichier (depuis Paramètres, ou depuis le cloud)
DATABASE_URL="<neon-url>" npx tsx src/db/restore.ts monastere-AAAA-MM-JJ.json.gz --yes
```
Le script vérifie le format, restaure par ordre de clés étrangères (topologie dynamique),
gère les colonnes `GENERATED ALWAYS` (`OVERRIDING SYSTEM VALUE` + realignement des séquences),
et contrôle le nombre de lignes de chaque table en fin d'opération.

> Restaurer **écrase** la base cible : le flag `--yes` est obligatoire.

## Purge des données de démonstration

Écran **Paramètres → Sauvegardes & maintenance → Purger les données de démonstration**
(tapez `RESET` pour confirmer), ou API :
```bash
curl -X POST https://systeme-monastere.vercel.app/api/admin/reset-demo \
  -H 'Content-Type: application/json' -b cookies-admin.txt \
  -d '{"confirm":"RESET"}'
```
- **Purgé** : pointages, absences, stocks (+ références), outils, magasins, terminaux,
  employés, événements, prêts, selfies, journaux d'audit (une trace `reset_demo` est réécrite).
- **Conservé** : les 5 comptes de connexion, les paramètres d'atelier, votre session,
  les permissions — vous restez connecté après la purge.
- Après purge, les profils employés sont déliés des comptes : recréez les employés
  (écran Employés) puis réassociez les comptes (écran Utilisateurs).
- Exécutez d'abord « Sauvegarder maintenant » : l'action est irréversible sans dump.

## Vérifications post-déploiement

- [x] `https://systeme-monastere.vercel.app/api/health` → `{"ok":true}` (200)
- [x] Connexion admin fonctionne (session cookie `mf_session`, HttpOnly)
- [x] Routes testées : `/api/auth/me`, `/api/dashboard`, `/api/employees`, `/api/stock/refs`,
      `/api/settings`, `/api/terminals`, `/api/kiosk/terminals` → 200
- [x] Les 5 écrans se chargent, filtres compris (`?status=...`) — recette automatisée Edge :
      `node scripts/shoot.mjs` (msedge.exe headless, desktop 1440×900 + mobile 390×844) →
      29 captures + 3 PDF dans `%TEMP%\shots` : login, dashboard (KPIs DAS-01/05), outils +
      fiche, pointage complet (badge → selfie → motif → confirmation → fiche PDF), stock,
      magasins, espace, badges A4/A6, paramètres + carte maintenance (sauvegarde réelle
      créée, zone « Purger » constatée verrouillée), écrans mobiles
- [x] Un pointage selfie s'enregistre (testé : retard → motif exigé, photo stockée en base
      et resservie par `/files/selfies/...`)
- [x] **Rate-limit login** : 5 échecs consécutifs → 401 avec le nombre de tentatives restantes,
      6e tentative → **429** + `Retry-After` (compte bloqué 15 min, testé sur un login jetable)
- [x] **Cron de sauvegarde** : `npx vercel cron ls` → `/api/cron/backup` tous les jours à
      `0 3 * * *` ; exécution manuelle :
      `curl -H "Authorization: Bearer $CRON_SECRET" https://systeme-monastere.vercel.app/api/cron/backup`
      → dump Neon (18 tables, ~110 Ko gzip) vers le store Blob
- [x] **Routes admin** : `/api/admin/backups` (200), `POST /api/admin/backup` (gzip),
      `download?backup=…` (200), chemin hors `backups/` → 400,
      `/api/admin/reset-demo` sans confirmation → 400, sans session → 401
- [x] Les 5 comptes se connectent (anciens mdp `*226` → 401, mdp durcis → 200)

> La protection « Vercel Authentication » indiquée au deploy ne s'applique qu'aux aperçus
> (branch previews). L'alias de production `systeme-monastere.vercel.app` est public.

## Migration VPS (plus tard)

Le code Docker est intact :
```bash
git clone https://github.com/monsieurnoah7-hue/systeme-monastere.git
cd systeme-monastere
cp .env.example .env  # remplir
docker compose up -d --build
```
Importez le dump Neon : `cat dump.sql | docker compose exec -T db psql -U mf monastere`

## Limites du plan gratuit

| Poste | Limite | Impact |
|---|---|---|
| Vercel function duration | 60s (Hobby) — config : 30s | largement suffisant |
| Vercel bandwidth | 100 Go/mois | largement suffisant |
| Neon storage | 0,5 Go | ~2 ans d'attendance |
| Neon compute | 191,9 h/mois | suffisant (auto-suspend OK) |
| Selfies | en base64 (BDD) | 150 Ko × ~40/jour ≈ 18 Mo/mois |
| Vercel Blob | 1 Go stockage + 10 Go transfert/mois | dumps ~110 Ko/j × 30 j ≈ 3,3 Mo |
