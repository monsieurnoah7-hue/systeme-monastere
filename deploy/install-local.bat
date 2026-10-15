@echo off
REM =============================================================================
REM Installation locale — Menuiserie Mont Fèbè (Windows 10/11)
REM Prérequis : Docker Desktop installé et démarré
REM Usage     : double-cliquer sur install-local.bat
REM =============================================================================

echo ==============================================
echo  Menuiserie Mont Febe - Installation locale
echo ==============================================
echo.

REM Verifier Docker
docker --version >nul 2>&1
if errorlevel 1 (
    echo [ERREUR] Docker n'est pas installe.
    echo.
    echo Installez Docker Desktop : https://docs.docker.com/desktop/setup/install/windows-install/
    echo Redemarrez l'ordinateur puis relancez ce script.
    pause
    exit /b 1
)

docker compose version >nul 2>&1
if errorlevel 1 (
    echo [ERREUR] Docker Compose n'est pas disponible.
    echo Mettez a jour Docker Desktop.
    pause
    exit /b 1
)

echo [1/4] Docker OK.
echo.

REM Cloner ou mettre a jour le depot
set INSTALL_DIR=C:\menuiserie
if exist "%INSTALL_DIR%\.git" (
    echo [2/4] Mise a jour du depot...
    cd /d "%INSTALL_DIR%" && git pull --ff-only
) else (
    echo [2/4] Clonage du depot...
    git clone https://github.com/monsieurnoah7-hue/systeme-monastere.git "%INSTALL_DIR%"
)
cd /d "%INSTALL_DIR%"
echo.

REM Generer .env si absent
if not exist .env (
    echo [3/4] Generation du fichier .env...
    powershell -Command ^
        "$pg = -join ((48..57)+(97..122) | Get-Random -Count 24 | % {[char]$_});" ^
        "$boot = -join ((48..57)+(97..122) | Get-Random -Count 16 | % {[char]$_});" ^
        "$env_content = @"
        "DOMAIN=localhost"
        "CORS_ORIGIN=http://localhost,http://localhost:5173"
        ""
        "POSTGRES_USER=mf"
        "POSTGRES_PASSWORD=$pg"
        "POSTGRES_DB=monastere"
        ""
        "SESSION_TTL_HOURS=12"
        "BOOTSTRAP_PASSWORD=$boot"
        "@;" ^
        "Set-Content -Path .env -Value $env_content -Encoding UTF8;" ^
        "Write-Host '  Admin password:' $boot"
) else (
    echo [3/4] .env deja configure.
)
echo.

REM Lancer
echo [4/4] Build et demarrage des conteneurs...
docker compose down --remove-orphans 2>nul
docker compose up -d --build

echo.
echo ==============================================
echo  Installation terminee !
echo ==================================
echo.
echo  Acces : http://localhost
echo.
echo  Comptes :
echo    admin / (voir .env - BOOTSTRAP_PASSWORD)
echo    direction / direction226
echo    magasinier / magasin226
echo    chef / atelier226
echo    ouvrier / atelier226
echo.
echo  Pour demarrer au prochain boot :
echo    Docker Desktop + tapez : docker compose up -d
echo.
echo  Pour arreter : docker compose down
echo.
pause
