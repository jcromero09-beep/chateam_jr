@echo off
REM Backup PostgreSQL para JR Chateam

set BACKUP_DIR=C:\backups\chateam\postgres
set DATE=%date:~-4%%date:~3,2%%date:~0,2%_%time:~0,2%%time:~3,2%%time:~6,2%
set DATE=%DATE: =0%

set DB_NAME=chateam
set DB_USER=chateam_app
set DB_HOST=127.0.0.1
set DB_PORT=5434
set PGPASSWORD=app123456

echo Realizando backup de PostgreSQL...

REM Backup con pg_dump
"C:\Program Files\PostgreSQL\13\bin\pg_dump.exe" ^
    -h %DB_HOST% ^
    -p %DB_PORT% ^
    -U %DB_USER% ^
    -F c ^
    -b ^
    -v ^
    -f "%BACKUP_DIR%\chateam_full_%DATE%.backup" ^
    %DB_NAME%

if %ERRORLEVEL% EQU 0 (
    echo [%time%] Backup PostgreSQL exitoso: chateam_full_%DATE%.backup
    echo [%date% %time%] Backup PostgreSQL exitoso >> "%BACKUP_DIR%\backup.log"
) else (
    echo [%time%] ERROR en backup PostgreSQL
    echo [%date% %time%] ERROR en backup PostgreSQL >> "%BACKUP_DIR%\backup.log"
    exit /b 1
)

REM Limpiar backups antiguos (mayores a 30 días)
forfiles /P "%BACKUP_DIR%" /M *.backup /D -30 /C "cmd /c del @file" 2>nul

exit /b 0
