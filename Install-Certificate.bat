@echo off
setlocal
title MultiChatStream - Pasang Sertifikat Kepercayaan Windows

echo ========================================================
echo   MultiChatStream - Pemasangan Sertifikat Keamanan Windows
echo ========================================================
echo.

:: Cek apakah dijalankan sebagai Administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [PERINGATAN] File ini membutuhkan hak akses Administrator.
    echo.
    echo Silakan TUTUP jendela ini, lalu:
    echo KLIK KANAN file 'Install-Certificate.bat' ^> pilih 'Run as administrator'
    echo.
    pause
    exit /b 1
)

set "CER_PATH=%~dp0certs\LiveChatPro.cer"
if not exist "%CER_PATH%" (
    set "CER_PATH=%~dp0LiveChatPro.cer"
)

if not exist "%CER_PATH%" (
    echo [ERROR] File LiveChatPro.cer tidak ditemukan!
    echo Pastikan file LiveChatPro.cer berada di folder yang sama atau di dalam folder 'certs'.
    echo.
    pause
    exit /b 1
)

echo Memasang sertifikat ke Trusted Root Certification Authorities...
certutil -addstore -f "Root" "%CER_PATH%" >nul 2>&1

if %errorLevel% equ 0 (
    echo.
    echo ========================================================
    echo   [SUKSES] Sertifikat MultiChatStream Berhasil Dipasang!
    echo ========================================================
    echo.
    echo Komputer ini sekarang mengenali dan mempercayai aplikasi
    echo MultiChatStream secara resmi tanpa peringatan SmartScreen.
    echo.
) else (
    echo.
    echo [GAGAL] Terjadi kesalahan saat memasang sertifikat.
    echo Kode error: %errorLevel%
    echo.
)

pause
