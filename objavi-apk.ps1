# Objavi novu verziju Android aplikacije:
#   1. izgradi APK/AAB u WSL-u (android/izgradi.sh)
#   2. napravi GitHub release v<verzija> s datotekom radne-nedjelje.apk
#   3. upise docs/verzija.json i objavi kod -> instalirane aplikacije pokazu "Dostupna je nova verzija"
#
#   powershell -ExecutionPolicy Bypass -File .\objavi-apk.ps1 -Opis "sto je novo"
# Prije pokretanja povecati versionCode i versionName u android/app/build.gradle.

param([Parameter(Mandatory = $true)][string]$Opis)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\ha_config.ps1') *> $null
$Repo = 'dinowuk/radne-nedjelje-medjimurje'
$api = "https://api.github.com/repos/$Repo"
$h = @{ Authorization = "Bearer $env:GITHUB_TOKEN"; 'User-Agent' = 'claude-code'; Accept = 'application/vnd.github+json' }

$gradle = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'android\app\build.gradle'))
$kod = [int]([regex]::Match($gradle, 'versionCode\s+(\d+)').Groups[1].Value)
$ime = [regex]::Match($gradle, "versionName\s+'([^']+)'").Groups[1].Value
Write-Host "Verzija $ime (versionCode $kod)"

# 1. izgradnja
$wslAndroid = (wsl -d Ubuntu-22.04 -- wslpath -a (Join-Path $PSScriptRoot 'android')).Trim()
wsl -d Ubuntu-22.04 -- bash "$wslAndroid/izgradi.sh"
if ($LASTEXITCODE -ne 0) { throw 'Izgradnja nije uspjela.' }
$apk = Join-Path $PSScriptRoot "izlaz\radne-nedjelje-$ime.apk"
if (-not (Test-Path $apk)) { throw "Nema $apk" }

# 2. release (uvijek isto ime datoteke, pa radi i link .../releases/latest/download/radne-nedjelje.apk)
$tijelo = @{ tag_name = "v$ime"; target_commitish = 'main'; name = "Radne nedjelje $ime"; body = $Opis } | ConvertTo-Json
$rel = Invoke-RestMethod "$api/releases" -Method Post -Headers $h -Body ([Text.Encoding]::UTF8.GetBytes($tijelo)) -ContentType 'application/json; charset=utf-8'
$up = $rel.upload_url -replace '\{.*\}', ''
$a = Invoke-RestMethod "$($up)?name=radne-nedjelje.apk" -Method Post -Headers $h -InFile $apk -ContentType 'application/vnd.android.package-archive'
Write-Host "APK: $($a.browser_download_url)"

# 3. verzija.json + objava koda
$v = [ordered]@{ versionCode = $kod; versionName = $ime; opis = $Opis; url = $a.browser_download_url }
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'docs\verzija.json'), ($v | ConvertTo-Json) + "`n", (New-Object Text.UTF8Encoding($false)))
& (Join-Path $PSScriptRoot 'objavi.ps1') -Poruka "Android $ime - $Opis"
