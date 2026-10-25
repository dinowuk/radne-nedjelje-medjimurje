# Objavi aplikaciju u GitHub repozitorij kao JEDAN commit (ovo racunalo nema git).
# docs/podaci/ se NE salje (podatke odrzava GitHub Actions), osim uz -SaPodacima.
#
#   powershell -ExecutionPolicy Bypass -File .\objavi.ps1 -Poruka "Opis promjene"

param(
  [Parameter(Mandatory = $true)][string]$Poruka,
  [string]$Repo = 'dinowuk/radne-nedjelje-medjimurje',
  [switch]$SaPodacima,
  [switch]$BezWorkflowa   # ako token nema dozvolu "Workflows"
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\ha_config.ps1') *> $null
$api = "https://api.github.com/repos/$Repo"
$h = @{ Authorization = "Bearer $env:GITHUB_TOKEN"; 'User-Agent' = 'claude-code'; Accept = 'application/vnd.github+json' }
# Tijelo se salje kao UTF-8 bajtovi (inace PS 5.1 pokvari c/c/s/z i znakove poput "x").
function Post($url, $obj) { Invoke-RestMethod -Uri $url -Method Post -Headers $h -Body ([Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Depth 6))) -ContentType 'application/json; charset=utf-8' }

# 1. sintaksa svih .js prije objave
foreach ($js in Get-ChildItem $PSScriptRoot -Recurse -Filter *.js) {
  node --check $js.FullName
  if ($LASTEXITCODE -ne 0) { throw "Sintaksna greska u $($js.Name) - NISTA nije objavljeno." }
}

# 2. datoteke
$root = (Resolve-Path $PSScriptRoot).Path
$files = Get-ChildItem $PSScriptRoot -Recurse -File -Force | Where-Object {
  $rel = $_.FullName.Substring($root.Length + 1)
  $rel -notmatch '^\.claude\\' -and ($SaPodacima -or $rel -notmatch '^docs\\podaci\\') -and $rel -notmatch '^docs\\podaci\\uredjivanje\.json$' -and $rel -notmatch '^docs\\slike\\' -and $rel -notmatch '\\node_modules\\' -and $rel -notmatch '^android\\(kljuc|build|app\\build|\.gradle)\\' -and $rel -notmatch '^android\\local\.properties$' -and $rel -notmatch '^izlaz\\' -and -not ($BezWorkflowa -and $rel -match '^\.github\\')
}

# 3. prazan repozitorij: Git Data API ne radi bez prvog commita
$head = $null
try { $head = (Invoke-RestMethod -Uri "$api/git/ref/heads/main" -Headers $h).object.sha } catch { }
if (-not $head) {
  $b = @{ message = 'Pocetak'; content = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("# Radne nedjelje Medjimurje`n")) } | ConvertTo-Json
  Invoke-RestMethod -Uri "$api/contents/README.md" -Method Put -Headers $h -Body $b -ContentType 'application/json' | Out-Null
  $head = (Invoke-RestMethod -Uri "$api/git/ref/heads/main" -Headers $h).object.sha
}
$headTree = (Invoke-RestMethod -Uri "$api/git/commits/$head" -Headers $h).tree.sha

# 4. jedan atomski commit preko postojeceg stabla (base_tree cuva podatke koje je upisao bot)
$tree = foreach ($f in $files) {
  $blob = Post "$api/git/blobs" @{ content = [Convert]::ToBase64String([IO.File]::ReadAllBytes($f.FullName)); encoding = 'base64' }
  @{ path = $f.FullName.Substring($root.Length + 1).Replace('\', '/'); mode = '100644'; type = 'blob'; sha = $blob.sha }
}
$noviTree = Post "$api/git/trees" @{ base_tree = $headTree; tree = @($tree) }
if ($noviTree.sha -eq $headTree) { Write-Host 'Nema promjena - nista za objaviti.'; exit 0 }
$commit = Post "$api/git/commits" @{ message = $Poruka; tree = $noviTree.sha; parents = @($head) }
Invoke-RestMethod -Uri "$api/git/refs/heads/main" -Method Patch -Headers $h -Body (@{ sha = $commit.sha } | ConvertTo-Json) -ContentType 'application/json' | Out-Null
Write-Host "Objavljeno: $($commit.sha.Substring(0,7)) - $Poruka ($($files.Count) datoteka)."
