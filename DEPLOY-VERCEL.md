# Déploiement gratuit — Vercel + Neon PostgreSQL

> 0 FCFA/mois, sans carte bancaire. Migration VPS future : `docker compose up -d`.

## Étape 1 — Créer les comptes (5 min, gratuits)

### Neon.tech (base de données PostgreSQL)
1. Allez sur https://neon.tech → **Sign up** → continuez avec GitHub
2. Créez un projet : nom `menuiserie`, région **AWS Eu-west-3 (Paris)** ou **AWS us-east-1**
3. Dans **Connection Details**, copiez le **pooled connection string** (commence par `postgresql://...`)
   ⚠️ Utilisez celui avec `-pooler` (mode pool)

### Vercel (frontend + API)
1. Allez sur https://vercel.com → **Sign up** → continuez avec GitHub
2. Le compte gratuit suffit (Hobby plan)

## Étape 2 — Configurer les variables d'environnement sur Vercel

1. Sur https://vercel.com/new → importez le dépôt `monsieurnoah7-hue/systeme-monastere`
2. **Ne lancez pas le build encore** → cliquez sur **Continue to Dashboard**
3. Settings → Environment Variables, ajoutez :

| Nom | Valeur |
|---|---|
| `DATABASE_URL` | votre connection string Neon (avec `-pooler`) |
| `CORS_ORIGIN` | `https://<projet>.vercel.app` (affiché après 1er build) |
| `BOOTSTRAP_PASSWORD` | mot de passe fort aléatoire |
| `NODE_ENV` | `production` |

## Étape 3 — Build & Deploy

1. Deployments → **Redeploy** (le build utilise `vercel.json`)
2. Après le build, notez l'URL (ex. `https://systeme-monastere-xxx.vercel.app`)
3. Mettez à jour `CORS_ORIGIN` avec cette URL → Redeploy à nouveau
4. Ouvrez l'URL → connectez-vous avec `admin` + `BOOTSTRAP_PASSWORD`

## Étape 4 — Seed des données de démonstration (optionnel)

Sur Vercel : Terminal (ou `vercel exec`) :
```bash
npm run seed -w apps/api
```
Ou en local, pointé vers Neon :
```bash
cd apps/api
DATABASE_URL="<neon-url>" npx tsx src/db/seed.ts
```

## Vérifications post-déploiement

- [ ] `https://<url>/api/health` → `{"ok":true}`
- [ ] Connexion admin fonctionne
- [ ] Les 5 écrans se chargent
- [ ] Un pointage selfie s'enregistre (selfie stocké en base)

## Migration VPS (plus tard)

Le code Docker est intact :
```bash
git clone https://github.com/monsieurnoah7-hue/systeme-monastere.git
cd systeme-monastere
cp .env.example .env  # remplir
docker compose up -d --build
```
Importez le dump Neon dans PostgreSQL : `cat dump.sql | docker compose exec -T db psql -U mf monastere`

## Limites du plan gratuit

| Poste | Limite | Impact |
|---|---|---|
| Vercel function duration | 60s (Hobby) | suffisant |
| Vercel bandwidth | 100 Go/mois | largement suffisant |
| Neon storage | 0,5 Go | ~2 ans d'attendance |
| Neon compute | 191,9 h/mois | suffisant (auto-suspend OK) |
| Selfies | en base64 (BDD) | 150 Ko × ~40/jour = ~18 Mo/mois |
