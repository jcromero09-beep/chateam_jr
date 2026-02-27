@echo off
REM Backup Redis para JR Chateam

set BACKUP_DIR=C:\backups\chateam\redis
set DATE=%date:~-4%%date:~3,2%%date:~0,2%_%time:~0,2%%time:~3,2%%time:~6,2%
set DATE=%DATE: =0%

echo Realizando backup de Redis...

REM Forzar snapshot
redis-cli BGSAVE

REM Esperar 3 segundos para que termine el snapshot
timeout /t 3 /nobreak >nul

REM Copiar dump.rdb si existe
if exist "C:\Redis\dump.rdb" (
    copy "C:\Redis\dump.rdb" "%BACKUP_DIR%\redis_%DATE%.rdb"

    if %ERRORLEVEL% EQU 0 (
        echo [%time%] Backup Redis exitoso: redis_%DATE%.rdb
        echo [%date% %time%] Backup Redis exitoso >> "%BACKUP_DIR%\backup.log"
    ) else (
        echo [%time%] ERROR copiando dump.rdb
        exit /b 1
    )
) else (
    echo [%time%] ADVERTENCIA: No se encontró dump.rdb
    echo [%date% %time%] ADVERTENCIA: No se encontró dump.rdb >> "%BACKUP_DIR%\backup.log"
)

REM Limpiar backups antiguos (mayores a 30 días)
forfiles /P "%BACKUP_DIR%" /M *.rdb /D -30 /C "cmd /c del @file" 2>nul

exit /b 0
