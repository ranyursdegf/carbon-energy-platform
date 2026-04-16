param(
  [string]$BaseUrl = "http://localhost:3000"
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

$results = New-Object System.Collections.Generic.List[object]
$failures = 0
$startedServer = $false
$serverProcess = $null
$tokenHeaders = $null
$tempCode = $null
$tempAreaId = $null

function Add-Result {
  param(
    [string]$Name,
    [string]$Status,
    [string]$Detail
  )

  $script:results.Add([pscustomobject]@{
    name = $Name
    status = $Status
    detail = $Detail
  }) | Out-Null
}

function Add-Step {
  param(
    [string]$Name,
    [scriptblock]$Block
  )

  try {
    $detail = & $Block
    Add-Result $Name "ok" ([string]$detail)
    Write-Host "[OK] $Name"
  } catch {
    $script:failures += 1
    Add-Result $Name "fail" $_.Exception.Message
    Write-Host "[FAIL] $Name - $($_.Exception.Message)" -ForegroundColor Red
  }
}

function Get-StatusCode {
  param($ErrorRecord)

  if ($ErrorRecord.Exception.Response -and $ErrorRecord.Exception.Response.StatusCode) {
    return [int]$ErrorRecord.Exception.Response.StatusCode
  }
  return $null
}

function Add-ExpectedStatus {
  param(
    [string]$Name,
    [int]$ExpectedStatus,
    [scriptblock]$Block
  )

  try {
    & $Block | Out-Null
    $script:failures += 1
    Add-Result $Name "fail" "unexpected success"
    Write-Host "[FAIL] $Name - unexpected success" -ForegroundColor Red
  } catch {
    $status = Get-StatusCode $_
    if ($status -eq $ExpectedStatus) {
      Add-Result $Name "ok" "expected HTTP $ExpectedStatus"
      Write-Host "[OK] $Name"
      return
    }

    $script:failures += 1
    Add-Result $Name "fail" "expected HTTP $ExpectedStatus, got HTTP $status. $($_.Exception.Message)"
    Write-Host "[FAIL] $Name - expected HTTP $ExpectedStatus, got HTTP $status" -ForegroundColor Red
  }
}

function Invoke-Api {
  param(
    [string]$Method,
    [string]$Path,
    $Body = $null,
    [hashtable]$Headers = $null
  )

  $arguments = @{
    Uri = "$BaseUrl$Path"
    Method = $Method
    TimeoutSec = 10
    ErrorAction = "Stop"
  }
  if ($Headers) {
    $arguments.Headers = $Headers
  }
  if ($null -ne $Body) {
    $arguments.ContentType = "application/json"
    $arguments.Body = $Body | ConvertTo-Json -Depth 10 -Compress
  }

  return Invoke-RestMethod @arguments
}

function Wait-Health {
  param([int]$Seconds = 60)

  for ($i = 0; $i -lt $Seconds; $i += 1) {
    try {
      return Invoke-Api "GET" "/api/health"
    } catch {
      Start-Sleep -Seconds 1
    }
  }

  throw "server not ready after $Seconds seconds"
}

function Read-DotEnv {
  $envMap = @{}
  $envPath = Join-Path $root ".env"
  if (-not (Test-Path -LiteralPath $envPath)) {
    return $envMap
  }

  Get-Content -Encoding UTF8 -LiteralPath $envPath | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) {
      return
    }

    $index = $line.IndexOf("=")
    $key = $line.Substring(0, $index).Trim()
    $value = $line.Substring($index + 1).Trim().Trim('"').Trim("'")
    $envMap[$key] = $value
  }

  return $envMap
}

function Resolve-JavaCommand {
  $portableJava = Join-Path $root "tools/jdk17/jdk-17.0.18+8/bin/java.exe"
  if (Test-Path -LiteralPath $portableJava) {
    return (Resolve-Path -LiteralPath $portableJava).Path
  }

  $systemJava = Get-Command java -ErrorAction SilentlyContinue
  if ($systemJava) {
    return $systemJava.Source
  }

  throw "Java 17 was not found. Install JDK 17 or restore tools/jdk17."
}

