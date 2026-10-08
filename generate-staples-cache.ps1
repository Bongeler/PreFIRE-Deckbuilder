[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$OutputEncoding = [System.Text.Encoding]::UTF8

$prefireFile = ".\prefire-names.json"
$outputFile  = ".\staples.json"

if (-not (Test-Path $prefireFile)) {
    Write-Host "Error: Could not find prefire-names.json" -ForegroundColor Red
    return
}

Write-Host "Loading Pre-FIRE names..." -ForegroundColor Cyan
$prefireRaw = Get-Content $prefireFile -Raw -Encoding UTF8 | Convert-FromJson

[prefireSet = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
foreach ($item in $prefireRaw) {
    if ($item) {
        $cleanItem = $item.ToString().Trim()
        [void]$prefireSet.Add($cleanItem)
        if ($cleanItem.Contains(" // ")) {
            [void]$prefireSet.Add($cleanItem.Split("/")[0].Trim())
        }
    }
}
Write-Host "Loaded $($prefireSet.Count) identifiers." -ForegroundColor Green

$seen = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
$staples = [System.Collections.Generic.List[string]]::new()

$queries = @(
    'f:commander date<=rna -t:land',
    'f:commander date<=rna t:land',
    'f:commander date<=rna id:c',
    'f:commander date<=rna id:w',
    'f:commander date<=rna id:u',
    'f:commander date<=rna id:b',
    'f:commander date<=rna id:r',
    'f:commander date<=rna id:g',
    'f:commander date<=rna c:m'
)

$headers = @{
    "User-Agent" = "PreFireDeckbuilder/1.0 (Casey)"
    "Accept"     = "application/json"
}

Write-Host "`Querying Scryfall for Pre-FIRE staples sorted by EDHREC..." -ForegroundColor Cyan

foreach $q in $queries) {
    Write-Host "Querying: $q ... " -NoNewline
    $encoded = [System.Uri]::EscapeDataString($q)
    $url = "https://api.scryfall.com/cards/search?q=$encoded&order=edhrec&dir=asc"
    
    try {
        $res = Invoke-RestMethod -Uri $url -Method Get -Headers $headers -ErrorAction Stop
        $before = $staples.Count
        if ($res.data) {
            foreach ($card in $res.data) {
                $cName = $card.name.ToString().Trim()
                $front = $cName.Split("/")[0].Trim()
                if (($prefireSet.Contains($cName) -or $prefireSet.Contains($front)) -and -not $seen.Contains($cName)) {
                    [void]$seen.Add($cName)
                    $staples.Add($cName)
                }
            }
        }
        $added = $staples.Count - $before
        Write-Host "Added $added cards." -ForegroundColor Green
    } catch {
        Write-Host "Failed: $($_.Exception.Message)" -ForegroundColor Red
    }
    Start-Sleep -Milliseconds 150
}

Write-Host "`Total unique staples collected: $($staples.Count)" -ForegroundColor Cyan
$staples | ConvertTo-Json -Compress | Set-Content -Path $outputFile -Encoding UTF8
Write-Host "Saved output to $outputFile" -ForegroundColor Green