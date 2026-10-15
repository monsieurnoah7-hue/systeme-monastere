#!/usr/bin/env bash
# =============================================================================
# Installation locale — Menuiserie Mont Fèbè
#
# Fonctionne sur Ubuntu 22.04/24.04 (recommandé) ou Debian 12
# Accès via le réseau local WiFi — pas d'internet requis au quotidien
#
# Usage : sudo bash install-local.sh
# =============================================================================

set -euo pipefail

INSTALL_DIR="/opt/menuiserie"
REPO="https://github.com/monsieurnoah7-hue/systeme-monastere.git"

echo "=============================================="
echo " Menuiserie Mont Fèbè — Installation locale"
echo "=============================================="

# -----------------------------------------------------------------------------
# 1. Mise à jour + dépendances
# -----------------------------------------------------------------------------
echo "[1/6] Mise à jour du système…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git ufw ca-certificates openssl >/dev/null

# -----------------------------------------------------------------------------
# 2. Docker + Docker Compose
# -----------------------------------------------------------------------------
if ! command -v docker &>/dev/null; then
  echo "[2/6] Installation de Docker…"
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
else
  echo "[2/6] Docker déjà installé."
fi

if ! docker compose version &>/dev/null; then
  apt-get install -y -qq docker-compose-plugin >/dev/null
fi

# -----------------------------------------------------------------------------
# 3. Pare-feu — autoriser le réseau local
# -----------------------------------------------------------------------------
echo "[3/6] Configuration du pare-feu…"
# Récupérer le sous-réseau local (ex: 192.168.1.0/24)
LOCAL_SUBNET=$(ip route | awk '/src/ {print $1}' | head -1)
if [[ -n "$LOCAL_SUBNET" ]]; then
  ufw allow from "$LOCAL_SUBNET" to any port 80,443 proto tcp >/dev/null 2>&1 || true
fi
ufw allow 22/tcp >/dev/null 2>&1 || true
ufw --force enable >/dev/null 2>&1 || true
echo "  → Réseau local autorisé : $LOCAL_SUBNET"

# -----------------------------------------------------------------------------
# 4. Clonage du dépôt
# -----------------------------------------------------------------------------
echo "[4/6] Clonage du dépôt…"
mkdir -p "$(dirname "$INSTALL_DIR")"
if [[ -d "$INSTALL_DIR/.git" ]]; then
  cd "$INSTALL_DIR" && git pull --ff-only
else
  git clone "$REPO" "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"

# -----------------------------------------------------------------------------
# 5. Génération du .env
# -----------------------------------------------------------------------------
echo "[5/6] Génération du fichier .env…"
PG_PASS=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
BOOT_PASS=$(openssl rand -base64 18 | tr -dc 'a-zA-Z0-9' | head -c 16)

# Détection de l'IP locale
LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")

cat > .env <<EOF
# Généré automatiquement le $(date -Iseconds)
# Accès local : http://$LOCAL_IP
DOMAIN=localhost
CORS_ORIGIN=http://$LOCAL_IP,http://localhost,http://localhost:5173

POSTGRES_USER=mf
POSTGRES_PASSWORD=$PG_PASS
POSTGRES_DB=monastere

SESSION_TTL_HOURS=12
BOOTSTRAP_PASSWORD=$BOOT_PASS
EOF
chmod 600 .env

echo "  → IP locale détectée : $LOCAL_IP"
echo "  → Mot de passe admin initial : $BOOT_PASS"

# -----------------------------------------------------------------------------
# 6. Lancement
# -----------------------------------------------------------------------------
echo "[6/6] Build et lancement…"
docker compose down --remove-orphans 2>/dev/null || true
docker compose up -d --build

# -----------------------------------------------------------------------------
# Sauvegarde quotidienne
# -----------------------------------------------------------------------------
echo "Configuration des sauvegardes…"
BACKUP_DIR="$INSTALL_DIR/backups"
mkdir -p "$BACKUP_DIR"

cat > /usr/local/bin/mf-backup.sh <<'BACKUP'
#!/usr/bin/env bash
set -euo pipefail
cd /opt/menuiserie
DATE=$(date +%Y%m%d-%H%M%S)
docker compose exec -T db pg_dump -U mf monastere | gzip > "backups/db-$DATE.sql.gz"
docker run --rm -v menuiserie_api-data:/data -v /opt/menuiserie/backups:/backup alpine \
  tar czf "/backup/files-$DATE.tar.gz" -C /data . 2>/dev/null || true
find backups -name '*.gz' -mtime +30 -delete
echo "$(date -Iseconds) OK" >> backups/backup.log
BACKUP
chmod +x /usr/local/bin/mf-backup.sh
(crontab -l 2>/dev/null | grep -v mf-backup; echo "0 2 * * * /usr/local/bin/mf-backup.sh") | crontab -

# -----------------------------------------------------------------------------
# Résumé
# -----------------------------------------------------------------------------
LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")

echo ""
echo "=============================================="
echo " ✅ Installation terminée !"
echo "=============================================="
echo ""
echo " Accès depuis le réseau local :"
echo "   http://$LOCAL_IP"
echo ""
echo " Accès sur cet ordinateur :"
echo "   http://localhost"
echo ""
echo " Admin    : admin"
echo " Mot de passe : $BOOT_PASS"
echo ""
echo " Autres comptes :"
echo "   direction / direction226"
echo "   magasinier / magasin226"
echo "   chef / atelier226"
echo "   ouvrier / atelier226"
echo ""
echo " Sauvegardes : quotidienne 02:00 (rétention 30 j)"
echo " Logs        : docker compose logs -f"
echo " Redémarrer  : docker compose restart"
echo ""
echo " ⚠️  Changez le mot de passe admin à la 1re connexion."
echo "=============================================="
