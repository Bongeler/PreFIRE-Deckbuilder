# 0. Force TLS 1.2 and set UTF-8 encoding
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$OutputEncoding = [System.Text.Encoding]::UTF8

$prefireFile = ".\prefire-names.json"
$outputFile  = ".\edhrec-prefire-cache.json"

if (-not (Test-Path $prefireFile)) {
    Write-Error "Could not find $prefireFile in the current directory."
    return
}

# 1. Load Pre-FIRE names into an in-memory HashSet
Write-Host "Loading Pre-FIRE names..." -ForegroundColor Cyan
$prefireRaw = Get-Content $prefireFile -Raw -Encoding UTF8 | ConvertFrom-Json
$prefireSet = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
foreach ($n in $prefireRaw) {
    if ($n) { 
        [void]$prefireSet.Add($n.Trim()) 
        if ($n.Contains(" // ")) {
            [void]$prefireSet.Add($n.Split("/")[0].Trim())
        }
    }
}
Write-Host "Loaded $($prefireSet.Count) Pre-FIRE identifiers." -ForegroundColor Green

# 2. Resume handling
$cache = [ordered]@{}
if (Test-Path $outputFile) {
    Write-Host "Existing cache found. Loading to resume..." -ForegroundColor Yellow
    $existing = Get-Content $outputFile -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($prop in $existing.PSObject.Properties) {
        $cache[$prop.Name] = @($prop.Value)
    }
    Write-Host "Loaded $($cache.Keys.Count) existing commanders from cache." -ForegroundColor Green
}

function Get-EdhrecSlug([string]$name) {
    $clean = $name.Split("/")[0].Trim()
    $clean = [System.Text.Encoding]::ASCII.GetString([System.Text.Encoding]::GetEncoding("Cyrillic").GetBytes($clean))
    $clean = $clean.ToLower() -replace "['""’]", "" -replace "[^a-z0-9]+", "-" -replace "^-+|-+$", ""
    return $clean
}

function Fetch-ScryfallAll([string]$query) {
    $results = [System.Collections.Generic.List[psobject]]::new()
    $url = "https://api.scryfall.com/cards/search?q=" + [System.Uri]::EscapeDataString($query) + "&unique=cards"
    $headers = @{ "User-Agent" = "PreFIRE-Builder/1.0"; "Accept" = "application/json" }

    while ($url) {
        try {
            $res = Invoke-RestMethod -Uri $url -Method Get -Headers $headers -ErrorAction Stop
            foreach ($card in $res.data) {
                $results.Add($card)
            }
            if ($res.has_more) {
                $url = $res.next_page
                Start-Sleep -Milliseconds 100
            } else {
                $url = $null
            }
        } catch {
            Write-Warning "Scryfall error: $($_.Exception.Message). Retrying in 2s..."
            Start-Sleep -Seconds 2
        }
    }
    return $results
}

# 3. Pull all legal commanders from Scryfall
Write-Host "Fetching all legal commanders from Scryfall..." -ForegroundColor Cyan
$commanders = Fetch-ScryfallAll "is:commander f:commander"
Write-Host "Found $($commanders.Count) commanders." -ForegroundColor Green

# 4. Scrape EDHREC for each commander
$edhrecHeaders = @{
    "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    "Accept"     = "application/json"
}

$processed = 0
$total = $commanders.Count

foreach ($cmdr in $commanders) {
    $processed++
    $slug = Get-EdhrecSlug $cmdr.name

    if ($cache.Contains($slug) -and $cache[$slug].Count -gt 0) {
        continue
    }

    Write-Host "[$processed/$total] Fetching: $($cmdr.name) ($slug)..." -NoNewline
    $edhrecUrl = "https://json.edhrec.com/pages/commanders/$slug.json"

    try {
        $edhrecRes = Invoke-RestMethod -Uri $edhrecUrl -Method Get -Headers $edhrecHeaders -ErrorAction Stop
        
        $cardlists = @()
        if ($edhrecRes.container.json_dict.cardlists) {
            $cardlists = $edhrecRes.container.json_dict.cardlists
        } elseif ($edhrecRes.cardlists) {
            $cardlists = $edhrecRes.cardlists
        }

        $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
        $recs = [System.Collections.Generic.List[string]]::new()

        foreach ($group in $cardlists) {
            if ($group.cardviews) {
                foreach ($card in $group.cardviews) {
                    $cName = $card.name
                    if ($cName -and -not $seen.Contains($cName)) {
                        [void]$seen.Add($cName)
                        $front = $cName.Split("/")[0].Trim()
                        if ($prefireSet.Contains($cName) -or $prefireSet.Contains($front)) {
                            $recs.Add($cName)
                        }
                    }
                }
            }
        }

        $cache[$slug] = @($recs)
        Write-Host " Done ($($recs.Count) Pre-FIRE cards)" -ForegroundColor Green

    } catch {
        $cache[$slug] = @()
        Write-Host " Not found / 404" -ForegroundColor DarkGray
    }

    Start-Sleep -Milliseconds 800

    if ($processed % 50 -eq 0) {
        $cache | ConvertTo-Json -Depth 4 | Set-Content -Path $outputFile -Encoding UTF8
    }
}

# Final save
$cache | ConvertTo-Json -Depth 4 | Set-Content -Path $outputFile -Encoding UTF8
Write-Host "Complete! Output written to $outputFile" -ForegroundColor Cyan