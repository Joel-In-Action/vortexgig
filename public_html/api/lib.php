<?php
/**
 * VortexGig — request plumbing, auth and money.
 *
 * Deliberately dependency-free: Hostinger's shared plan has no Composer, but
 * PHP 8 ships everything needed — password_hash() for bcrypt, hash_hmac() for
 * signing tokens, and PDO for real prepared statements.
 */

require_once __DIR__ . '/config.php';

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

/** Every failure leaves as {"error": "..."} so the client has one shape to read. */
function fail(string $message, int $code = 400): void {
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode(['error' => $message]);
    exit;
}

function respond($data, int $code = 200): void {
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function body(): array {
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') return [];
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function field(array $b, string $key, $default = null) {
    return array_key_exists($key, $b) && $b[$key] !== '' ? $b[$key] : $default;
}

/** Money as a fixed 2dp string, so it round-trips through DECIMAL without drift. */
function money($value): string {
    return number_format((float)$value, 2, '.', '');
}

// ---------------------------------------------------------------------------
// Tokens — HS256 JWT, hand-rolled. No library needed for one algorithm.
// ---------------------------------------------------------------------------

function b64url(string $bin): string {
    return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
}

function b64url_decode(string $s): string {
    return base64_decode(strtr($s, '-_', '+/') . str_repeat('=', (4 - strlen($s) % 4) % 4));
}

function make_token(array $user): string {
    $header  = b64url(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    $payload = b64url(json_encode([
        'sub'  => (int)$user['id'],
        'role' => $user['role'],
        'iat'  => time(),
        'exp'  => time() + JWT_TTL,
    ]));
    $sig = b64url(hash_hmac('sha256', "$header.$payload", JWT_SECRET, true));
    return "$header.$payload.$sig";
}

/** Returns the token's claims, or null if it is missing, malformed or expired. */
function read_token(?string $token): ?array {
    if (!$token) return null;
    $parts = explode('.', $token);
    if (count($parts) !== 3) return null;

    [$header, $payload, $sig] = $parts;
    $expected = b64url(hash_hmac('sha256', "$header.$payload", JWT_SECRET, true));
    // Constant-time compare, so a wrong signature cannot be found byte by byte.
    if (!hash_equals($expected, $sig)) return null;

    $claims = json_decode(b64url_decode($payload), true);
    if (!is_array($claims) || ($claims['exp'] ?? 0) < time()) return null;
    return $claims;
}

function bearer_token(): ?string {
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $auth = $headers['Authorization'] ?? $headers['authorization']
        ?? $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    return preg_match('/^Bearer\s+(.+)$/i', trim($auth), $m) ? $m[1] : null;
}

// ---------------------------------------------------------------------------
// Who is calling
// ---------------------------------------------------------------------------

/** The signed-in user, or null when the request is anonymous. */
function current_user(): ?array {
    static $cached = false;
    static $user = null;
    if ($cached) return $user;
    $cached = true;

    $claims = read_token(bearer_token());
    if (!$claims) return $user = null;

    $stmt = get_pdo()->prepare('SELECT * FROM users WHERE id = ?');
    $stmt->execute([$claims['sub']]);
    $found = $stmt->fetch();
    return $user = ($found ?: null);
}

function require_user(): array {
    $user = current_user();
    if (!$user) fail('Please sign in.', 401);
    return $user;
}

function require_role(string $role, string $message): array {
    $user = require_user();
    if ($user['role'] !== $role) fail($message, 403);
    return $user;
}

/** Suspended accounts keep read access; this gates everything that acts. */
function require_active(array $user): void {
    if ($user['status'] !== 'ACTIVE') {
        fail('Your account is suspended. Reach out to support to sort it out.', 403);
    }
}

// ---------------------------------------------------------------------------
// Money — the only place balances change.
//
// Each helper mutates a balance on `users` and writes the matching ledger row.
// Callers wrap them in a transaction so the money and the thing that caused it
// commit or roll back together.
// ---------------------------------------------------------------------------

/**
 * Applies a signed amount to a user's available balance and appends the ledger
 * row explaining it. The row stores the resulting balance, so activity feeds
 * never have to recompute history.
 */
function ledger(PDO $pdo, int $userId, string $type, string $amount,
                string $description, ?int $taskId = null, ?int $submissionId = null): void {
    $pdo->prepare('UPDATE users SET available = available + ? WHERE id = ?')
        ->execute([money($amount), $userId]);

    $stmt = $pdo->prepare('SELECT available FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    $balance = $stmt->fetchColumn();

    $pdo->prepare('INSERT INTO wallet_transactions
                     (user_id, type, amount, balance_after, description, task_id, submission_id)
                   VALUES (?, ?, ?, ?, ?, ?, ?)')
        ->execute([$userId, $type, money($amount), money($balance), $description, $taskId, $submissionId]);
}

/** Funds a freshly created task: budget into escrow, fee off the top. */
function fund_task(PDO $pdo, array $employer, int $taskId, string $title,
                   string $budget, string $fee): void {
    $total = money((float)$budget + (float)$fee);
    if ((float)$employer['available'] < (float)$total) {
        $short = money((float)$total - (float)$employer['available']);
        fail("That is \${$short} more than your balance. Add funds in Settings and try again.");
    }

    ledger($pdo, (int)$employer['id'], 'ESCROW_HOLD', money(-(float)$budget),
           "Escrow for \"{$title}\"", $taskId);

    if ((float)$fee > 0) {
        ledger($pdo, (int)$employer['id'], 'PLATFORM_FEE', money(-(float)$fee),
               "Service fee for \"{$title}\"", $taskId);
        // The fee is earned the moment the task is published, so unlike escrow
        // it is spent for good and never refunded.
        $pdo->prepare('UPDATE users SET total_spent = total_spent + ? WHERE id = ?')
            ->execute([money($fee), $employer['id']]);
    }

    $pdo->prepare('UPDATE tasks SET escrow = ? WHERE id = ?')->execute([money($budget), $taskId]);
}

/** Proof is in: the payout is earmarked for the worker but still in escrow. */
function hold_pending(PDO $pdo, int $workerId, string $reward): void {
    $pdo->prepare('UPDATE users SET pending = pending + ? WHERE id = ?')
        ->execute([money($reward), $workerId]);
}

/** Rejected or ruled against: the earmark goes, the escrow stays with the task. */
function release_pending(PDO $pdo, int $workerId, string $reward): void {
    $pdo->prepare('UPDATE users SET pending = GREATEST(0, pending - ?) WHERE id = ?')
        ->execute([money($reward), $workerId]);
}

/** Approved: escrow becomes the worker's money. */
function pay_out(PDO $pdo, array $submission, array $task): void {
    $reward = money($submission['reward']);

    $pdo->prepare('UPDATE users SET pending = GREATEST(0, pending - ?), lifetime_earned = lifetime_earned + ? WHERE id = ?')
        ->execute([$reward, $reward, $submission['worker_id']]);

    ledger($pdo, (int)$submission['worker_id'], 'PAYOUT', $reward,
           "Approved: \"{$task['title']}\"", (int)$task['id'], (int)$submission['id']);

    $pdo->prepare('UPDATE tasks SET escrow = GREATEST(0, escrow - ?) WHERE id = ?')
        ->execute([$reward, $task['id']]);
    $pdo->prepare('UPDATE users SET total_spent = total_spent + ? WHERE id = ?')
        ->execute([$reward, $task['employer_id']]);
}

/** Closing a task hands back whatever was never paid out. */
function refund_escrow(PDO $pdo, array $task): void {
    $remaining = money($task['escrow']);
    if ((float)$remaining <= 0) return;

    $pdo->prepare('UPDATE tasks SET escrow = 0 WHERE id = ?')->execute([$task['id']]);
    ledger($pdo, (int)$task['employer_id'], 'ESCROW_REFUND', $remaining,
           "Unused escrow returned from \"{$task['title']}\"", (int)$task['id']);
}

function settings(PDO $pdo): array {
    $row = $pdo->query('SELECT * FROM platform_settings WHERE id = 1')->fetch();
    return $row ?: ['fee_percent' => '5.00', 'reward_pool_percent' => '20.00'];
}

/** What an employer is charged for a given reward and slot count. */
function quote(PDO $pdo, float $reward, int $slots): array {
    $feePercent = (float)settings($pdo)['fee_percent'];
    $budget = round($reward * $slots, 2);
    $fee    = round($budget * $feePercent / 100, 2);
    return [
        'reward'      => money($reward),
        'budget'      => money($budget),
        'platformFee' => money($fee),
        'total'       => money($budget + $fee),
        'feePercent'  => money($feePercent),
    ];
}
