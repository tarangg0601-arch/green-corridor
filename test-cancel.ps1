$url = "http://localhost:3001/api/dispatch/call"
$body = @{ address = "Marina Beach, Chennai" } | ConvertTo-Json

$dispatchResponse = Invoke-RestMethod -Uri $url -Method Post -Body $body -ContentType "application/json"
$tripId = $dispatchResponse.id
Write-Output "Dispatched Trip: $tripId. Waiting 2 seconds then cancelling..."

Start-Sleep -Seconds 2

$stopUrl = "http://localhost:3001/api/trips/$tripId/stop"
$stopResponse = Invoke-RestMethod -Uri $stopUrl -Method Post -ContentType "application/json"
Write-Output "Stop response: $($stopResponse.message)"

Write-Output "Waiting 18 seconds to ensure no timeout finishes Leg 2..."
Start-Sleep -Seconds 18

$tripStatus = Invoke-RestMethod -Uri "http://localhost:3001/api/trips/$tripId"
Write-Output "Final trip status: $($tripStatus.status)"

$ambStatus = Invoke-RestMethod -Uri "http://localhost:3001/api/ambulances"
$assignedAmb = $ambStatus | Where-Object { $_.id -eq $tripStatus.ambulance_id }
Write-Output "Assigned Ambulance $($assignedAmb.id) status: $($assignedAmb.status)"

if ($tripStatus.status -eq 'cancelled' -and $assignedAmb.status -eq 'idle') {
    Write-Output "PASS: Trip successfully cancelled and ambulance released to idle."
    exit 0
} else {
    Write-Error "FAIL: Expected trip cancelled and ambulance idle, got trip '$($tripStatus.status)' and ambulance '$($assignedAmb.status)'"
    exit 1
}
