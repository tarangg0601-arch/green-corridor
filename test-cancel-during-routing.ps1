$ErrorActionPreference = 'Stop'
$base = "http://localhost:3001/api"

Write-Output "=== Regression Test: Cancel During Hospital Routing ==="
Write-Output "Tests that cancelling a trip while the OSRM hospital routing"
Write-Output "request is pending does NOT restart the trip or overwrite its status."
Write-Output ""

# Step 1: Dispatch an ambulance
Write-Output "[1/6] Dispatching ambulance..."
# Use coordinates right next to Apollo Hospital to reach pickup in 1-2 ticks
$dispatchBody = @{ lat = 13.0605; lng = 80.2497 } | ConvertTo-Json
$dispatchResponse = Invoke-RestMethod -Uri "$base/dispatch/call" -Method Post -Body $dispatchBody -ContentType "application/json"
$tripId = $dispatchResponse.id
$ambulanceId = $dispatchResponse.ambulance_id
Write-Output "  Trip ID: $tripId, Ambulance ID: $ambulanceId"

if (-not $tripId) {
    Write-Error "FAIL: Dispatch did not return a trip ID"
    exit 1
}

# Step 2: Poll until trip reaches 'at_pickup' phase (Leg 1 completes)
# or until 120s elapses (route may be short or long depending on data)
Write-Output "[2/6] Waiting for trip to reach 'at_pickup' phase (Leg 1 complete)..."
$maxWait = 120
$elapsed = 0
$phase = ""
while ($elapsed -lt $maxWait) {
    Start-Sleep -Seconds 2
    $elapsed += 2
    $trip = Invoke-RestMethod -Uri "$base/trips/$tripId"
    $phase = $trip.phase
    $status = $trip.status
    Write-Output "  ($elapsed`s) Trip status=$status phase=$phase"

    if ($status -ne 'active') {
        Write-Error "FAIL: Trip ended prematurely with status '$status' before reaching pickup"
        exit 1
    }
    if ($phase -eq 'at_pickup') {
        break
    }
}

if ($phase -ne 'at_pickup') {
    Write-Error "FAIL: Trip did not reach 'at_pickup' phase within ${maxWait}s"
    exit 1
}

# Step 3: Cancel the trip immediately — this is during the 15-second window
# before the hospital routing request fires, or possibly while it's in-flight
Write-Output "[3/6] Cancelling trip $tripId (during hospital routing window)..."
$stopResponse = Invoke-RestMethod -Uri "$base/trips/$tripId/stop" -Method Post -ContentType "application/json"
Write-Output "  Stop response: $($stopResponse.message)"

# Step 4: Wait long enough for the 15s timeout + OSRM request to complete
# If the race condition is NOT fixed, the trip would restart here
Write-Output "[4/6] Waiting 25 seconds to ensure any pending OSRM response doesn't restart the trip..."
Start-Sleep -Seconds 25

# Step 5: Verify trip is still cancelled
Write-Output "[5/6] Verifying trip status..."
$finalTrip = Invoke-RestMethod -Uri "$base/trips/$tripId"
Write-Output "  Final trip status: $($finalTrip.status), phase: $($finalTrip.phase)"

# Step 6: Verify ambulance is idle
Write-Output "[6/6] Verifying ambulance status..."
$ambulances = Invoke-RestMethod -Uri "$base/ambulances"
$amb = $ambulances | Where-Object { $_.id -eq $ambulanceId }
Write-Output "  Ambulance $ambulanceId status: $($amb.status)"

# Assertions
$passed = $true

if ($finalTrip.status -ne 'cancelled') {
    Write-Error "ASSERTION FAILED: Expected trip status 'cancelled', got '$($finalTrip.status)'"
    Write-Error "  This indicates the race condition bug — the OSRM response restarted the cancelled trip!"
    $passed = $false
}

if ($finalTrip.phase -eq 'to_hospital') {
    Write-Error "ASSERTION FAILED: Trip phase is 'to_hospital' — Leg 2 started despite cancellation!"
    $passed = $false
}

if ($amb.status -ne 'idle') {
    Write-Error "ASSERTION FAILED: Expected ambulance status 'idle', got '$($amb.status)'"
    $passed = $false
}

Write-Output ""
if ($passed) {
    Write-Output "PASS: Trip remained cancelled after OSRM routing window. Race condition fix verified."
    exit 0
} else {
    Write-Error "FAIL: Race condition regression test failed!"
    exit 1
}
