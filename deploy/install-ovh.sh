#!/usr/bin/env bash
# =============================================================================
# Installation automatisée — Menuiserie Mont Fèbè sur VPS OVHcloud
#
# Prérequis : VPS OVH (Ubuntu 24.04 / 22.04 ou Debian 12), accès root/sudo
# Usage     : sudo bash install-ovh.sh <IP_PUBLIQUE> [DOMAINE]
# Exemples  :
#   Sans nom de domaine : sudo bash install-ovh.sh 51.75.xx.xx
#   Avec nom de domaine : sudo bash install-ovh.sh 51.75.xx.xx atelier.mondomaine.com
# =============================================================================

set -euo pipefail

IP="${1:-}"
CUSTOM_DOMAIN="${2:-}"

if [[ -z "$IP" ]]; then
  echo "Usage: sudo bash install-ovh.sh <IP_PUBLIQUE> [DOMAINE]"
  echo "Exemple (sans domaine) : sudo bash install-ovh.sh 51.75.xx.xx"
  echo "Exemple (avec domaine) : sudo bash install-ovh.sh 51.75.xx.xx atelier.mondomaine.com"
  exit 1
fi

if [[ -n "$CUSTOM_DOMAIN" ]]; then
  DOMAIN="$CUSTOM_DOMAIN"
else
  # nip.io résout <IP>.nip.io → HTTPS Let's Encrypt valide sans acheter de domaine
  DOMAIN="${IP}.nip.io"
fi

REPO="https://github.com/monsieurnoah7-hue/systeme-monastere.git"
INSTALL_DIR="/opt/menuiserie"

echo "=============================================="
echo " Menuiserie Mont Fèbè — Installation OVH"
echo " IP      : $IP"
echo " Domaine : $DOMAIN"
echo " Dossier : $INSTALL_DIR"
echo "=============================================="

# -----------------------------------------------------------------------------
# 1. Mise à jour + dépendances
# -----------------------------------------------------------------------------
echo "[1/8] Mise à jour du système…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git ufw ca-certificates gnupg lsb-release openssl >/dev/null

# -----------------------------------------------------------------------------
# 2. Swap 2 Go (utile sur les petits VPS OVH Starter lors du build Docker)
# -----------------------------------------------------------------------------
if [[ -z "$(swapon --show --noheadings)" ]] && [[ ! -f /swapfile ]]; then
  echo "[2/8] Création d'un fichier swap de 2 Go…"
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
else
  echo "[2/8] Swap déjà actif."
fi

# -----------------------------------------------------------------------------
# 3. Docker + Docker Compose
# -----------------------------------------------------------------------------
if ! command -v docker &>/dev/null; then
  echo "[3/8] Installation de Docker…"
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
else
  echo "[3/8] Docker déjà installé."
fi

if ! docker compose version &>/dev/null; then
  echo "       Installation du plugin Docker Compose…"
  apt-get install -y -qq docker-compose-plugin >/dev/null
fi

# -----------------------------------------------------------------------------
# 4. Pare-feu (ufw)
# -----------------------------------------------------------------------------
echo "[4/8] Configuration du pare-feu (22, 80, 443)…"
ufw allow 22/tcp   >/dev/null 2>&1 || true
ufw allow 80/tcp   >/dev/null 2>&1 || true
ufw allow 443/tcp  >/dev/null 2>&1 || true
ufw --force enable  >/dev/null 2>&1 || true

# -----------------------------------------------------------------------------
# 5. Clonage ou mise à jour du dépôt
# -----------------------------------------------------------------------------
echo "[5/8] Récupération du dépôt GitHub…"
mkdir -p "$(dirname "$INSTALL_DIR")"
if [[ -d "$INSTALL_DIR/.git" ]]; then
  cd "$INSTALL_DIR" && git pull --ff-only
else
  git clone "$REPO" "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"

# -----------------------------------------------------------------------------
# 6. Génération du .env (conservé s'il existe déjà)
# -----------------------------------------------------------------------------
if [[ -f .env ]]; then
  echo "[6/8] Fichier .env déjà présent (conservé)."
  BOOT_PASS="(inchangé — voir $INSTALL_DIR/.env)"
else
  echo "[6/8] Génération du fichier .env…"
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
fi

# -----------------------------------------------------------------------------
# 7. Lancement Docker Compose
# -----------------------------------------------------------------------------
echo "[7/8] Build et lancement des conteneurs…"
docker compose down --remove-orphans 2>/dev/null || true
docker compose up -d --build

# -----------------------------------------------------------------------------
# 8. Sauvegarde quotidienne automatique (cron à 02:00)
# -----------------------------------------------------------------------------
echo "[8/8] Configuration des sauvegardes quotidiennes…"
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
# Photos/selfies (volume api-data)
docker run --rm -v menuiserie_api-data:/data -v "$BACKUP_DIR":/backup alpine \
  tar czf "/backup/files-$DATE.tar.gz" -C /data . 2>/dev/null || true
# Rotation : garder 30 jours
find "$BACKUP_DIR" -name '*.gz' -mtime +30 -delete
echo "$(date -Iseconds) backup OK" >> "$BACKUP_DIR/backup.log"
BACKUP
chmod +x /usr/local/bin/mf-backup.sh

(crontab -l 2>/dev/null | grep -v mf-backup; echo "0 2 * * * /usr/local/bin/mf-backup.sh") | crontab -

# -----------------------------------------------------------------------------
# Résumé
# -----------------------------------------------------------------------------
echo ""
echo "=============================================="
echo " ✅ Installation OVH terminée !"
echo "=============================================="
echo ""
echo " URL      : https://$DOMAIN"
echo " Mot de passe bootstrap : $BOOT_PASS"
echo ""
echo " Note OVH : vérifiez dans votre espace client OVHcloud"
echo " que les ports 80 et 443 ne sont pas bloqués par le"
echo " Network Firewall s'il est activé sur l'IP du VPS."
echo ""
echo " Sauvegardes automatiques : $BACKUP_DIR (tous les jours à 02h00)"