function Remove-SmokeData {
  param([string]$Code)

  if (-not $Code) {
    return
  }

  $mysql = Get-Command mysql -ErrorAction SilentlyContinue
  if (-not $mysql) {
    Write-Host "[WARN] mysql command not found; temporary area was deactivated but not hard-deleted." -ForegroundColor Yellow
    return
  }

  $envMap = Read-DotEnv
  $dbHost = if ($envMap.DB_HOST) { $envMap.DB_HOST } else { "127.0.0.1" }
  $dbPort = if ($envMap.DB_PORT) { $envMap.DB_PORT } else { "3306" }
  $dbUser = if ($envMap.DB_USER) { $envMap.DB_USER } else { "root" }
  $dbPass = if ($envMap.ContainsKey("DB_PASSWORD")) { $envMap.DB_PASSWORD } else { "" }
  $dbName = if ($envMap.DB_NAME) { $envMap.DB_NAME } else { "carbon_emission" }
  $safeCode = $Code -replace "'", "''"
  $sql = "DELETE FROM areas WHERE code = '$safeCode' AND note LIKE 'smoke-test%';"
  $arguments = @(
    "--default-character-set=utf8mb4",
    "-h", $dbHost,
    "-P", $dbPort,
    "-u", $dbUser,
    "--password=$dbPass",
    $dbName,
    "-e", $sql
  )

  & $mysql.Source @arguments | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[WARN] Failed to hard-delete temporary smoke data." -ForegroundColor Yellow
  }
}

