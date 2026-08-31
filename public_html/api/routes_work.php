<?php
/**
 * Submissions, dashboards, leaderboard, wallet and the admin control centre.
 * Included at the end of index.php, which has already set up $pdo and routing.
 */

// ===========================================================================
// Submissions
// ===========================================================================

if (route('GET', '/submissions')) {
    $user = require_user();
    if ($user['role'] === 'WORKER') {
        $stmt = $pdo->prepare(SUBMISSION_SELECT() . ' WHERE s.worker_id = ? ORDER BY s.claimed_at DESC');
        $stmt->execute([$user['id']]);
        respond(array_map(fn($s) => submission_json($s, true, false), $stmt->fetchAll()));
    }
    // The employer sees the queue of work waiting on them, oldest wait first.
    $stmt = $pdo->prepare(SUBMISSION_SELECT() . " WHERE t.employer_id = ?
                           ORDER BY (s.status = 'PENDING') DESC, s.submitted_at DESC, s.claimed_at DESC");
    $stmt->execute([$user['id']]);
    respond(array_map(fn($s) => submission_json($s, true, true), $stmt->fetchAll()));
}

/** Loads a submission with its task and both parties, or 404s. */
function load_submission(PDO $pdo, int $id): array {
    $stmt = $pdo->prepare(SUBMISSION_SELECT() . ' WHERE s.id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) fail('That submission does not exist.', 404);
    return $row;
}

if (route('POST', '/submissions/{id}/proof', $a)) {
    $user = require_user();
    require_active($user);
    $s = load_submission($pdo, (int)$a[0]);

    if ((int)$s['worker_id'] !== (int)$user['id']) fail('That claim belongs to someone else.', 403);
    if ($s['status'] === 'PENDING')  fail('This is already in review.');
    if ($s['status'] !== 'CLAIMED')  fail('This claim has already been reviewed.');
    if (task_expired($s))            fail('This task passed its deadline.');

    $b     = body();
    $proof = trim((string)field($b, 'proofText', ''));
    if (strlen($proof) < 10) fail('Add a little more detail — at least 10 characters.');

    $pdo->beginTransaction();
    $pdo->prepare("UPDATE submissions SET proof_text = ?, proof_url = ?, status = 'PENDING', submitted_at = NOW() WHERE id = ?")
        ->execute([$proof, field($b, 'proofUrl'), $s['id']]);
    hold_pending($pdo, (int)$s['worker_id'], money($s['reward']));
    $pdo->commit();

    respond(submission_json(load_submission($pdo, (int)$s['id'])));
}

/** Shared guard for approve and reject. */
function require_reviewable(PDO $pdo, int $id, array $employer): array {
    $s = load_submission($pdo, $id);
    if ((int)$s['employer_id'] !== (int)$employer['id']) fail("That submission is on someone else's task.", 403);
    require_active($employer);
    if ($s['status'] === 'CLAIMED')  fail('This worker has not submitted proof yet.');
    if ($s['status'] === 'DISPUTED') fail('This one is with a moderator. You will see their ruling here.');
    if ($s['status'] !== 'PENDING')  fail('You have already reviewed this one.');
    return $s;
}

if (route('POST', '/submissions/{id}/approve', $a)) {
    $employer = require_role('EMPLOYER', 'Only the employer reviews submissions.');
    $s = require_reviewable($pdo, (int)$a[0], $employer);

    $pdo->beginTransaction();
    $stmt = $pdo->prepare('SELECT * FROM tasks WHERE id = ? FOR UPDATE');
    $stmt->execute([$s['task_id']]);
    $task = $stmt->fetch();

    $pdo->prepare("UPDATE submissions SET status = 'APPROVED', reviewed_at = NOW(), feedback = ? WHERE id = ?")
        ->execute([field(body(), 'feedback'), $s['id']]);
    pay_out($pdo, $s, $task);

    $filled = (int)$task['slots_filled'] + 1;
    $pdo->prepare('UPDATE tasks SET slots_filled = ? WHERE id = ?')->execute([$filled, $task['id']]);
    // Every slot is paid for, so take it off the board.
    if ($filled >= (int)$task['slots_total']) {
        $fresh = $pdo->prepare('SELECT * FROM tasks WHERE id = ?');
        $fresh->execute([$task['id']]);
        refund_escrow($pdo, $fresh->fetch());
        $pdo->prepare("UPDATE tasks SET status = 'CLOSED' WHERE id = ?")->execute([$task['id']]);
    }
    $pdo->commit();

    respond(submission_json(load_submission($pdo, (int)$s['id']), true, true));
}

if (route('POST', '/submissions/{id}/reject', $a)) {
    $employer = require_role('EMPLOYER', 'Only the employer reviews submissions.');
    $s = require_reviewable($pdo, (int)$a[0], $employer);

    $feedback = trim((string)field(body(), 'feedback', ''));
    if ($feedback === '') fail('Say why, so the worker knows what to fix.');

    $pdo->beginTransaction();
    $pdo->prepare("UPDATE submissions SET status = 'REJECTED', reviewed_at = NOW(), feedback = ? WHERE id = ?")
        ->execute([$feedback, $s['id']]);
    release_pending($pdo, (int)$s['worker_id'], money($s['reward']));
    // The slot goes back on the board for someone else.
    $pdo->prepare('UPDATE tasks SET slots_taken = GREATEST(0, slots_taken - 1) WHERE id = ?')
        ->execute([$s['task_id']]);
    $pdo->commit();

    respond(submission_json(load_submission($pdo, (int)$s['id']), true, true));
}

/**
 * Escalates to a moderator. From PENDING either side can, and nothing has moved
 * yet. From REJECTED only the worker can, and because rejection already freed
 * the slot and cleared their pending balance, both have to be taken again for a
 * ruling in their favour to be payable.
 */
if (route('POST', '/submissions/{id}/dispute', $a)) {
    $user = require_user();
    require_active($user);
    $reason = trim((string)field(body(), 'reason', ''));
    if ($reason === '') fail('Say what went wrong, so a moderator can rule on it.');

    $s = load_submission($pdo, (int)$a[0]);
    $isWorker   = (int)$s['worker_id']   === (int)$user['id'];
    $isEmployer = (int)$s['employer_id'] === (int)$user['id'];

    if (!$isWorker && !$isEmployer)    fail('That submission is not yours to dispute.', 403);
    if ($s['status'] === 'DISPUTED')   fail('This is already with a moderator.');
    if ($s['status'] === 'CLAIMED')    fail('There is nothing to dispute until proof is submitted.');
    if ($s['status'] === 'APPROVED')   fail('This was already approved and paid.');
    if ($s['status'] === 'REJECTED' && !$isWorker) fail('You rejected this one — there is nothing to escalate.');

    $pdo->beginTransaction();
    if ($s['status'] === 'REJECTED') {
        $stmt = $pdo->prepare('SELECT * FROM tasks WHERE id = ? FOR UPDATE');
        $stmt->execute([$s['task_id']]);
        $task = $stmt->fetch();
        if ((float)$task['escrow'] < (float)$s['reward']) {
            $pdo->rollBack();
            fail('This task has closed and its escrow was returned, so there is nothing left to rule on.');
        }
        if ((int)$task['slots_taken'] >= (int)$task['slots_total']) {
            $pdo->rollBack();
            fail('Every slot on this task has since been filled.');
        }
        $pdo->prepare('UPDATE tasks SET slots_taken = slots_taken + 1 WHERE id = ?')->execute([$task['id']]);
        hold_pending($pdo, (int)$s['worker_id'], money($s['reward']));
    }

    $pdo->prepare("UPDATE submissions SET status = 'DISPUTED', disputed_by = ?, dispute_reason = ?, disputed_at = NOW() WHERE id = ?")
        ->execute([$isWorker ? 'WORKER' : 'EMPLOYER', $reason, $s['id']]);
    $pdo->commit();

    respond(submission_json(load_submission($pdo, (int)$s['id']), true, true));
}

// ===========================================================================
// Dashboards
// ===========================================================================

if (route('GET', '/dashboard/worker')) {
    $user = require_role('WORKER', 'This is the worker workspace.');

    $c = $pdo->prepare("SELECT
            SUM(status='APPROVED') AS approved, SUM(status='REJECTED') AS rejected,
            SUM(status='CLAIMED')  AS claimed,  SUM(status='PENDING')  AS pending
          FROM submissions WHERE worker_id = ?");
    $c->execute([$user['id']]);
    $n = $c->fetch();

    $approved = (int)$n['approved']; $rejected = (int)$n['rejected'];
    $reviewed = $approved + $rejected;
    // Null until something has actually been reviewed, so the UI can say
    // "no rate yet" instead of a discouraging 0%.
    $rate = $reviewed === 0 ? null : (int)round($approved * 100 / $reviewed);

    $w = $pdo->prepare("SELECT COUNT(*) AS c, COALESCE(SUM(reward),0) AS s FROM submissions
                        WHERE worker_id = ? AND status='APPROVED' AND reviewed_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)");
    $w->execute([$user['id']]);
    $week = $w->fetch();

    $r = $pdo->prepare(SUBMISSION_SELECT() . ' WHERE s.worker_id = ? ORDER BY s.claimed_at DESC LIMIT 5');
    $r->execute([$user['id']]);

    // Suggestions: open work this worker has not already claimed.
    $u = $pdo->prepare(TASK_SELECT() . " WHERE t.status='OPEN' AND t.slots_taken < t.slots_total
                        AND (t.deadline IS NULL OR t.deadline >= CURDATE())
                        AND t.id NOT IN (SELECT task_id FROM submissions WHERE worker_id = ?)
                        ORDER BY t.created_at DESC LIMIT 4");
    $u->execute([$user['id']]);

    $a = $pdo->prepare('SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 8');
    $a->execute([$user['id']]);

    respond([
        'available'         => money($user['available']),
        'pending'           => money($user['pending']),
        'lifetimeEarned'    => money($user['lifetime_earned']),
        'completed'         => $approved,
        'active'            => (int)$n['claimed'] + (int)$n['pending'],
        'inReview'          => (int)$n['pending'],
        'completionRate'    => $rate,
        'approvedThisWeek'  => (int)$week['c'],
        'earnedThisWeek'    => money($week['s']),
        'recentSubmissions' => array_map(fn($s) => submission_json($s, true, false), $r->fetchAll()),
        'nextUp'            => array_map(fn($t) => task_json($t, false), $u->fetchAll()),
        'activity'          => array_map('tx_json', $a->fetchAll()),
    ]);
}

if (route('GET', '/dashboard/employer')) {
    $user = require_role('EMPLOYER', 'This is the employer workspace.');

    $q = $pdo->prepare(SUBMISSION_SELECT() . " WHERE t.employer_id = ? AND s.status = 'PENDING'
                        ORDER BY s.submitted_at ASC");
    $q->execute([$user['id']]);
    $queue = $q->fetchAll();

    $t = $pdo->prepare(TASK_SELECT() . ' WHERE t.employer_id = ? ORDER BY t.created_at DESC LIMIT 5');
    $t->execute([$user['id']]);

    $stat = $pdo->prepare("SELECT
            (SELECT COALESCE(SUM(escrow),0) FROM tasks WHERE employer_id = ?) AS escrow,
            (SELECT COUNT(*) FROM tasks WHERE employer_id = ? AND status='OPEN') AS active,
            (SELECT COUNT(*) FROM submissions s JOIN tasks k ON k.id=s.task_id
               WHERE k.employer_id = ? AND s.status='APPROVED') AS approved,
            (SELECT COUNT(DISTINCT s.worker_id) FROM submissions s JOIN tasks k ON k.id=s.task_id
               WHERE k.employer_id = ? AND s.status='APPROVED') AS contributors");
    $stat->execute(array_fill(0, 4, $user['id']));
    $s = $stat->fetch();

    $a = $pdo->prepare('SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 8');
    $a->execute([$user['id']]);

    respond([
        'available'      => money($user['available']),
        'escrowHeld'     => money($s['escrow']),
        'totalSpent'     => money($user['total_spent']),
        'activeTasks'    => (int)$s['active'],
        'pendingReviews' => count($queue),
        'approvedCount'  => (int)$s['approved'],
        'contributors'   => (int)$s['contributors'],
        'tasks'          => array_map(fn($x) => task_json($x, true), $t->fetchAll()),
        'reviewQueue'    => array_map(fn($x) => submission_json($x, true, true), $queue),
        'activity'       => array_map('tx_json', $a->fetchAll()),
    ]);
}

// ===========================================================================
// Leaderboard — computed from approved work, never stored, so it cannot drift.
// ===========================================================================

if (route('GET', '/leaderboard')) {
    $viewer  = current_user();
    $windows = ['week' => '7 DAY', 'month' => '30 DAY'];
    $w       = $_GET['window'] ?? 'all_time';
    $clause  = isset($windows[$w]) ? "AND s.reviewed_at >= DATE_SUB(NOW(), INTERVAL {$windows[$w]})" : '';

    $rows = $pdo->query("SELECT u.id, u.name, u.headline, u.created_at,
                                COUNT(*) AS completed, SUM(s.reward) AS earned, MAX(s.reviewed_at) AS last_active
                         FROM submissions s JOIN users u ON u.id = s.worker_id
                         WHERE s.status = 'APPROVED' $clause
                         GROUP BY u.id, u.name, u.headline, u.created_at
                         ORDER BY earned DESC, completed DESC
                         LIMIT 25")->fetchAll();

    $out = [];
    foreach ($rows as $i => $r) {
        $xp = xp_for((int)$r['completed'], (float)$r['earned']);
        $out[] = [
            'rank'       => $i + 1,
            'worker'     => public_user($r + ['role' => 'WORKER']),
            'completed'  => (int)$r['completed'],
            'earned'     => money($r['earned']),
            'xp'         => $xp,
            'tier'       => tier_for($xp),
            'lastActive' => $r['last_active'],
            'isYou'      => $viewer && (int)$viewer['id'] === (int)$r['id'],
        ];
    }
    respond($out);
}

require __DIR__ . '/routes_admin.php';

// Nothing matched.
fail('No such endpoint: ' . $method . ' ' . $path, 404);
