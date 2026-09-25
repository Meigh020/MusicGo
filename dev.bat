@echo off
title MusicGo - Arranque
cd /d "%~dp0"

echo ============================================
echo   MusicGo - Arrancando servidores...
echo ============================================
echo.

rem /D fija el directorio de trabajo de cada ventana:
rem evita comillas anidadas, que fallan con rutas con espacios
start "MusicGo Backend" /D "%~dp0backend" cmd /k python -m uvicorn app:app --host 127.0.0.1 --port 8000
start "MusicGo Frontend" /D "%~dp0frontend" cmd /k npm run dev

timeout /t 3 >nul
start "" "http://localhost:5173"
echo.
echo   MusicGo listo:  http://localhost:5173
echo   (Mantén abiertas las dos ventanas que se abrieron)
echo.
pause >nul