try {
  Write-Host "== Build Java project =="
  & (Join-Path $root "mvnw.cmd") "-DskipTests" "package"
  if ($LASTEXITCODE -ne 0) {
    throw "Maven package failed with exit code $LASTEXITCODE"
  }

  Write-Host ""
  Write-Host "== Check frontend files =="
  $node = Get-Command node -ErrorAction SilentlyContinue
  if ($node) {
    & $node.Source (Join-Path $root "scripts/frontend-check.js")
    if ($LASTEXITCODE -ne 0) {
      throw "frontend check failed with exit code $LASTEXITCODE"
    }
  } else {
    Write-Host "[WARN] node command not found; skipped frontend JS/static checks." -ForegroundColor Yellow
  }

  Write-Host ""
  Write-Host "== Start or reuse backend =="
  try {
    Invoke-Api "GET" "/api/health" | Out-Null
    Write-Host "[OK] Reusing existing backend at $BaseUrl"
  } catch {
    $javaPath = Resolve-JavaCommand
    $jarPath = Join-Path $root "target/carbon-energy-platform-app.jar"
    if (-not (Test-Path -LiteralPath $jarPath)) {
      throw "Application jar not found: $jarPath"
    }

    $serverProcess = Start-Process -FilePath $javaPath -ArgumentList @("-jar", $jarPath) -WorkingDirectory $root -PassThru -WindowStyle Hidden
    $startedServer = $true
    Wait-Health 60 | Out-Null
    Write-Host "[OK] Backend started at $BaseUrl"
  }

  Write-Host ""
  Write-Host "== API smoke test =="

  Add-Step "GET /api/health" {
    $response = Invoke-Api "GET" "/api/health"
    "status=$($response.data.status), database=$($response.data.database)"
  }

  Add-Step "GET static pages" {
    $paths = @("/", "/index.html", "/areas.html", "/admin.html", "/module.html?module=energy-query", "/module.html?module=carbon-assets")
    $codes = foreach ($path in $paths) {
      (Invoke-WebRequest "$BaseUrl$path" -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop).StatusCode
    }
    "codes=$($codes -join ',')"
  }

  Add-Step "POST /api/auth/login" {
    $response = Invoke-Api "POST" "/api/auth/login" @{ username = "admin"; password = "123456" }
    $script:tokenHeaders = @{ Authorization = "Bearer $($response.data.token)" }
    "user=$($response.data.user.username), hasToken=$([bool]$response.data.token)"
  }

  Add-Step "GET /api/auth/me" {
    $response = Invoke-Api "GET" "/api/auth/me" $null $script:tokenHeaders
    "user=$($response.data.username)"
  }

  Add-Step "GET /api/audit-logs" {
    $response = Invoke-Api "GET" "/api/audit-logs?limit=5" $null $script:tokenHeaders
    "count=$(@($response.data).Count)"
  }

  Add-ExpectedStatus "GET /api/audit-logs without token" 401 {
    Invoke-Api "GET" "/api/audit-logs?limit=5"
  }

  Add-ExpectedStatus "POST /api/areas without token" 401 {
    Invoke-Api "POST" "/api/areas" @{ code = "no-token"; name = "No Token" }
  }

  $firstAreaId = $null

  Add-Step "GET /api/dashboard/overview" {
    $response = Invoke-Api "GET" "/api/dashboard/overview"
    "areas=$($response.data.area_count), kwh=$($response.data.total_kwh)"
  }

  Add-Step "GET /api/dashboard/area-ranking" {
    $response = Invoke-Api "GET" "/api/dashboard/area-ranking"
    "count=$(@($response.data).Count)"
  }

  Add-Step "GET /api/areas?includeStats=true" {
    $response = Invoke-Api "GET" "/api/areas?includeStats=true"
    $areas = @($response.data)
    if ($areas.Count -eq 0) {
      throw "no active area found"
    }
    $script:firstAreaId = [long]$areas[0].id
    "count=$($areas.Count), firstAreaId=$script:firstAreaId"
  }

  Add-Step "GET /api/areas/{id}" {
    $response = Invoke-Api "GET" "/api/areas/$script:firstAreaId"
    "name=$($response.data.name)"
  }

  Add-Step "GET /api/areas/{id}/electricity-readings" {
    $response = Invoke-Api "GET" "/api/areas/$script:firstAreaId/electricity-readings?limit=5"
    "count=$(@($response.data).Count)"
  }

  Add-Step "GET /api/areas/{id}/electricity-summary" {
    $response = Invoke-Api "GET" "/api/areas/$script:firstAreaId/electricity-summary?groupBy=month"
    "count=$(@($response.data).Count)"
  }

  Add-Step "GET /api/energy-types" {
    $response = Invoke-Api "GET" "/api/energy-types"
    "count=$(@($response.data).Count)"
  }

  Add-Step "GET /api/emission-factors" {
    $response = Invoke-Api "GET" "/api/emission-factors?energyTypeCode=electricity"
    "count=$(@($response.data).Count)"
  }

  Add-Step "GET /api/meters" {
    $response = Invoke-Api "GET" "/api/meters?areaId=$script:firstAreaId"
    "count=$(@($response.data).Count)"
  }

  Add-Step "GET /api/energy-readings/summary" {
    $response = Invoke-Api "GET" "/api/energy-readings/summary?energyTypeCode=electricity&groupBy=month&from=2025-01-01&to=2025-12-31%2023:59:59"
    "count=$(@($response.data).Count)"
  }

  $stamp = Get-Date -Format "yyyyMMddHHmmss"
  $tempCode = "smoke-e2e-$stamp"
  $tempMeterId = $null

  Add-Step "POST /api/areas create temp area" {
    $response = Invoke-Api "POST" "/api/areas" @{
      code = $script:tempCode
      name = "Smoke Test Area $stamp"
      areaType = "office"
      floorAreaM2 = 12.5
      staffCount = 2
      annualBudgetKwh = 1200
      gridEmissionFactor = 0.42
      note = "smoke-test temporary area"
    } $script:tokenHeaders
    $script:tempAreaId = [long]$response.data.id
    "id=$script:tempAreaId"
  }

  Add-Step "PATCH /api/areas/{id}" {
    $response = Invoke-Api "PATCH" "/api/areas/$script:tempAreaId" @{
      name = "Smoke Test Area Updated $stamp"
      staffCount = 3
      note = "smoke-test temporary area updated"
    } $script:tokenHeaders
    "name=$($response.data.name), staff=$($response.data.staff_count)"
  }

  Add-Step "POST /api/areas/{id}/electricity-readings batch" {
    $response = Invoke-Api "POST" "/api/areas/$script:tempAreaId/electricity-readings" @{
      readings = @(
        @{
          periodType = "day"
          readingTime = "2025-01-13"
          kwh = 16.25
          source = "smoke-test-batch"
          note = "smoke-test batch electricity reading 1"
        },
        @{
          periodType = "day"
          readingTime = "2025-01-14"
          kwh = 17.50
          source = "smoke-test-batch"
          note = "smoke-test batch electricity reading 2"
        }
      )
    } $script:tokenHeaders
    "saved=$($response.data.savedCount)"
  }

  Add-Step "POST /api/areas/{id}/electricity-readings" {
    $response = Invoke-Api "POST" "/api/areas/$script:tempAreaId/electricity-readings" @{
      periodType = "day"
      readingTime = "2025-01-15"
      kwh = 18.75
      source = "smoke-test"
      note = "smoke-test electricity reading"
    } $script:tokenHeaders
    "saved=$($response.data.savedCount)"
  }

  Add-Step "POST /api/meters" {
    $response = Invoke-Api "POST" "/api/meters" @{
      areaId = $script:tempAreaId
      energyTypeCode = "electricity"
      code = "meter-$stamp"
      name = "Smoke Test Meter $stamp"
      location = "smoke-test"
      manufacturer = "smoke-test"
      installedAt = "2025-01-01"
    } $script:tokenHeaders
    $script:tempMeterId = [long]$response.data.id
    "id=$script:tempMeterId"
  }

  Add-Step "POST /api/energy-readings" {
    $response = Invoke-Api "POST" "/api/energy-readings" @{
      areaId = $script:tempAreaId
      meterId = $script:tempMeterId
      energyTypeCode = "electricity"
      periodType = "day"
      readingTime = "2025-01-16"
      amount = 19.25
      source = "smoke-test"
      note = "smoke-test generic reading"
    } $script:tokenHeaders
    "id=$($response.data.id), amount=$($response.data.amount)"
  }

  Add-Step "GET temp area summaries" {
    $electricity = Invoke-Api "GET" "/api/areas/$script:tempAreaId/electricity-summary?groupBy=day"
    $energy = Invoke-Api "GET" "/api/energy-readings/summary?areaId=$script:tempAreaId&energyTypeCode=electricity&groupBy=day"
    "electricity=$(@($electricity.data).Count), energy=$(@($energy.data).Count)"
  }

  Add-Step "DELETE /api/areas/{id}" {
    $response = Invoke-Api "DELETE" "/api/areas/$script:tempAreaId" $null $script:tokenHeaders
    "isActive=$($response.data.isActive)"
  }

  Add-Step "POST /api/auth/logout" {
    $response = Invoke-Api "POST" "/api/auth/logout" @{} $script:tokenHeaders
    "ok=$($response.data.ok)"
  }

  Add-ExpectedStatus "GET /api/auth/me after logout" 401 {
    Invoke-Api "GET" "/api/auth/me" $null $script:tokenHeaders
  }

  Write-Host ""
  Write-Host "== Cleanup smoke data =="
  Remove-SmokeData $tempCode
  Write-Host "[OK] Cleanup attempted for $tempCode"

  Write-Host ""
  if ($failures -gt 0) {
    $results | ConvertTo-Json -Depth 5
    throw "Project verification failed: $failures API step(s) failed."
  }

  Write-Host "Project verification passed: build, frontend checks, static pages, API smoke flow."
} finally {
  if ($startedServer -and $serverProcess -and -not $serverProcess.HasExited) {
    Stop-Process -Id $serverProcess.Id -Force
  }
}
