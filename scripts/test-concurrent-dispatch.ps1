$url = "http://localhost:3001/api/dispatch/call"

$body1 = @{ address = "Marina Beach, Chennai" } | ConvertTo-Json
$body2 = @{ address = "Chennai Central Station" } | ConvertTo-Json

$job1 = Start-Job -ScriptBlock {
    param($u, $b)
    Invoke-RestMethod -Uri $u -Method Post -Body $b -ContentType "application/json"
} -ArgumentList $url, $body1

$job2 = Start-Job -ScriptBlock {
    param($u, $b)
    Invoke-RestMethod -Uri $u -Method Post -Body $b -ContentType "application/json"
} -ArgumentList $url, $body2

Wait-Job $job1, $job2 | Out-Null
$result1 = Receive-Job $job1
$result2 = Receive-Job $job2

Write-Output "Result 1 Ambulance ID: $($result1.ambulance_id)"
Write-Output "Result 2 Ambulance ID: $($result2.ambulance_id)"

if ($result1.ambulance_id -and $result2.ambulance_id -and ($result1.ambulance_id -ne $result2.ambulance_id)) {
    Write-Output "PASS: Two concurrent dispatch requests reserved two distinct ambulances without collision."
    exit 0
} else {
    Write-Error "FAIL: Expected two distinct ambulance IDs, got $($result1.ambulance_id) and $($result2.ambulance_id)"
    exit 1
}
