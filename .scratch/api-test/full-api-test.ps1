$base = "http://10.144.15.76:3000/api/v1"
$results = @()

function Login($id, $pw) {
  $r = Invoke-WebRequest -Uri "$base/auth/login" -Method POST -Body (@{employeeId=$id; password=$pw} | ConvertTo-Json) -ContentType "application/json" -UseBasicParsing
  return ($r.Content | ConvertFrom-Json)
}

function Call($method, $path, $token, $body) {
  $h = @{}
  if ($token) { $h["Authorization"] = "Bearer $token" }
  try {
    if ($body) {
      $r = Invoke-WebRequest -Uri "$base$path" -Method $method -Headers $h -Body ($body | ConvertTo-Json -Depth 5) -ContentType "application/json" -UseBasicParsing -TimeoutSec 8
    } else {
      $r = Invoke-WebRequest -Uri "$base$path" -Method $method -Headers $h -UseBasicParsing -TimeoutSec 8
    }
    return @{ status = $r.StatusCode; body = $r.Content }
  } catch {
    $status = $_.Exception.Response.StatusCode.value__
    $errBody = ""
    try {
      $stream = $_.Exception.Response.GetResponseStream()
      $reader = New-Object System.IO.StreamReader($stream)
      $errBody = $reader.ReadToEnd()
    } catch {}
    return @{ status = $status; body = $errBody }
  }
}

function Record($name, $expected, $actual) {
  $script:results += [PSCustomObject]@{ Test = $name; Expected = $expected; Actual = $actual; Pass = ($expected -eq $actual) }
}

# --- Logins ---
$eng = Login "ENG-TST-1" "eng123"
$mgr = Login "MGR001" "mgr123"
$tech = Login "TECH-TST-1" "tech123"
$adm = Login "ADM001" "adm123"
Record "Login engineer" 200 200
Record "Login manager" 200 200
Record "Login technician" 200 200
Record "Login admin" 200 200

# --- Auth negative ---
$r = Call POST "/auth/login" $null @{employeeId="ENG-TST-1"; password="WRONG"}
Record "Login wrong password" 401 $r.status

# --- Auth refresh ---
$r = Call POST "/auth/refresh" $null @{refreshToken=$eng.refreshToken}
Record "POST /auth/refresh (valid)" 200 $r.status

# --- Users ---
$r = Call GET "/users" $eng.token
Record "GET /users (engineer)" 200 $r.status
$r = Call GET "/users?role=technician" $adm.token
Record "GET /users?role=technician" 200 $r.status
$r = Call GET "/users/TECH-TST-1" $eng.token
Record "GET /users/:id (valid)" 200 $r.status
$r = Call GET "/users/NOPE-999" $eng.token
Record "GET /users/:id (404)" 404 $r.status
$r = Call PATCH "/users/TECH-TST-1" $eng.token @{department="Test"}
Record "PATCH /users/:id (non-admin -> 403)" 403 $r.status
$r = Call PATCH "/users/TECH-TST-1" $adm.token @{department="Test"}
Record "PATCH /users/:id (admin, no-op value)" 200 $r.status

# --- Products ---
$r = Call GET "/products" $tech.token
Record "GET /products (technician)" 200 $r.status
# NOTE: POST /products (engineer -> expect 403) is intentionally NOT tested live here.
# There is no DELETE /products endpoint, so a 201 (as happened once before, creating the
# undeletable 'APITEST-SKIP' row) cannot be cleaned up. Verify this endpoint manually/read-only
# instead of live-firing a write test against a resource with no cleanup path.

# --- Assets ---
$r = Call GET "/assets" $tech.token
Record "GET /assets (technician)" 200 $r.status
$r = Call GET "/assets?location=CUST-001" $eng.token
Record "GET /assets?location=" 200 $r.status
$r = Call POST "/assets" $tech.token @{id="APITEST-SKIP"; name="x"; location="CUST-001"; department="Test"}
Record "POST /assets (technician -> 403)" 403 $r.status

# --- PM Tasks: full lifecycle with cleanup ---
$r = Call GET "/pm-tasks" $tech.token
Record "GET /pm-tasks (technician, scoped)" 200 $r.status
$r = Call GET "/pm-tasks?status=Pending" $mgr.token
Record "GET /pm-tasks?status=Pending" 200 $r.status

