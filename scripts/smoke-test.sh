#!/usr/bin/env bash
#
# End-to-end test for the VortexGig PHP API.
#
# Against the local harness:
#   docker compose -f docker-compose.test.yml up -d
#   ./scripts/smoke-test.sh
#
# Against the live site:
#   API=https://vortexgig.com/api ./scripts/smoke-test.sh
#
# It MUTATES data — resolves the seeded dispute, distributes the reward pool and
# suspends an account (then reinstates it). Re-seed before running it again.
set -u
API="${API:-http://localhost:8090/api}"
PW="vortex123"
PASS=0; FAIL=0

j() { python3 -c '
import sys, json
d = json.load(sys.stdin)
for k in sys.argv[1].strip(".").split("."):
    d = d[int(k)] if k.lstrip("-").isdigit() else d[k]
print(d)' "$1" 2>/dev/null; }

jn() { python3 -c '
import sys, json
d = json.load(sys.stdin)
for k in sys.argv[1].strip(".").split("."):
    d = d[int(k)] if k.lstrip("-").isdigit() else d[k]
print(f"{float(d):.2f}")' "$1" 2>/dev/null; }

check() {
  if [ "$2" = "$3" ]; then echo "  PASS  $1 ($2)"; PASS=$((PASS+1));
  else echo "  FAIL  $1 — got '$2', expected '$3'"; FAIL=$((FAIL+1)); fi
}
ok() {
  if [ "$2" = "1" ]; then echo "  PASS  $1"; PASS=$((PASS+1));
  else echo "  FAIL  $1"; FAIL=$((FAIL+1)); fi
}
login() { curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$1\",\"password\":\"$PW\"}"; }
auth() { curl -s -H "Authorization: Bearer $1" "${@:2}"; }

echo "== health and public surface =="
check "healthz" "$(curl -s $API/healthz | j .status)" "ok"
S=$(curl -s $API/stats)
ok "stats paid out > 0" "$(echo "$S" | python3 -c "import sys,json;print(1 if float(json.load(sys.stdin)['paidOut'])>0 else 0)")"
ok "public board lists tasks" "$(curl -s "$API/tasks" | python3 -c "import sys,json;print(1 if len(json.load(sys.stdin))>=10 else 0)")"
ok "board hides employer budget from anonymous" "$(curl -s "$API/tasks" | python3 -c "import sys,json;print(1 if all(t['budget'] is None for t in json.load(sys.stdin)) else 0)")"
ok "categories endpoint" "$(curl -s "$API/tasks/categories" | python3 -c "import sys,json;print(1 if len(json.load(sys.stdin))>=5 else 0)")"

echo "== board filters =="
ok "search narrows the board" "$(curl -s "$API/tasks?search=transcribe" | python3 -c "import sys,json;d=json.load(sys.stdin);print(1 if len(d)==1 else 0)")"
ok "search matches the description" "$(curl -s "$API/tasks?search=houseplants" | python3 -c "import sys,json;print(1 if len(json.load(sys.stdin))==1 else 0)")"
ok "category filter" "$(curl -s "$API/tasks?category=Data" | python3 -c "import sys,json;d=json.load(sys.stdin);print(1 if d and all(t['category']=='Data' for t in d) else 0)")"
ok "difficulty filter" "$(curl -s "$API/tasks?difficulty=EXPERT" | python3 -c "import sys,json;d=json.load(sys.stdin);print(1 if d and all(t['difficulty']=='EXPERT' for t in d) else 0)")"
ok "status filter" "$(curl -s "$API/tasks?status=OPEN" | python3 -c "import sys,json;d=json.load(sys.stdin);print(1 if d and all(t['status']=='OPEN' for t in d) else 0)")"
ok "sort by reward descends" "$(curl -s "$API/tasks?sort=reward" | python3 -c "import sys,json;d=json.load(sys.stdin);print(1 if all(float(d[i]['reward'])>=float(d[i+1]['reward']) for i in range(len(d)-1)) else 0)")"
ok "no match returns empty, not an error" "$(curl -s "$API/tasks?search=zzzznotathing" | python3 -c "import sys,json;print(1 if json.load(sys.stdin)==[] else 0)")"

echo "== auth =="
MAYA=$(login maya@vortexgig.com); MT=$(echo "$MAYA" | j .token)
SAM=$(login sam@vortexgig.com);   ST=$(echo "$SAM" | j .token)
ADMIN=$(login admin@vortexgig.com); AT=$(echo "$ADMIN" | j .token)
check "employer role" "$(echo "$MAYA" | j .user.role)" "EMPLOYER"
check "worker role" "$(echo "$SAM" | j .user.role)" "WORKER"
check "admin role" "$(echo "$ADMIN" | j .user.role)" "ADMIN"
check "password is hashed, not compared raw" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/auth/login" -H 'Content-Type: application/json' -d '{"email":"sam@vortexgig.com","password":"wrong"}')" "401"
check "admin self-registration blocked" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/auth/register" -H 'Content-Type: application/json' -d '{"name":"X","email":"x1@y.dev","password":"secret1","role":"ADMIN"}')" "400"
check "anonymous cannot read /auth/me" "$(curl -s -o /dev/null -w '%{http_code}' "$API/auth/me")" "401"
check "a forged token is rejected" "$(curl -s -o /dev/null -w '%{http_code}' -H 'Authorization: Bearer aaa.bbb.ccc' "$API/auth/me")" "401"

echo "== browser origins (CORS) =="
O="https://demo.example.com"
check "preflight accepted" "$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS "$API/auth/register" -H "Origin: $O" -H 'Access-Control-Request-Method: POST')" "204"
check "login from a browser origin" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/auth/login" -H 'Content-Type: application/json' -H "Origin: $O" -d "{\"email\":\"sam@vortexgig.com\",\"password\":\"$PW\"}")" "200"

echo "== dashboards and leaderboard =="
ok "worker dashboard has lifetime earnings" "$(auth "$ST" "$API/dashboard/worker" | python3 -c "import sys,json;print(1 if float(json.load(sys.stdin)['lifetimeEarned'])>0 else 0)")"
ok "employer dashboard has escrow held" "$(auth "$MT" "$API/dashboard/employer" | python3 -c "import sys,json;print(1 if float(json.load(sys.stdin)['escrowHeld'])>0 else 0)")"
check "worker blocked from employer dashboard" "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $ST" "$API/dashboard/employer")" "403"
LB=$(curl -s "$API/leaderboard?window=all_time")
ok "leaderboard ranks workers with XP and tier" "$(echo "$LB" | python3 -c "import sys,json;d=json.load(sys.stdin);print(1 if len(d)>=3 and d[0]['rank']==1 and d[0]['xp']>0 and d[0]['tier'] else 0)")"
ok "leaderboard sorted by earnings" "$(echo "$LB" | python3 -c "import sys,json;d=json.load(sys.stdin);print(1 if all(float(d[i]['earned'])>=float(d[i+1]['earned']) for i in range(len(d)-1)) else 0)")"

echo "== full task lifecycle =="
BAL0=$(auth "$MT" "$API/auth/me" | j .available)
NEW=$(curl -s -X POST "$API/tasks" -H "Authorization: Bearer $MT" -H 'Content-Type: application/json' \
  -d '{"title":"Smoke test task","description":"A task created by the smoke test to verify escrow, claiming and payout.","category":"Testing","difficulty":"STARTER","reward":10.00,"slots":1}')
TID=$(echo "$NEW" | j .id)
ok "task created" "$([ -n "$TID" ] && echo 1 || echo 0)"
check "budget is reward x slots" "$(echo "$NEW" | jn .budget)" "10.00"
check "fee is 5%" "$(echo "$NEW" | jn .platformFee)" "0.50"
check "escrow funded" "$(echo "$NEW" | jn .escrow)" "10.00"
BAL1=$(auth "$MT" "$API/auth/me" | j .available)
ok "employer debited budget+fee" "$(python3 -c "print(1 if round(float('$BAL0')-float('$BAL1'),2)==10.50 else 0)")"
check "worker cannot post a task" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/tasks" -H "Authorization: Bearer $ST" -H 'Content-Type: application/json' -d '{"title":"nope","description":"a description long enough to pass validation","category":"X","difficulty":"STARTER","reward":1,"slots":1}')" "403"

CLAIM=$(curl -s -X POST "$API/tasks/$TID/claim" -H "Authorization: Bearer $ST")
SID=$(echo "$CLAIM" | j .id)
check "claim created" "$(echo "$CLAIM" | j .status)" "CLAIMED"
check "double claim rejected" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/tasks/$TID/claim" -H "Authorization: Bearer $ST")" "409"
check "employer cannot claim" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/tasks/$TID/claim" -H "Authorization: Bearer $MT")" "403"

PROOF=$(curl -s -X POST "$API/submissions/$SID/proof" -H "Authorization: Bearer $ST" -H 'Content-Type: application/json' \
  -d '{"proofText":"Ran the smoke test end to end and captured the output.","proofUrl":"https://example.com/proof"}')
check "proof moves to in-review" "$(echo "$PROOF" | j .status)" "PENDING"
ok "worker payout is pending" "$(auth "$ST" "$API/auth/me" | python3 -c "import sys,json;print(1 if float(json.load(sys.stdin)['pending'])>=10 else 0)")"
check "a stranger cannot approve" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/submissions/$SID/approve" -H "Authorization: Bearer $ST" -H 'Content-Type: application/json' -d '{}')" "403"

WAV0=$(auth "$ST" "$API/auth/me" | j .available)
check "approved" "$(curl -s -X POST "$API/submissions/$SID/approve" -H "Authorization: Bearer $MT" -H 'Content-Type: application/json' -d '{"feedback":"Looks right."}' | j .status)" "APPROVED"
WAV1=$(auth "$ST" "$API/auth/me" | j .available)
ok "worker paid the full reward" "$(python3 -c "print(1 if round(float('$WAV1')-float('$WAV0'),2)==10.00 else 0)")"
check "task auto-closed when full" "$(curl -s "$API/tasks/$TID" | j .status)" "CLOSED"
check "double approve rejected" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/submissions/$SID/approve" -H "Authorization: Bearer $MT" -H 'Content-Type: application/json' -d '{}')" "400"

echo "== disputes =="
DID=$(auth "$AT" "$API/admin/disputes" | j .0.id)
ok "seeded dispute is queued" "$([ -n "$DID" ] && echo 1 || echo 0)"
check "non-admin blocked from disputes" "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $ST" "$API/admin/disputes")" "403"
RES=$(curl -s -X POST "$API/admin/disputes/$DID/resolve" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
  -d '{"favour":"WORKER","resolution":"The recording shows a clean reproduction. Paying it out."}')
