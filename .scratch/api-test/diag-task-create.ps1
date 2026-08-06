$base = "http://10.144.15.76:3000/api/v1"
$login = Invoke-WebRequest -Uri "$base/auth/login" -Method POST -Body '{"employeeId":"ENG-TST-1","password":"eng123"}' -ContentType "application/json" -UseBasicParsing
$token = ($login.Content | ConvertFrom-Json).token
$headers = @{ Authorization = "Bearer $token" }
$taskBody = @{
  title="API-TEST diagnostic task"; description="created by automated API test, safe to delete"
  frequency="Monthly"; assetId="AC-P2-01"; productId="CUST-001"; department="Test"
  nextDueDate="2026-09-01T00:00:00.000Z"; estimatedHours=1; status="Pending"; checklist=@(); partsRequired=@()
} | ConvertTo-Json
Write-Host "SENDING BODY:"
Write-Host $taskBody
try {
  $r = Invoke-WebRequest -Uri "$base/pm-tasks" -Method POST -Headers $headers -Body $taskBody -ContentType "application/json" -UseBasicParsing
  Write-Host "STATUS: $($r.StatusCode)"
  Write-Host $r.Content
} catch {
  Write-Host "ERR STATUS: $($_.Exception.Response.StatusCode.value__)"
  $stream = $_.Exception.Response.GetResponseStream(); $reader = New-Object System.IO.StreamReader($stream); Write-Host $reader.ReadToEnd()
}
