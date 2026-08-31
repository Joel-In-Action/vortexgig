<?php
/**
 * Wallet and the admin control centre. Included at the end of routes_work.php.
 */

// ===========================================================================
// Wallet
// ===========================================================================

/** The wallet payload, shared by the GET and by both money movements. */
function wallet_payload(PDO $pdo, int $userId): array {
    $stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    $user = $stmt->fetch();

    $escrow = 0;
    if ($user['role'] === 'EMPLOYER') {
        $q = $pdo->prepare('SELECT COALESCE(SUM(escrow),0) FROM tasks WHERE employer_id = ?');
        $q->execute([$user['id']]);
        $escrow = $q->fetchColumn();
    }

    $tx = $pdo->prepare('SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 40');
    $tx->execute([$user['id']]);

    return [
        'available'              => money($user['available']),
        'pending'                => money($user['pending']),
        'lifetimeEarned'         => money($user['lifetime_earned']),
        'totalSpent'             => money($user['total_spent']),
        'availableCrypto'        => money(0),
        'pendingCrypto'          => money(0),
        'lifetimeEarnedCrypto'   => money(0),
        'totalSpentCrypto'       => money(0),
        'walletAddress'          => null,
        'escrowHeld'             => money($escrow),
        'readyToWithdraw'        => $user['role'] === 'WORKER' ? money($user['available']) : money(0),
        'transactions'           => array_map('tx_json', $tx->fetchAll()),
    ];
}

if (route('GET', '/wallet')) {
    respond(wallet_payload($pdo, (int)require_user()['id']));
}

if (route('POST', '/wallet/deposit')) {
    $user = require_user();
    require_active($user);
    $amount = (float)field(body(), 'amount', 0);
    if ($amount < 1) fail('The minimum is $1.00.');

    $pdo->beginTransaction();
    ledger($pdo, (int)$user['id'], 'DEPOSIT', money($amount), 'Added funds');
    $pdo->commit();

    respond(wallet_payload($pdo, (int)$user['id']));
}

if (route('POST', '/wallet/withdraw')) {
    $user = require_user();
    require_active($user);
    $amount = (float)field(body(), 'amount', 0);
    if ($amount < 1) fail('The minimum is $1.00.');
    if ((float)$user['available'] < $amount) {
        fail('You only have $' . money($user['available']) . ' ready to withdraw.');
    }

    $pdo->beginTransaction();
    ledger($pdo, (int)$user['id'], 'WITHDRAWAL', money(-$amount), 'Withdrawn to your bank');
    $pdo->commit();

    respond(wallet_payload($pdo, (int)$user['id']));
}

// ===========================================================================
// Admin control centre — every handler gates on ADMIN first.
// ===========================================================================

if (str_starts_with($path, '/admin/')) {
    $admin = require_role('ADMIN', 'That is the admin control centre.');
}

if (route('GET', '/admin/users')) {
    $where = []; $params = [];
    if (in_array($r = strtoupper((string)($_GET['role'] ?? '')), ['EMPLOYER','WORKER','ADMIN'], true)) {
        $where[] = 'role = ?'; $params[] = $r;
    }
    if (($s = trim((string)($_GET['search'] ?? ''))) !== '') {
        $where[] = '(name LIKE ? OR email LIKE ?)';
        array_push($params, "%$s%", "%$s%");
    }
    $sql = 'SELECT * FROM users' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY created_at DESC';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    respond(array_map(fn($u) => [
        'id'             => (int)$u['id'],
        'name'           => $u['name'],
        'email'          => $u['email'],
        'initials'       => initials($u['name']),
        'role'           => $u['role'],
        'status'         => $u['status'],
        'available'      => money($u['available']),
        'availableCrypto'=> money(0),
        'lifetimeEarned' => money($u['lifetime_earned']),
        'totalSpent'     => money($u['total_spent']),
        'walletAddress'  => null,
        'memberSince'    => $u['created_at'],
    ], $stmt->fetchAll()));
}

if (route('PATCH', '/admin/users/{id}/status', $a)) {
    $next = strtoupper((string)field(body(), 'status', ''));
    if (!in_array($next, ['ACTIVE','SUSPENDED'], true)) fail('Status must be active or suspended.');

    $stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
    $stmt->execute([$a[0]]);
    $target = $stmt->fetch();
    if (!$target) fail('No account with that id.', 404);
    if ((int)$target['id'] === (int)$admin['id']) fail('You cannot suspend your own account.');
    if ($target['role'] === 'ADMIN')              fail('Admin accounts cannot be suspended from here.');

    $pdo->prepare('UPDATE users SET status = ? WHERE id = ?')->execute([$next, $target['id']]);
    $stmt->execute([$a[0]]);
    $u = $stmt->fetch();
    respond([
        'id' => (int)$u['id'], 'name' => $u['name'], 'email' => $u['email'],
        'initials' => initials($u['name']), 'role' => $u['role'], 'status' => $u['status'],
        'available' => money($u['available']), 'availableCrypto' => money(0),
        'lifetimeEarned' => money($u['lifetime_earned']), 'totalSpent' => money($u['total_spent']),
        'walletAddress' => null, 'memberSince' => $u['created_at'],
    ]);
}

