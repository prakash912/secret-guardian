$ErrorActionPreference = 'Stop'

$packageName = 'secret-guardian'
$url64 = 'https://github.com/YOUR_USERNAME/secret-guardian/releases/download/v1.0.0/secret-guardian-1.0.0-x64.exe'
$checksum64 = ''
$checksumType64 = 'sha256'

$packageArgs = @{
  packageName   = $packageName
  fileType      = 'EXE'
  url64bit      = $url64
  checksum64    = $checksum64
  checksumType64= $checksumType64
  silentArgs    = '/S'
  validExitCodes= @(0)
}

Install-ChocolateyPackage @packageArgs

