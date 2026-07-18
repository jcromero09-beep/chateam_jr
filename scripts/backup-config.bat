@echo off
REM Backup de Configuración para JR Chateam

set BACKUP_DIR=C:\backups\chateam\config
set DATE=%date:~-4%%date:~3,2%%date:~0,2%_%time:~0,2%%time:~3,2%%time:~6,2%
set DATE=%DATE: =0%
set PROJECT_DIR=%~dp0..

echo Realizando backup de configuración...

REM Crear archivo tar (requiere 7zip o similar)
set CONFIG_BACKUP=%BACKUP_DIR%\config_%DATE%.zip

REM Usar PowerShell para comprimir
powershell Compress-Archive -Path "%PROJECT_DIR%\.env","%PROJECT_DIR%\ecosystem.config.js","%PROJECT_DIR%\package.json","%PROJECT_DIR%\tsconfig.json" -DestinationPath "%CONFIG_BACKUP%" -Force

if %ERRORLEVEL% EQU 0 (
    echo [%time%] Backup configuración exitoso: config_%DATE%.zip
    echo [%date% %time%] Backup configuración exitoso >> "%BACKUP_DIR%\backup.log"
) else (
    echo [%time%] ERROR en backup de configuración
    echo [%date% %time%] ERROR en backup de configuración >> "%BACKUP_DIR%\backup.log"
    exit /b 1
)

REM Limpiar backups antiguos (mayores a 90 días)
forfiles /P "%BACKUP_DIR%" /M *.zip /D -90 /C "cmd /c del @file" 2>nul

exit /b 0
