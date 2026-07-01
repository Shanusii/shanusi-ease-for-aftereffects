@echo off
REM ============================================================
REM  Build Shanusi Ease -> ShanusiEase.zxp (signed)
REM  Butuh ZXPSignCmd.exe (dari Adobe) di folder ini atau di PATH.
REM ============================================================
setlocal
set "ROOT=%~dp0"
set "SRC=%ROOT%com.shanusi.ease"
set "OUT=%ROOT%ShanusiEase.zxp"
set "CERT=%ROOT%cert.p12"
set "PASS=shanusi"

where ZXPSignCmd >nul 2>nul
if %errorlevel%==0 (
    set "ZXP=ZXPSignCmd"
) else if exist "%ROOT%ZXPSignCmd.exe" (
    set "ZXP=%ROOT%ZXPSignCmd.exe"
) else (
    echo [!] ZXPSignCmd.exe tidak ditemukan.
    echo     Download dari Adobe lalu taruh di: %ROOT%
    pause & exit /b 1
)

if not exist "%CERT%" (
    echo [*] Membuat sertifikat self-signed ^(cert.p12^)...
    "%ZXP%" -selfSignedCert ID Self Shanusi "Shanusi Ease" %PASS% "%CERT%"
    if errorlevel 1 ( echo [!] Gagal membuat sertifikat. & pause & exit /b 1 )
)

if exist "%OUT%" del "%OUT%"
echo [*] Signing extension...
"%ZXP%" -sign "%SRC%" "%OUT%" "%CERT%" %PASS% -tsa http://timestamp.digicert.com

if exist "%OUT%" (
    echo.
    echo [OK] Selesai: %OUT%
    echo      Install via Anastasiy Extension Manager / ZXP Installer.
) else (
    echo [!] Signing gagal.
)
pause