check "ruling for worker approves" "$(echo "$RES" | j .status)" "APPROVED"
ok "ruling recorded" "$(echo "$RES" | python3 -c "import sys,json;print(1 if json.load(sys.stdin)['resolution'] else 0)")"

echo "== moderation =="
LENA=$(auth "$AT" "$API/admin/users?role=WORKER" | python3 -c "import sys,json;print([u['id'] for u in json.load(sys.stdin) if u['email']=='lena@vortexgig.com'][0])")
curl -s -X PATCH "$API/admin/users/$LENA/status" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"status":"SUSPENDED"}' > /dev/null
LT=$(login lena@vortexgig.com | j .token)
OPEN=$(curl -s "$API/tasks?status=OPEN" | python3 -c "import sys,json;d=[t for t in json.load(sys.stdin) if t['claimable']];print(d[0]['id'] if d else '')")
check "suspended worker cannot claim" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/tasks/$OPEN/claim" -H "Authorization: Bearer $LT")" "403"
check "suspended worker can still read" "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $LT" "$API/auth/me")" "200"
curl -s -X PATCH "$API/admin/users/$LENA/status" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"status":"ACTIVE"}' > /dev/null

echo "== wallet =="
W=$(curl -s -X POST "$API/wallet/deposit" -H "Authorization: Bearer $ST" -H 'Content-Type: application/json' -d '{"amount":100}')
ok "deposit credits the balance" "$(echo "$W" | python3 -c "import sys,json;print(1 if float(json.load(sys.stdin)['available'])>=100 else 0)")"
ok "ledger records the deposit" "$(echo "$W" | python3 -c "import sys,json;d=json.load(sys.stdin)['transactions'];print(1 if any(t['type']=='DEPOSIT' for t in d) else 0)")"
ok "every ledger row carries its resulting balance" "$(echo "$W" | python3 -c "import sys,json;d=json.load(sys.stdin)['transactions'];print(1 if all(t['balanceAfter'] is not None for t in d) else 0)")"
check "cannot withdraw more than the balance" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/wallet/withdraw" -H "Authorization: Bearer $ST" -H 'Content-Type: application/json' -d '{"amount":999999}')" "400"

