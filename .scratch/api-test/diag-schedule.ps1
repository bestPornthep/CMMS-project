$loginResp = Invoke-WebRequest -Uri "http://10.144.15.76:3000/api/v1/auth/login" -Method POST -Body '{"employeeId":"ENG-TST-1","password":"eng123"}' -ContentType "application/json" -UseBasicParsing
$token = ($loginResp.Content | ConvertFrom-Json).token
$headers = @{ Authorization = "Bearer $token" }

try {
  $body = '{"id":"SCHED-DIAG-TEST","title":"Diag Test","description":"diag","frequency":"1 month(s)","assetId":"NONEXISTENT","productId":"CUST-001","department":"Test","estimatedHours":1,"checklist":[],"partsRequired":[],"assignedTo":"TECH-TST-1"}'
  $r = Invoke-WebRequest -Uri "http://10.144.15.76:3000/api/v1/pm-tasks/schedule" -Method POST -Headers $headers -Body $body -ContentType "application/json" -UseBasicParsing -TimeoutSec 5
  Write-Host "POST STATUS: $($r.StatusCode)"
  Write-Host $r.Content
} catch {
  Write-Host "POST ERR STATUS: $($_.Exception.Response.StatusCode.value__)"
  $stream = $_.Exception.Response.GetResponseStream()
  $reader = New-Object System.IO.StreamReader($stream)
  Write-Host $reader.ReadToEnd()
}
