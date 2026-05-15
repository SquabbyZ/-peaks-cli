#!/bin/bash
# E2E tests for peaks CLI artifacts workflow

PEAKS_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
PEAKS="$PEAKS_DIR/bin/peaks.js"
WORKSPACE_ID="test-e2e-artifacts"

FAILED=0

run_test() {
    local name="$1"
    local cmd="$2"
    echo -n "Testing $name... "
    if eval "$cmd" > /dev/null 2>&1; then
        echo "PASS"
    else
        echo "FAIL"
        FAILED=$((FAILED + 1))
    fi
}

echo "=== Testing peaks CLI artifacts workflow ==="

run_test "artifacts status" "$PEAKS artifacts status --json"
run_test "artifacts sync dry-run" "$PEAKS artifacts sync --workspace ws1 --json"
run_test "artifacts workspace status" "$PEAKS artifacts workspace --json"
run_test "artifacts workspace status with workspace flag" "$PEAKS artifacts workspace --workspace ws1 --json"
run_test "artifacts init GitHub" "$PEAKS artifacts init --provider github --name test-artifacts --json"
run_test "artifacts init GitLab" "$PEAKS artifacts init --provider gitlab --name test-artifacts --json"

# These should fail
run_test "artifacts sync reject non-dry-run (should fail)" "! $PEAKS artifacts sync --workspace ws1 --no-dry-run --json"
run_test "artifacts init reject unsupported provider (should fail)" "! $PEAKS artifacts init --provider gitea --name test-artifacts --json"

echo ""
if [ $FAILED -eq 0 ]; then
    echo "=== All artifacts workflow tests passed ==="
    exit 0
else
    echo "=== $FAILED tests failed ==="
    exit 1
fi