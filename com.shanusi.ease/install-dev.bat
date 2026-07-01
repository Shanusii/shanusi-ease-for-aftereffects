@echo off
REM Pasang extension ke folder CEP via directory junction (tanpa perlu admin).
REM Edit file di sini akan langsung kebaca AE setelah panel di-reload.

setlocal
set "SRC=%~dp0"
if "%SRC:~-1%"=="\" set "SRC=%SRC:~0,-1%"
set "EXTDIR=%APPDATA%\Adobe\CEP\extensions"
set "DST=%EXTDIR%\com.shanusi.ease"

if not exist "%EXTDIR%" mkdir "%EXTDIR%"
if exist "%DST%" (
    echo Menghapus link lama...
    rmdir "%DST%" 2>nul
)

mklink /J "%DST%" "%SRC%"
if %errorlevel%==0 (
    echo.
    echo SUKSES. Extension terpasang sebagai junction:
    echo   %DST%  -^>  %SRC%
    echo.
    echo Langkah berikutnya:
    echo   1. Jalankan enable-debug.reg ^(double-click, Yes^) sekali saja.
    echo   2. Restart After Effects.
    echo   3. Buka: Window ^> Extensions ^> Shanusi Ease
) else (
    echo GAGAL membuat junction. Coba jalankan ulang, atau copy folder manual ke:
    echo   %EXTDIR%
)
echo.
pause