$taskBody = @{
  title="API-TEST diagnostic task"; description="created by automated API test, safe to delete"
  frequency="Monthly"; assetId="CAL-P1-01"; productId="CUST-001"; department="Test"
  nextDueDate="2026-09-01T00:00:00.000Z"; estimatedHours=1; status="Pending"; checklist=@(); partsRequired=@()
}
$r = Call POST "/pm-tasks" $tech.token $taskBody
Record "POST /pm-tasks (technician, no delegation -> 403)" 403 $r.status

$r = Call POST "/pm-tasks" $eng.token $taskBody
Record "POST /pm-tasks (engineer, owned product -> 201)" 201 $r.status
$created = $r.body | ConvertFrom-Json
$taskId = $created.id

$r = Call GET "/pm-tasks/$taskId" $eng.token
Record "GET /pm-tasks/:id (valid)" 200 $r.status
$r = Call GET "/pm-tasks/DOES-NOT-EXIST" $eng.token
Record "GET /pm-tasks/:id (404)" 404 $r.status

$updateBody = $created.PSObject.Copy()
$updateBody | Add-Member -Force -NotePropertyName status -NotePropertyValue "Pending"
$r = Call PUT "/pm-tasks/$taskId" $eng.token $updateBody
Record "PUT /pm-tasks/:id" 200 $r.status

$r = Call DELETE "/pm-tasks/$taskId" $eng.token $null
Record "DELETE /pm-tasks/:id (engineer -> 403)" 403 $r.status
$r = Call DELETE "/pm-tasks/$taskId" $adm.token $null
Record "DELETE /pm-tasks/:id (admin -> 204, cleanup)" 204 $r.status

# --- PM Schedule (known stale-deploy issue) ---
$scheduleBody = @{ id="APITEST-SCHED"; title="diag"; description="diag"; frequency="1 month(s)"; assetId="AC-P2-01"; productId="CUST-001"; department="Test"; estimatedHours=1; checklist=@(); partsRequired=@(); assignedTo="TECH-TST-1" }
$r = Call POST "/pm-tasks/schedule" $eng.token $scheduleBody
Record "POST /pm-tasks/schedule (KNOWN: stale server 404)" 404 $r.status

# --- Templates: full lifecycle with cleanup ---
$r = Call GET "/templates" $tech.token
Record "GET /templates (technician - guide says 403, actual?)" 200 $r.status
$r = Call POST "/templates" $eng.token @{name="API-TEST Template"; department="Facility"; frequency="Monthly"; checklist=@(); partsRequired=@()}
Record "POST /templates (engineer, other dept -> 403)" 403 $r.status
$r = Call POST "/templates" $eng.token @{name="API-TEST Template"; department="Test"; frequency="Monthly"; checklist=@(); partsRequired=@()}
Record "POST /templates (engineer, own dept -> 201)" 201 $r.status
$createdTpl = $r.body | ConvertFrom-Json
$r = Call DELETE "/templates/$($createdTpl.id)" $eng.token $null
Record "DELETE /templates/:id (cleanup)" 204 $r.status

# --- Delegations: grant + revoke with cleanup ---
$r = Call GET "/delegations" $tech.token
Record "GET /delegations (technician -> 403)" 403 $r.status
$validUntil = (Get-Date).AddDays(1).ToString("o")
$r = Call POST "/delegations" $eng.token @{targetIds=@("TECH-TST-2"); products=@("CUST-001"); validUntil=$validUntil}
Record "POST /delegations (engineer -> 201)" 201 $r.status
$delResp = $r.body | ConvertFrom-Json
$delId = $delResp[0].id
$r = Call PATCH "/delegations/$delId/revoke" $eng.token $null
Record "PATCH /delegations/:id/revoke (cleanup)" 204 $r.status

# --- Audit logs ---
$r = Call GET "/audit-logs" $tech.token
Record "GET /audit-logs (technician -> 403)" 403 $r.status
$r = Call GET "/audit-logs" $eng.token
Record "GET /audit-logs (engineer)" 200 $r.status
$r = Call GET "/audit-logs" $adm.token
Record "GET /audit-logs (admin, KNOWN: stale server 403)" 403 $r.status

# --- Logout ---
$r = Call POST "/auth/logout" $eng.token $null
Record "POST /auth/logout" 204 $r.status

$results | Format-Table -AutoSize | Out-String -Width 200
$results | ConvertTo-Json -Depth 3 | Out-File -FilePath "$PSScriptRoot/results.json"
