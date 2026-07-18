@echo off
REM Script para iniciar Backend y Frontend en desarrollo
REM Paso 10: Testing del flujo completo

echo ========================================
echo JR CHATEAM v6.0.0 - DEV STARTUP
echo ========================================
echo.

echo [1/4] Verificando servicios requeridos...
echo.

REM Verificar PostgreSQL
netstat -an | findstr ":5434.*LISTENING" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] PostgreSQL corriendo en puerto 5434
) else (
    echo [ERROR] PostgreSQL NO esta corriendo en puerto 5434
    echo Por favor inicia PostgreSQL primero.
    pause
    exit /b 1
)

REM Verificar Redis
netstat -an | findstr ":6379.*LISTENING" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] Redis corriendo en puerto 6379
) else (
    echo [ERROR] Redis NO esta corriendo en puerto 6379
    echo Por favor inicia Redis primero.
    pause
    exit /b 1
)

echo.
echo [2/4] Iniciando Backend en puerto 3001...
echo.
start "JR CHATEAM Backend" cmd /k "npm run dev"

REM Esperar 5 segundos para que el backend inicie
timeout /t 5 /nobreak >nul

echo.
echo [3/4] Iniciando Frontend en puerto 3000...
echo.
start "JR CHATEAM Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo [4/4] Servicios iniciados!
echo.
echo ========================================
echo SERVICIOS CORRIENDO:
echo ========================================
echo  Backend:  http://localhost:3001
echo  Frontend: http://localhost:3000
echo  Health:   http://localhost:3001/health
echo ========================================
echo.
echo Presiona cualquier tecla para abrir el navegador...
pause >nul

start http://localhost:3000

echo.
echo Servicios ejecutandose en ventanas separadas.
echo Cierra las ventanas de CMD para detener los servicios.
echo.
pause
