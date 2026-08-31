<?php
/**
 * VortexGig API — single front controller.
 *
 * .htaccess rewrites everything under /api/ to this file, so routing is done
 * here against the path after "/api".
 */

require_once __DIR__ . '/serialize.php';

// --- CORS ------------------------------------------------------------------
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '') {
    $allowed = in_array('*', CORS_ORIGINS, true) || in_array($origin, CORS_ORIGINS, true);
    if ($allowed) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
        header('Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, Authorization');
        header('Access-Control-Max-Age: 86400');
    }
}
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }

// --- Route ------------------------------------------------------------------
$method = $_SERVER['REQUEST_METHOD'];
// Treat HEAD as GET so uptime monitors and health checks get a real status
// instead of falling through to the 404 handler. PHP discards the body itself.
if ($method === 'HEAD') $method = 'GET';
$path   = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';
$path   = preg_replace('#^.*?/api#', '', $path);
$path   = '/' . trim($path, '/');
$pdo    = get_pdo();

/**
 * true when this request is `METHOD /pattern`, capturing {id} into $args.
 *
 * $args is deliberately untyped: callers pass a variable that does not exist
 * yet, and PHP hands a by-reference parameter null in that case — which an
 * `array` type declaration would reject, throwing before the route even runs.
 */
function route(string $wanted, string $pattern, &$args = null): bool {
    global $method, $path;
    if ($method !== $wanted) return false;
    $regex = '#^' . preg_replace('/\{[a-z]+\}/', '(\d+)', $pattern) . '$#';
    $args = [];
    if (!preg_match($regex, $path, $m)) return false;
    $args = array_slice($m, 1);
    return true;
}

