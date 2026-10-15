#!/usr/bin/env bash
# =============================================================================
# Installation automatisée — Menuiserie Mont Fèbè sur Oracle Cloud Always Free
#
# Prérequis : VM Oracle Cloud (Ubuntu 24.04 / ARM Ampere A1 ou AMD), accès root
# Usage     : sudo bash install-oracle.sh <IP_PUBLIQUE>
# Exemple   : sudo bash install-oracle.sh 129.151.40.22
# =============================================================================

set -euo pipefail

IP="${1:-}"
if [[ -z "$IP" ]]; then
  echo "Usage: sudo bash install-oracle.sh <IP_PUBLIQUE>"
  echo "Exemple: sudo bash install-oracle.sh 129.151.40.22"
  exit 1
fi

# nip.io résout <IP>.nip.io → HTTPS valide Let's Encrypt sans acheter de domaine
DOMAIN="${IP}.nip.io"
REPO="https://github.com/monsieurnoah7-hue/systeme-monastere.git"
INSTALL_DIR="/opt/menuiserie"

echo "=============================================="
echo " Menuiserie Mont Fèbè — Installation Oracle"
echo " IP: $IP"
echo " Domaine: $DOMAIN (nip.io — gratuit)"
echo " Dossier: $INSTALL_DIR"
echo "=============================================="

# -----------------------------------------------------------------------------
# 1. Mise à jour + dépendances
# -----------------------------------------------------------------------------
echo "[1/7] Mise à jour du système…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git ufw ca-certificates gnupg lsb-release >/dev/null

# -----------------------------------------------------------------------------
# 2. Docker + Docker Compose
# -----------------------------------------------------------------------------
if ! command -v docker &>/dev/null; then
  echo "[2/7] Installation de Docker…"
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
else
  echo "[2/7] Docker déjà installé."
fi

if ! docker compose version &>/dev/null; then
  echo "       Installation du plugin Docker Compose…"
  apt-get install -y -qq docker-compose-plugin >/dev/null
fi

# -----------------------------------------------------------------------------
# 3. Pare-feu (ufw)
# -----------------------------------------------------------------------------
echo "[3/7] Configuration du pare-feu…"
ufw allow 22/tcp   >/dev/null 2>&1 || true
ufw allow 80/tcp   >/dev/null 2>&1 || true
ufw allow 443/tcp  >/dev/null 2>&1 || true
ufw --force enable  >/dev/null 2>&1 || true

# -----------------------------------------------------------------------------
# 4. Clonage du dépôt
# -----------------------------------------------------------------------------
echo "[4/7] Clonage du dépôt GitHub…"
mkdir -p "$(dirname "$INSTALL_DIR")"
if [[ -d "$INSTALL_DIR/.git" ]]; then
  cd "$INSTALL_DIR" && git pull --ff-only
else
  git clone "$REPO" "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"

# -----------------------------------------------------------------------------
# 5. Génération du .env (mots de passe forts aléatoires)
# -----------------------------------------------------------------------------
echo "[5/7] Génération du fichier .env…"
PG_PASS=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
BOOT_PASS=$(openssl rand -base64 18 | tr -dc 'a-zA-Z0-9' | head -c 16)

cat > .env <<EOF
# Généré automatiquement le $(date -Iseconds)
DOMAIN=$DOMAIN
CORS_ORIGIN=https://$DOMAIN

POSTGRES_USER=mf
POSTGRES_PASSWORD=$PG_PASS
POSTGRES_DB=monastere

SESSION_TTL_HOURS=12
BOOTSTRAP_PASSWORD=$BOOT_PASS
EOF
chmod 600 .env

echo "  → Mot de passe admin initial : $BOOT_PASS"
echo "  → (à changer après la première connexion)"

# -----------------------------------------------------------------------------
# 6. Lancement Docker Compose
# -----------------------------------------------------------------------------
echo "[6/7] Build et lancement des conteneurs…"
docker compose down --remove-orphans 2>/dev/null || true
docker compose up -d --build

# -----------------------------------------------------------------------------
# 7. Sauvegarde quotidienne automatique (cron)
# -----------------------------------------------------------------------------
echo "[7/7] Configuration des sauvegardes quotidiennes…"
BACKUP_DIR="$INSTALL_DIR/backups"
mkdir -p "$BACKUP_DIR"

cat > /usr/local/bin/mf-backup.sh <<'BACKUP'
#!/usr/bin/env bash
set -euo pipefail
INSTALL_DIR="/opt/menuiserie"
BACKUP_DIR="$INSTALL_DIR/backups"
DATE=$(date +%Y%m%d-%H%M%S)
cd "$INSTALL_DIR"
# Dump PostgreSQL compressé
docker compose exec -T db pg_dump -U mf monastere | gzip > "$BACKUP_DIR/db-$DATE.sql.gz"
# Photos/selfies (dossier api-data)
docker run --rm -v menuiserie_api-data:/data -v "$BACKUP_DIR":/backup alpine \
  tar czf "/backup/files-$DATE.tar.gz" -C /data . 2>/dev/null || true
# Rotation : garder 30 jours
find "$BACKUP_DIR" -name '*.gz' -mtime +30 -delete
echo "$(date -Iseconds) backup OK" >> "$BACKUP_DIR/backup.log"
BACKUP
chmod +x /usr/local/bin/mf-backup.sh

# Cron quotidien à 02:00
(crontab -l 2>/dev/null | grep -v mf-backup; echo "0 2 * * * /usr/local/bin/mf-backup.sh") | crontab -

# -----------------------------------------------------------------------------
# Résumé
# -----------------------------------------------------------------------------
echo ""
echo "=============================================="
echo " ✅ Installation terminée !"
echo "=============================================="
echo ""
echo " URL:      https://$DOMAIN"
echo " Admin:    admin"
echo " Mot de passe : $BOOT_PASS"
echo ""
echo " Comptes de démonstration :"
echo "   direction / direction226"
echo "   magasinier / magasin226"
echo "   chef / atelier226"
echo "   ouvrier / atelier226"
echo ""
echo " Sauvegardes : quotidienne à 02:00 (rétention 30 j)"
echo " Logs:       docker compose logs -f"
echo " Redémarrer: docker compose restart"
echo ""
echo " ⚠️  Changez le mot de passe admin dès la 1re connexion."
echo "=============================================="
