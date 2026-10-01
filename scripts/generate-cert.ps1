$certDir = Join-Path $PSScriptRoot "..\certs"
if (!(Test-Path $certDir)) {
    New-Item -ItemType Directory -Path $certDir | Out-Null
}

$pfxPath = Join-Path $certDir "LiveChatPro.pfx"
$cerPath = Join-Path $certDir "LiveChatPro.cer"
$pfxPassword = "LiveChatPro2026!"

Write-Host "Membuat Self-Signed Code Signing Certificate..."
$cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=LiveChat Pro" -KeySpec Signature -CertStoreLocation "Cert:\CurrentUser\My" -NotAfter (Get-Date).AddYears(5)

Write-Host "Mengekspor sertifikat PFX (Private Key)..."
$securePassword = ConvertTo-SecureString -String $pfxPassword -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $securePassword | Out-Null

Write-Host "Mengekspor sertifikat CER (Public Key)..."
Export-Certificate -Cert $cert -FilePath $cerPath | Out-Null

Write-Host "Sertifikat berhasil dibuat di: $certDir"
Write-Host "Thumbprint: $($cert.Thumbprint)"