// Anything unhandled below is a server fault, reported without leaking internals.
set_exception_handler(function (Throwable $e) {
    error_log('VortexGig: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    fail('The marketplace had a hiccup. Try again in a moment.', 500);
});

// ===========================================================================
// Health and public stats
// ===========================================================================

if (route('GET', '/healthz')) {
    respond(['status' => 'ok', 'service' => 'vortexgig']);
}

if (route('GET', '/stats')) {
    $paid = $pdo->query("SELECT COALESCE(SUM(amount),0) FROM wallet_transactions WHERE type='PAYOUT'")->fetchColumn();
    $done = $pdo->query("SELECT COUNT(*) FROM submissions WHERE status='APPROVED'")->fetchColumn();
    $open = $pdo->query("SELECT COUNT(*) FROM tasks WHERE status='OPEN'")->fetchColumn();
    $wrk  = $pdo->query("SELECT COUNT(*) FROM users WHERE role='WORKER'")->fetchColumn();
    $fees = $pdo->query("SELECT COALESCE(-SUM(amount),0) FROM wallet_transactions WHERE type='PLATFORM_FEE'")->fetchColumn();
    $pool = round((float)$fees * (float)settings($pdo)['reward_pool_percent'] / 100, 2);

    respond([
        'paidOut'        => money($paid),
        'paidOutCrypto'  => money(0),
        'tasksCompleted' => (int)$done,
        'openTasks'      => (int)$open,
        'workers'        => (int)$wrk,
        'rewardPool'     => money($pool),
    ]);
}

// ===========================================================================
// Auth
// ===========================================================================

if (route('POST', '/auth/register')) {
    $b     = body();
    $name  = trim((string)field($b, 'name', ''));
    $email = strtolower(trim((string)field($b, 'email', '')));
    $pass  = (string)field($b, 'password', '');
    $role  = strtoupper((string)field($b, 'role', ''));

    if ($name === '')                              fail('Tell us what to call you.');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('That does not look like an email address.');
    if (strlen($pass) < 6)                          fail('At least 6 characters.');
    // Admin accounts are provisioned, never self-served.
    if (!in_array($role, ['EMPLOYER', 'WORKER'], true)) fail('Pick whether you want to post work or do work.');

    $exists = $pdo->prepare('SELECT 1 FROM users WHERE email = ?');
    $exists->execute([$email]);
    if ($exists->fetchColumn()) fail('That email is already registered. Try signing in.');

    $pdo->beginTransaction();
    $pdo->prepare('INSERT INTO users (name, email, password_hash, role, headline) VALUES (?, ?, ?, ?, ?)')
        ->execute([$name, $email, password_hash($pass, PASSWORD_BCRYPT), $role,
                   $role === 'EMPLOYER' ? 'Posting work on VortexGig' : 'Open to new tasks']);
    $id = (int)$pdo->lastInsertId();
    if ((float)SIGNUP_BONUS > 0) {
        ledger($pdo, $id, 'DEPOSIT', money(SIGNUP_BONUS), 'Welcome to VortexGig');
    }
    $pdo->commit();

    $stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
    $stmt->execute([$id]);
    $user = $stmt->fetch();
    respond(['token' => make_token($user), 'user' => self_user($user)]);
}

if (route('POST', '/auth/login')) {
    $b = body();
    $stmt = $pdo->prepare('SELECT * FROM users WHERE email = ?');
    $stmt->execute([strtolower(trim((string)field($b, 'email', '')))]);
    $user = $stmt->fetch();

    if (!$user || !password_verify((string)field($b, 'password', ''), $user['password_hash'])) {
        fail('That email and password do not match.', 401);
    }
    respond(['token' => make_token($user), 'user' => self_user($user)]);
}

if (route('GET', '/auth/me')) {
    respond(self_user(require_user()));
}

if (route('PATCH', '/auth/profile')) {
    $user = require_user();
    $b    = body();
    $name = trim((string)field($b, 'name', $user['name']));
    if ($name === '') fail('Tell us what to call you.');

    $pdo->prepare('UPDATE users SET name = ?, headline = ?, bio = ?, email_updates = ?, dark_mode = ? WHERE id = ?')
        ->execute([
            $name,
            field($b, 'headline'),
            field($b, 'bio'),
            array_key_exists('emailUpdates', $b) ? (int)(bool)$b['emailUpdates'] : (int)$user['email_updates'],
            array_key_exists('darkMode', $b)     ? (int)(bool)$b['darkMode']     : (int)$user['dark_mode'],
            $user['id'],
        ]);

    $stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
    $stmt->execute([$user['id']]);
    respond(self_user($stmt->fetch()));
}

if (route('POST', '/auth/password')) {
    $user = require_user();
    $b    = body();
    if (!password_verify((string)field($b, 'currentPassword', ''), $user['password_hash'])) {
        fail('That current password is not right.');
    }
    $new = (string)field($b, 'newPassword', '');
    if (strlen($new) < 6) fail('At least 6 characters.');

    $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
        ->execute([password_hash($new, PASSWORD_BCRYPT), $user['id']]);
    respond(['message' => 'Password updated']);
}

// ===========================================================================
// Tasks
// ===========================================================================

if (route('GET', '/tasks/categories')) {
    respond($pdo->query('SELECT DISTINCT category FROM tasks ORDER BY category')->fetchAll(PDO::FETCH_COLUMN));
}

if (route('GET', '/tasks/quote')) {
    $reward = (float)($_GET['reward'] ?? 0);
    $slots  = max(1, (int)($_GET['slots'] ?? 1));
    respond(quote($pdo, $reward, $slots));
}

if (route('GET', '/tasks/mine')) {
    $user = require_role('EMPLOYER', 'Only employer accounts post tasks.');
    $stmt = $pdo->prepare(TASK_SELECT() . ' WHERE t.employer_id = ? ORDER BY t.created_at DESC');
    $stmt->execute([$user['id']]);
    respond(array_map(fn($t) => task_json($t, true), $stmt->fetchAll()));
}

if (route('GET', '/tasks')) {
    $viewer = current_user();
    $where  = [];
    $params = [];

    if (($s = trim((string)($_GET['search'] ?? ''))) !== '') {
        $where[] = '(t.title LIKE ? OR t.description LIKE ? OR t.category LIKE ?)';
        array_push($params, "%$s%", "%$s%", "%$s%");
    }
    if (($c = trim((string)($_GET['category'] ?? ''))) !== '') {
        $where[] = 't.category = ?'; $params[] = $c;
    }
    if (in_array($d = strtoupper((string)($_GET['difficulty'] ?? '')), ['STARTER','INTERMEDIATE','EXPERT'], true)) {
        $where[] = 't.difficulty = ?'; $params[] = $d;
    }
    if (in_array($st = strtoupper((string)($_GET['status'] ?? '')), ['OPEN','PAUSED','CLOSED'], true)) {
        $where[] = 't.status = ?'; $params[] = $st;
    }
    $windows = ['today' => '1 DAY', 'week' => '7 DAY', 'month' => '30 DAY'];
    if (isset($windows[$_GET['window'] ?? ''])) {
        $where[] = 't.created_at >= DATE_SUB(NOW(), INTERVAL ' . $windows[$_GET['window']] . ')';
    }

    $order = match ($_GET['sort'] ?? 'newest') {
        'reward'   => 't.reward DESC',
        'deadline' => 't.deadline IS NULL, t.deadline ASC',
        'closing'  => '(t.slots_total - t.slots_taken) ASC',
        default    => 't.created_at DESC',
    };

    $sql = TASK_SELECT() . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . " ORDER BY $order";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $tasks = $stmt->fetchAll();

    // One lookup for the viewer's own claims across the whole board, rather
    // than one query per card.
    $mine = [];
    if ($viewer && $viewer['role'] === 'WORKER' && $tasks) {
        $ids  = array_column($tasks, 'id');
        $in   = implode(',', array_fill(0, count($ids), '?'));
        $q    = $pdo->prepare("SELECT * FROM submissions WHERE worker_id = ? AND task_id IN ($in)");
        $q->execute(array_merge([$viewer['id']], $ids));
        foreach ($q->fetchAll() as $row) $mine[(int)$row['task_id']] = $row;
    }

    respond(array_map(
        fn($t) => task_json($t, $viewer && (int)$viewer['id'] === (int)$t['employer_id'], $mine[(int)$t['id']] ?? null),
        $tasks
    ));
}

if (route('POST', '/tasks')) {
    $user = require_role('EMPLOYER', 'Only employer accounts can post tasks.');
    require_active($user);
    $b = body();

    $title = trim((string)field($b, 'title', ''));
    $desc  = trim((string)field($b, 'description', ''));
    $cat   = trim((string)field($b, 'category', ''));
    $diff  = strtoupper((string)field($b, 'difficulty', 'STARTER'));
    $reward = (float)field($b, 'reward', 0);
    $slots  = (int)field($b, 'slots', 1);
    $deadline = field($b, 'deadline');

    if ($title === '')            fail('Give the task a title.');
    if (strlen($desc) < 20)       fail('Add a little more detail — at least 20 characters.');
    if ($cat === '')              fail('Pick a category.');
    if (!in_array($diff, ['STARTER','INTERMEDIATE','EXPERT'], true)) fail('Pick a difficulty.');
    if ($reward < 0.5)            fail('The reward must be at least $0.50.');
    if ($slots < 1 || $slots > 500) fail('Between 1 and 500 slots.');
    if ($deadline && strtotime($deadline) < strtotime('today')) fail('The deadline cannot be in the past.');

    $q = quote($pdo, $reward, $slots);

    $pdo->beginTransaction();
    $pdo->prepare('INSERT INTO tasks (employer_id, title, description, category, difficulty,
                                      reward, slots_total, budget, platform_fee, deadline)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([$user['id'], $title, $desc, $cat, $diff, $q['reward'], $slots,
                   $q['budget'], $q['platformFee'], $deadline ?: null]);
    $taskId = (int)$pdo->lastInsertId();
    // Throws (and rolls the task back) if the employer cannot cover budget + fee.
    fund_task($pdo, $user, $taskId, $title, $q['budget'], $q['platformFee']);
    $pdo->commit();

    $stmt = $pdo->prepare(TASK_SELECT() . ' WHERE t.id = ?');
    $stmt->execute([$taskId]);
    respond(task_json($stmt->fetch(), true), 201);
}

if (route('GET', '/tasks/{id}/submissions', $a)) {
    $user = require_role('EMPLOYER', 'Only the employer sees the submissions.');
    $own  = $pdo->prepare('SELECT employer_id FROM tasks WHERE id = ?');
    $own->execute([$a[0]]);
    $row = $own->fetch();
    if (!$row) fail('That task is not on the board.', 404);
    if ((int)$row['employer_id'] !== (int)$user['id']) fail('That task belongs to someone else.', 403);

    $stmt = $pdo->prepare(SUBMISSION_SELECT() . ' WHERE s.task_id = ? ORDER BY s.claimed_at DESC');
    $stmt->execute([$a[0]]);
    respond(array_map(fn($s) => submission_json($s, false, true), $stmt->fetchAll()));
}

if (route('POST', '/tasks/{id}/claim', $a)) {
    $user = require_user();
    if ($user['role'] !== 'WORKER') fail('Employer accounts post tasks; they do not claim them.', 403);
    require_active($user);

    $pdo->beginTransaction();
    // Row lock first: two workers racing for the last slot are serialised, so
    // the second reads the already-incremented count and is turned away.
    $stmt = $pdo->prepare('SELECT * FROM tasks WHERE id = ? FOR UPDATE');
    $stmt->execute([$a[0]]);
    $task = $stmt->fetch();
    if (!$task) { $pdo->rollBack(); fail('That task is not on the board.', 404); }

    $dupe = $pdo->prepare('SELECT 1 FROM submissions WHERE task_id = ? AND worker_id = ?');
    $dupe->execute([$task['id'], $user['id']]);
    if ($dupe->fetchColumn())                       { $pdo->rollBack(); fail('You have already claimed this one.', 409); }
    if ($task['status'] === 'CLOSED')               { $pdo->rollBack(); fail('This task has closed.', 409); }
    if ($task['status'] === 'PAUSED')               { $pdo->rollBack(); fail('The employer has paused this task for now.', 409); }
    if (task_expired($task))                        { $pdo->rollBack(); fail('This task passed its deadline.', 409); }
    if ((int)$task['slots_taken'] >= (int)$task['slots_total']) { $pdo->rollBack(); fail('Every slot on this task is taken.', 409); }

    $pdo->prepare('UPDATE tasks SET slots_taken = slots_taken + 1 WHERE id = ?')->execute([$task['id']]);
    $pdo->prepare('INSERT INTO submissions (task_id, worker_id, status, reward) VALUES (?, ?, "CLAIMED", ?)')
        ->execute([$task['id'], $user['id'], money($task['reward'])]);
    $subId = (int)$pdo->lastInsertId();
    $pdo->commit();

    $stmt = $pdo->prepare(SUBMISSION_SELECT() . ' WHERE s.id = ?');
    $stmt->execute([$subId]);
    respond(submission_json($stmt->fetch()), 201);
}

if (route('GET', '/tasks/{id}', $a)) {
    $viewer = current_user();
    $stmt = $pdo->prepare(TASK_SELECT() . ' WHERE t.id = ?');
    $stmt->execute([$a[0]]);
    $task = $stmt->fetch();
    if (!$task) fail('That task is not on the board.', 404);

    $mine = null;
    if ($viewer && $viewer['role'] === 'WORKER') {
        $q = $pdo->prepare('SELECT * FROM submissions WHERE task_id = ? AND worker_id = ?');
        $q->execute([$task['id'], $viewer['id']]);
        $mine = $q->fetch() ?: null;
    }
    respond(task_json($task, $viewer && (int)$viewer['id'] === (int)$task['employer_id'], $mine));
}

if (route('PATCH', '/tasks/{id}/status', $a)) {
    $user = require_role('EMPLOYER', 'Only employer accounts manage tasks.');
    $next = strtoupper((string)field(body(), 'status', ''));
    if (!in_array($next, ['OPEN','PAUSED','CLOSED'], true)) fail('Status must be open, paused or closed.');

    $pdo->beginTransaction();
    $stmt = $pdo->prepare('SELECT * FROM tasks WHERE id = ? FOR UPDATE');
    $stmt->execute([$a[0]]);
    $task = $stmt->fetch();
    if (!$task)                                          { $pdo->rollBack(); fail('That task is not on the board.', 404); }
    if ((int)$task['employer_id'] !== (int)$user['id'])  { $pdo->rollBack(); fail('That task belongs to someone else.', 403); }
    if ($task['status'] === 'CLOSED')                    { $pdo->rollBack(); fail('This task is already closed.'); }

    if ($next === 'CLOSED') {
        $c = $pdo->prepare("SELECT
                              SUM(status='DISPUTED') AS disputed,
                              SUM(status='PENDING')  AS pending
                            FROM submissions WHERE task_id = ?");
        $c->execute([$task['id']]);
        $counts = $c->fetch();
        // A dispute is paid out of this escrow, so it cannot be refunded yet.
        if ((int)$counts['disputed'] > 0) { $pdo->rollBack(); fail('There are disputes open on this task. A moderator has to rule first.'); }
        if ((int)$counts['pending'] > 0)  { $pdo->rollBack(); fail('There are submissions still waiting on your review. Clear the queue first.'); }
        refund_escrow($pdo, $task);
    }

    $pdo->prepare('UPDATE tasks SET status = ? WHERE id = ?')->execute([$next, $task['id']]);
    $pdo->commit();

    $stmt = $pdo->prepare(TASK_SELECT() . ' WHERE t.id = ?');
    $stmt->execute([$task['id']]);
    respond(task_json($stmt->fetch(), true));
}

require __DIR__ . '/routes_work.php';
