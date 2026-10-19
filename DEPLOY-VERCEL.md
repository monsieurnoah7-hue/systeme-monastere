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

## Étape 4 — Deploy

1. Deployments → **Redeploy**
2. Au premier appel, l'API exécute automatiquement les migrations (verrou PostgreSQL,
   sûr même avec plusieurs fonctions démarrant en parallèle) et crée l'admin.
3. Ouvrez l'URL (ex. `https://systeme-monastere-xxx.vercel.app`) → `admin` + `BOOTSTRAP_PASSWORD`

## Étape 5 — Seed des données de démonstration (optionnel)

En local, une fois, avec la variable `DATABASE_URL` de Vercel :
```bash
cd apps/api
DATABASE_URL="<neon-url>" npx tsx src/db/seed.ts
```
(ou `npx vercel env pull .env.local` puis `npm run seed`)

## Vérifications post-déploiement

- [ ] `https://<url>/api/health` → `{"ok":true}`
- [ ] Connexion admin fonctionne
- [ ] Les 5 écrans se chargent, filtres compris (`?status=...`)
- [ ] Un pointage selfie s'enregistre (selfie stocké en base, image affichée)

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
