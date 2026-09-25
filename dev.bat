@echo off
title MusicGo - Arranque
cd /d "%~dp0"

echo ============================================
echo  🎵 MusicGo - Arrancando servidores...
echo ============================================
echo.

start "MusicGo Backend"  cmd /k "cd /d "%~dp0backend" && python -m uvicorn app:app --host 127.0.0.1 --port 8000"
start "MusicGo Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

timeout /t 3 >nul
start "" "http://localhost:5173"
echo.
echo  MusicGo listo:  http://localhost:5173
echo  (Deja abiertas las dos ventanas que se abrieron)
echo.
pause >nul