if (route('GET', '/admin/disputes')) {
    $stmt = $pdo->query(SUBMISSION_SELECT() . " WHERE s.status = 'DISPUTED' ORDER BY s.disputed_at ASC");
    respond(array_map(fn($s) => submission_json($s, true, true), $stmt->fetchAll()));
}

/**
 * Closes a dispute. For the worker it pays out of escrow exactly as an approval
 * would; for the employer it clears the pending balance and returns the slot,
 * exactly as a rejection would. The ruling text is stored either way so both
 * sides can read it.
 */
if (route('POST', '/admin/disputes/{id}/resolve', $a)) {
    $b       = body();
    $favour  = strtoupper((string)field($b, 'favour', ''));
    $ruling  = trim((string)field($b, 'resolution', ''));
    if (!in_array($favour, ['WORKER','EMPLOYER'], true)) fail('A ruling has to favour the worker or the employer.');
    if ($ruling === '') fail('Write the ruling, so both sides can see the reasoning.');

    $s = load_submission($pdo, (int)$a[0]);
    if ($s['status'] !== 'DISPUTED') fail('That submission is not in dispute.');

    $pdo->beginTransaction();
    $stmt = $pdo->prepare('SELECT * FROM tasks WHERE id = ? FOR UPDATE');
    $stmt->execute([$s['task_id']]);
    $task = $stmt->fetch();

    if ($favour === 'WORKER') {
        if ((float)$task['escrow'] < (float)$s['reward']) {
            $pdo->rollBack();
            fail('This task no longer holds enough escrow to pay this out.');
        }
        $pdo->prepare("UPDATE submissions SET status='APPROVED' WHERE id = ?")->execute([$s['id']]);
        pay_out($pdo, $s, $task);
        $filled = min((int)$task['slots_total'], (int)$task['slots_filled'] + 1);
        $pdo->prepare('UPDATE tasks SET slots_filled = ? WHERE id = ?')->execute([$filled, $task['id']]);
        if ($filled >= (int)$task['slots_total']) {
            $fresh = $pdo->prepare('SELECT * FROM tasks WHERE id = ?');
            $fresh->execute([$task['id']]);
            refund_escrow($pdo, $fresh->fetch());
            $pdo->prepare("UPDATE tasks SET status='CLOSED' WHERE id = ?")->execute([$task['id']]);
        }
    } else {
        $pdo->prepare("UPDATE submissions SET status='REJECTED' WHERE id = ?")->execute([$s['id']]);
        release_pending($pdo, (int)$s['worker_id'], money($s['reward']));
        $pdo->prepare('UPDATE tasks SET slots_taken = GREATEST(0, slots_taken - 1) WHERE id = ?')
            ->execute([$task['id']]);
    }

    $pdo->prepare('UPDATE submissions SET resolution = ?, resolved_at = NOW(), reviewed_at = NOW() WHERE id = ?')
        ->execute([$ruling, $s['id']]);
    $pdo->commit();

    respond(submission_json(load_submission($pdo, (int)$s['id']), true, true));
}

/** Start of the current reward-pool cycle: the end of the last one, or null. */
function pool_period_start(PDO $pdo): ?string {
    $v = $pdo->query('SELECT period_end FROM reward_pool_distributions ORDER BY period_end DESC LIMIT 1')->fetchColumn();
    return $v === false ? null : $v;
}

/**
 * The pool waiting to be handed out: a share of the fees collected since the
 * last cycle. Read from the ledger rather than an accumulator, so it cannot
 * drift, and the previous cycle's end is what stops the same revenue funding
 * two payouts.
 */
function pool_available(PDO $pdo): float {
    $since = pool_period_start($pdo);
    $sql   = "SELECT COALESCE(-SUM(amount),0) FROM wallet_transactions WHERE type='PLATFORM_FEE'"
           . ($since ? ' AND created_at > ?' : '');
    $stmt = $pdo->prepare($sql);
    $stmt->execute($since ? [$since] : []);
    return round((float)$stmt->fetchColumn() * (float)settings($pdo)['reward_pool_percent'] / 100, 2);
}

