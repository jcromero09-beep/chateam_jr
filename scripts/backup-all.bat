@echo off
REM Backup completo JR Chateam v6.0.0 (Windows)

echo ========================================
echo   JR CHATEAM v6.0.0 - Backup Completo
echo ========================================
echo.

set BACKUP_ROOT=C:\backups\chateam
set DATE=%date:~-4%-%date:~3,2%-%date:~0,2%_%time:~0,2%-%time:~3,2%-%time:~6,2%
set DATE=%DATE: =0%

REM Crear directorios
if not exist "%BACKUP_ROOT%" mkdir "%BACKUP_ROOT%"
if not exist "%BACKUP_ROOT%\postgres" mkdir "%BACKUP_ROOT%\postgres"
if not exist "%BACKUP_ROOT%\redis" mkdir "%BACKUP_ROOT%\redis"
if not exist "%BACKUP_ROOT%\minio" mkdir "%BACKUP_ROOT%\minio"
if not exist "%BACKUP_ROOT%\config" mkdir "%BACKUP_ROOT%\config"

echo [%time%] Iniciando backup de PostgreSQL...
call scripts\backup-postgres.bat

echo [%time%] Iniciando backup de Redis...
call scripts\backup-redis.bat

echo [%time%] Iniciando backup de configuracion...
call scripts\backup-config.bat

echo.
echo ========================================
echo   Backup Completo Finalizado
echo ========================================
echo Backups guardados en: %BACKUP_ROOT%
echo.

REM Registrar en log
echo [%date% %time%] Backup completo finalizado >> "%BACKUP_ROOT%\backup.log"
