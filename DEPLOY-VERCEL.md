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

| Nom | Valeur |
|---|---|
| `DATABASE_URL` | connection string Neon (avec `-pooler` et `sslmode=require`) |
| `BOOTSTRAP_PASSWORD` | mot de passe fort aléatoire (compte `admin`) |

C'est tout : le front et l'API sont sur le même domaine → pas de CORS à configurer.

> **Identifiants de production** : le seed a créé 5 comptes de démo (`admin`/`direction`/
> `magasinier`/`chef`/`ouvrier`, mdp `*226`). Le compte `admin` a ensuite été durci avec la
> valeur de `BOOTSTRAP_PASSWORD` (voir Étape 6). Les autres comptes de démo gardent leur mdp
> simple : changez-les (Paramètres → Utilisateurs) avant toute mise en service réelle.

## Étape 4 — Deploy

1. Deployments → **Redeploy**
2. Au premier appel, l'API exécute automatiquement les migrations (verrou PostgreSQL,
   sûr même avec plusieurs fonctions démarrant en parallèle) et crée l'admin.
3. Ouvrez `https://systeme-monastere.vercel.app` → `admin` + `BOOTSTRAP_PASSWORD`

> Région confirmée : `vercel inspect` → `λ api/index [fra1]` (Francfort, à côté de Neon).

## Étape 5 — Seed des données de démonstration (optionnel)

En local, une fois, avec la variable `DATABASE_URL` de Vercel :
```bash
cd apps/api
DATABASE_URL="<neon-url>" npx tsx src/db/seed.ts
```
(ou `npx vercel env pull .env.local` puis `npm run seed`)

## Étape 6 — Durcir le compte admin (recommandé)

Le seed crée `admin/admin226` (démo). Pour une vraie utilisation, remplacez le hash par la
valeur de `BOOTSTRAP_PASSWORD` :
```bash
cd apps/api
DATABASE_URL="<neon-url>" TARGET_PASSWORD="<mot-de-passe-fort>" npx tsx src/db/set-admin-password.ts
```
Vérification : l'ancien mdp doit renvoyer 401, le nouveau 200.

## Vérifications post-déploiement

- [x] `https://systeme-monastere.vercel.app/api/health` → `{"ok":true}` (200)
- [x] Connexion admin fonctionne (session cookie `mf_session`, HttpOnly)
- [x] Routes testées : `/api/auth/me`, `/api/dashboard`, `/api/employees`, `/api/stock/refs`,
      `/api/settings`, `/api/terminals`, `/api/kiosk/terminals` → 200
- [ ] Les 5 écrans se chargent, filtres compris (`?status=...`)
- [x] Un pointage selfie s'enregistre (testé : retard → motif exigé, photo stockée en base
      et resservie par `/files/selfies/...`)

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