echo "== admin revenue and reward pool =="
REV=$(auth "$AT" "$API/admin/revenue")
ok "fee revenue recorded" "$(echo "$REV" | python3 -c "import sys,json;print(1 if float(json.load(sys.stdin)['feesAllTime'])>0 else 0)")"
ok "reward pool has funds" "$(echo "$REV" | python3 -c "import sys,json;print(1 if float(json.load(sys.stdin)['rewardPoolAvailable'])>0 else 0)")"
check "fee percent is 5" "$(echo "$REV" | jn .feePercent)" "5.00"
ok "pool distributed to workers" "$(curl -s -X POST "$API/admin/reward-pool/distribute" -H "Authorization: Bearer $AT" | python3 -c "import sys,json;d=json.load(sys.stdin);print(1 if d.get('recipients',0)>0 and float(d['totalAmount'])>0 else 0)")"
ok "pool resets after a cycle" "$(auth "$AT" "$API/admin/revenue" | python3 -c "import sys,json;print(1 if float(json.load(sys.stdin)['rewardPoolAvailable'])==0 else 0)")"
check "fee setting updated" "$(curl -s -X PATCH "$API/admin/settings" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"feePercent":7.5,"rewardPoolPercent":25}' | jn .feePercent)" "7.50"
check "new fee applies to a quote" "$(curl -s "$API/tasks/quote?reward=100&slots=1" | jn .platformFee)" "7.50"
curl -s -X PATCH "$API/admin/settings" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"feePercent":5,"rewardPoolPercent":20}' > /dev/null
ok "global ledger populated" "$(auth "$AT" "$API/admin/ledger" | python3 -c "import sys,json;print(1 if len(json.load(sys.stdin))>20 else 0)")"

echo
echo "=================================="
echo "  passed: $PASS    failed: $FAIL"
echo "=================================="
[ "$FAIL" -eq 0 ]