if (route('GET', '/admin/revenue')) {
    $fee = fn(string $clause = '') =>
        (float)$pdo->query("SELECT COALESCE(-SUM(amount),0) FROM wallet_transactions WHERE type='PLATFORM_FEE' $clause")->fetchColumn();

    $set    = settings($pdo);
    $cycles = $pdo->query('SELECT * FROM reward_pool_distributions ORDER BY created_at DESC')->fetchAll();

    respond([
        'feesAllTime'         => money($fee()),
        'feesThisMonth'       => money($fee('AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)')),
        'feesThisWeek'        => money($fee('AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)')),
        'feesCryptoAllTime'   => money(0),
        'paidOut'             => money($pdo->query("SELECT COALESCE(SUM(amount),0) FROM wallet_transactions WHERE type='PAYOUT'")->fetchColumn()),
        'paidOutCrypto'       => money(0),
        'bonusesPaid'         => money($pdo->query("SELECT COALESCE(SUM(amount),0) FROM wallet_transactions WHERE type='BONUS'")->fetchColumn()),
        'rewardPoolAvailable' => money(pool_available($pdo)),
        'feePercent'          => money($set['fee_percent']),
        'rewardPoolPercent'   => money($set['reward_pool_percent']),
        'users'               => (int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn(),
        'employers'           => (int)$pdo->query("SELECT COUNT(*) FROM users WHERE role='EMPLOYER'")->fetchColumn(),
        'workers'             => (int)$pdo->query("SELECT COUNT(*) FROM users WHERE role='WORKER'")->fetchColumn(),
        'openDisputes'        => (int)$pdo->query("SELECT COUNT(*) FROM submissions WHERE status='DISPUTED'")->fetchColumn(),
        'cycles'              => array_map(fn($c) => [
            'id'          => (int)$c['id'],
            'periodStart' => $c['period_start'],
            'periodEnd'   => $c['period_end'],
            'totalAmount' => money($c['total_amount']),
            'recipients'  => (int)$c['recipients'],
        ], $cycles),
    ]);
}

if (route('GET', '/admin/ledger')) {
    $rows = $pdo->query('SELECT w.*, u.name, u.headline, u.role, u.created_at AS user_created
                         FROM wallet_transactions w JOIN users u ON u.id = w.user_id
                         ORDER BY w.created_at DESC, w.id DESC LIMIT 100')->fetchAll();
    respond(array_map(fn($r) => [
        'transaction' => tx_json($r),
        'user'        => public_user(['id' => $r['user_id'], 'name' => $r['name'],
                                      'headline' => $r['headline'], 'role' => $r['role'],
                                      'created_at' => $r['user_created']]),
    ], $rows));
}

if (route('PATCH', '/admin/settings')) {
    $b   = body();
    $fee  = field($b, 'feePercent');
    $pool = field($b, 'rewardPoolPercent');
    if ($fee !== null && ((float)$fee < 0 || (float)$fee > 50))   fail('The service fee has to sit between 0% and 50%.');
    if ($pool !== null && ((float)$pool < 0 || (float)$pool > 100)) fail('The reward pool share has to sit between 0% and 100%.');

    $cur = settings($pdo);
    $pdo->prepare('UPDATE platform_settings SET fee_percent = ?, reward_pool_percent = ? WHERE id = 1')
        ->execute([money($fee ?? $cur['fee_percent']), money($pool ?? $cur['reward_pool_percent'])]);

    $new = settings($pdo);
    respond([
        'feePercent'        => money($new['fee_percent']),
        'rewardPoolPercent' => money($new['reward_pool_percent']),
        'updatedAt'         => $new['updated_at'] ?? date('Y-m-d H:i:s'),
    ]);
}

/**
 * Pays the pool to the top workers of the cycle, split in proportion to what
 * each earned. The rounding remainder goes to the top of the board, so the
 * shares always add back up to the pool exactly.
 */
if (route('POST', '/admin/reward-pool/distribute')) {
    $pool = pool_available($pdo);
    if ($pool < 1) fail('There is less than $1.00 in the pool. Let it build up first.');

    $since  = pool_period_start($pdo);
    $clause = $since ? 'AND s.reviewed_at > ?' : '';
    $stmt   = $pdo->prepare("SELECT s.worker_id, COUNT(*) AS completed, SUM(s.reward) AS earned
                             FROM submissions s WHERE s.status='APPROVED' $clause
                             GROUP BY s.worker_id ORDER BY earned DESC LIMIT 10");
    $stmt->execute($since ? [$since] : []);
    $rows = $stmt->fetchAll();
    if (!$rows) fail('No approved work in this cycle yet, so there is nobody to pay.');

    $total  = array_sum(array_map(fn($r) => (float)$r['earned'], $rows));
    $shares = [];
    $given  = 0.0;
    foreach ($rows as $r) {
        $share = floor((float)$r['earned'] * $pool / $total * 100) / 100;
        $shares[] = $share;
        $given += $share;
    }
    $shares[0] += round($pool - $given, 2);

    $pdo->beginTransaction();
    $paid = 0;
    foreach ($rows as $i => $r) {
        if ($shares[$i] <= 0) continue;
        ledger($pdo, (int)$r['worker_id'], 'BONUS', money($shares[$i]),
               'Reward pool bonus — rank ' . ($i + 1));
        $paid++;
    }
    $pdo->prepare('INSERT INTO reward_pool_distributions (period_start, period_end, total_amount, recipients)
                   VALUES (?, NOW(), ?, ?)')
        ->execute([$since ?? '1970-01-01 00:00:00', money($pool), $paid]);
    $id = (int)$pdo->lastInsertId();
    $pdo->commit();

    $stmt = $pdo->prepare('SELECT * FROM reward_pool_distributions WHERE id = ?');
    $stmt->execute([$id]);
    $c = $stmt->fetch();
    respond([
        'id'          => (int)$c['id'],
        'periodStart' => $c['period_start'],
        'periodEnd'   => $c['period_end'],
        'totalAmount' => money($c['total_amount']),
        'recipients'  => (int)$c['recipients'],
    ]);
}
