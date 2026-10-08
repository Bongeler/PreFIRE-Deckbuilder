# 0. Force TLS 1.2 and set UTF-8 encoding
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$OutputEncoding = [System.Text.Encoding]::UTF8

$prefireFile = ".\prefire-names.json"
$outputFile  = ".\partners.json"

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
    Write-Host "Existing partners cache found. Loading to resume..." -ForegroundColor Yellow
    $existing = Get-Content $outputFile -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($prop in $existing.PSObject.Properties) {
        $cache[$prop.Name] = @($prop.Value)
    }
    Write-Host "Loaded $($cache.Keys.Count) existing partner pairs from cache." -ForegroundColor Green
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

# 3. Pull discrete partner categories from Scryfall
Write-Host "Fetching isolated partner groups from Scryfall..." -ForegroundColor Cyan

# Group 1: Open Generic Partners ONLY (exclude all variant qualifiers)
$genericPartners = Fetch-ScryfallAll 'is:commander f:commander keyword:partner -o:"partner with" -o:"survivors" -o:"character select" -o:"friends forever" -o:"choose a background" -o:"doctor''s companion"'
Write-Host "Generic Partners: $($genericPartners.Count)" -ForegroundColor Green

# Group 2: Friends Forever
$friendsForever = Fetch-ScryfallAll 'is:commander f:commander o:"friends forever"'
Write-Host "Friends Forever: $($friendsForever.Count)" -ForegroundColor Green

# Group 3: Survivors (The Last of Us - Abby, Ellie, Joel)
$survivors = Fetch-ScryfallAll 'is:commander f:commander o:"survivors"'
Write-Host "Survivors: $($survivors.Count)" -ForegroundColor Green

# Group 4: Character Select (Street Fighter)
$charSelect = Fetch-ScryfallAll 'is:commander f:commander o:"character select"'
Write-Host "Character Select: $($charSelect.Count)" -ForegroundColor Green

# Group 5: Backgrounds
$backgroundCmdrs = Fetch-ScryfallAll 'is:commander f:commander o:"choose a background"'
$backgrounds     = Fetch-ScryfallAll 'f:commander t:legendary t:background'
Write-Host "Backgrounds: $($backgroundCmdrs.Count) commanders, $($backgrounds.Count) backgrounds" -ForegroundColor Green

# Group 6: Doctors & Companions
$doctors    = Fetch-ScryfallAll 'is:commander f:commander t:time t:lord t:doctor'
$companions = Fetch-ScryfallAll 'is:commander f:commander o:"doctor''s companion"'
Write-Host "Doctors: $($doctors.Count) doctors, $($companions.Count) companions" -ForegroundColor Green

# Group 7: Named "Partner with [Name]"
$partnerWith = Fetch-ScryfallAll 'is:commander f:commander o:"partner with "'
Write-Host "Partner With: $($partnerWith.Count) cards" -ForegroundColor Green

# 4. Generate pairs
Write-Host "Building legal pair combinations..." -ForegroundColor Cyan
$pairList = [System.Collections.Generic.List[psobject]]::new()
$pairSet  = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)

function Add-Pair([string]$nameA, [string]$nameB) {
    if ($nameA -eq $nameB) { return }
    $slugA = Get-EdhrecSlug $nameA
    $slugB = Get-EdhrecSlug $nameB
    
    # Sort alphabetically to match EDHREC slug format
    $comboKey = if ($slugA -lt $slugB) { "$slugA-$slugB" } else { "$slugB-$slugA" }
    
    if (-not $pairSet.Contains($comboKey)) {
        [void]$pairSet.Add($comboKey)
        $pairList.Add([pscustomobject]@{
            Key   = $comboKey
            NameA = $nameA
            NameB = $nameB
        })
    }
}

# Cross-combine open generic partners
for ($i = 0; $i -lt $genericPartners.Count; $i++) {
    for ($j = $i + 1; $j -lt $genericPartners.Count; $j++) {
        Add-Pair $genericPartners[$i].name $genericPartners[$j].name
    }
}

# Cross-combine Friends Forever
for ($i = 0; $i -lt $friendsForever.Count; $i++) {
    for ($j = $i + 1; $j -lt $friendsForever.Count; $j++) {
        Add-Pair $friendsForever[$i].name $friendsForever[$j].name
    }
}

# Cross-combine Survivors (Abby, Ellie, Joel)
for ($i = 0; $i -lt $survivors.Count; $i++) {
    for ($j = $i + 1; $j -lt $survivors.Count; $j++) {
        Add-Pair $survivors[$i].name $survivors[$j].name
    }
}

# Cross-combine Character Select
for ($i = 0; $i -lt $charSelect.Count; $i++) {
    for ($j = $i + 1; $j -lt $charSelect.Count; $j++) {
        Add-Pair $charSelect[$i].name $charSelect[$j].name
    }
}

# Combine Background Commander + Background
foreach ($c in $backgroundCmdrs) {
    foreach ($b in $backgrounds) {
        Add-Pair $c.name $b.name
    }
}

# Combine Doctor + Doctor's Companion
foreach ($d in $doctors) {
    foreach ($comp in $companions) {
        Add-Pair $d.name $comp.name
    }
}

# Combine named "Partner with" pairs
foreach ($pw in $partnerWith) {
    $text = if ($pw.oracle_text) { $pw.oracle_text } else { "" }
    if ($pw.card_faces) {
        $text = ($pw.card_faces | ForEach-Object { $_.oracle_text }) -join " "
    }
    if ($text -match 'Partner with ([^\r\n(.,]+)') {
        $target = $matches[1].Trim()
        Add-Pair $pw.name $target
    }
}

Write-Host "Total verified legal partner pairings: $($pairList.Count)" -ForegroundColor Green

# 5. Fetch EDHREC Recommendations
$edhrecHeaders = @{
    "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    "Accept"     = "application/json"
}

$processed = 0
$total = $pairList.Count

foreach ($pair in $pairList) {
    $processed++
    $comboSlug = $pair.Key

    if ($cache.Contains($comboSlug) -and $cache[$comboSlug].Count -gt 0) {
        continue
    }

    Write-Host "[$processed/$total] Fetching: $($pair.NameA) & $($pair.NameB) ($comboSlug)..." -NoNewline
    $edhrecUrl = "https://json.edhrec.com/pages/commanders/$comboSlug.json"

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

        $cache[$comboSlug] = @($recs)
        Write-Host " Done ($($recs.Count) Pre-FIRE cards)" -ForegroundColor Green

    } catch {
        $cache[$comboSlug] = @()
        Write-Host " Not found / 404" -ForegroundColor DarkGray
    }

    Start-Sleep -Milliseconds 800

    if ($processed % 50 -eq 0) {
        $cache | ConvertTo-Json -Depth 4 | Set-Content -Path $outputFile -Encoding UTF8
    }
}

$cache | ConvertTo-Json -Depth 4 | Set-Content -Path $outputFile -Encoding UTF8
Write-Host "Complete! Output written to $outputFile" -ForegroundColor Cyan