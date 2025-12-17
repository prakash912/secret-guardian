# PowerShell script to calculate checksums for Windows installers
# Run this after: npm run make

Write-Host "Calculating checksums for Secret Guardian installers..." -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path "out\make")) {
    Write-Host "Error: out\make directory not found. Run 'npm run make' first." -ForegroundColor Red
    exit 1
}

Write-Host "=== Windows EXE ===" -ForegroundColor Yellow
$exeFiles = Get-ChildItem -Path "out\make" -Filter "*.exe" -ErrorAction SilentlyContinue
if ($exeFiles) {
    foreach ($file in $exeFiles) {
        Write-Host "$($file.Name):" -ForegroundColor White
        $hash = (Get-FileHash -Path $file.FullName -Algorithm SHA256).Hash
        Write-Host "  SHA256: $hash" -ForegroundColor Green
    }
} else {
    Write-Host "  No EXE files found" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Done! Copy these checksums to your Chocolatey configuration files." -ForegroundColor Cyan

