<?php
/**
 * Row -> JSON shapes. These match the React client exactly, so the frontend
 * needs no changes beyond branding.
 */

require_once __DIR__ . '/lib.php';

/** "Maya Chen" -> "MC". Drives the avatar chips. */
function initials(?string $name): string {
    $name = trim((string)$name);
    if ($name === '') return '?';
    $parts = preg_split('/\s+/', $name);
    if (count($parts) === 1) return strtoupper(mb_substr($parts[0], 0, 1));
    return strtoupper(mb_substr($parts[0], 0, 1) . mb_substr(end($parts), 0, 1));
}

/** The safe, outward-facing view of someone else: no email, no balances. */
function public_user(array $u): array {
    return [
        'id'          => (int)$u['id'],
        'name'        => $u['name'],
        'initials'    => initials($u['name']),
        'headline'    => $u['headline'],
        'role'        => $u['role'],
        'memberSince' => $u['created_at'],
    ];
}

/** The signed-in user's own account, balances included. */
function self_user(array $u): array {
    return [
        'id'             => (int)$u['id'],
        'name'           => $u['name'],
        'email'          => $u['email'],
        'initials'       => initials($u['name']),
        'role'           => $u['role'],
        'status'         => $u['status'],
        'headline'       => $u['headline'],
        'bio'            => $u['bio'],
        'available'      => money($u['available']),
        'pending'        => money($u['pending']),
        'lifetimeEarned' => money($u['lifetime_earned']),
        'totalSpent'     => money($u['total_spent']),
        'emailUpdates'   => (bool)$u['email_updates'],
        'darkMode'       => (bool)$u['dark_mode'],
        'memberSince'    => $u['created_at'],
    ];
}

/**
 * Accepts either a task row (`deadline`) or a submission row joined to its task
 * (`task_deadline`), because both are checked for expiry.
 */
function task_expired(array $t): bool {
    $deadline = $t['deadline'] ?? $t['task_deadline'] ?? null;
    return $deadline !== null && strtotime($deadline . ' 23:59:59') < time();
}

function task_claimable(array $t): bool {
    return $t['status'] === 'OPEN'
        && (int)$t['slots_taken'] < (int)$t['slots_total']
        && !task_expired($t);
}

/**
 * A task as the board and detail page show it. The money the employer put up
 * is filled in only for the employer who owns it; other viewers get nulls.
 */
function task_json(array $t, bool $isOwner, ?array $mine = null): array {
    return [
        'id'             => (int)$t['id'],
        'title'          => $t['title'],
        'description'    => $t['description'],
        'category'       => $t['category'],
        'difficulty'     => $t['difficulty'],
        'reward'         => money($t['reward']),
        'currency'       => 'USD',
        'slotsTotal'     => (int)$t['slots_total'],
        'slotsTaken'     => (int)$t['slots_taken'],
        'slotsFilled'    => (int)$t['slots_filled'],
        'slotsRemaining' => max(0, (int)$t['slots_total'] - (int)$t['slots_taken']),
        'deadline'       => $t['deadline'],
        'status'         => $t['status'],
        'claimable'      => task_claimable($t),
        'expired'        => task_expired($t),
        'createdAt'      => $t['created_at'],
        'employer'       => public_user([
            'id'         => $t['employer_id'],
            'name'       => $t['employer_name'] ?? '',
            'headline'   => $t['employer_headline'] ?? null,
            'role'       => 'EMPLOYER',
            'created_at' => $t['employer_created_at'] ?? $t['created_at'],
        ]),
        'budget'       => $isOwner ? money($t['budget']) : null,
        'platformFee'  => $isOwner ? money($t['platform_fee']) : null,
        'escrow'       => $isOwner ? money($t['escrow']) : null,
        'mySubmission' => $mine ? submission_json($mine, false, false) : null,
    ];
}

/** Enough of a task to render it inside a submission row. */
function task_summary(array $s): array {
    return [
        'id'           => (int)$s['task_id'],
        'title'        => $s['task_title'] ?? '',
        'category'     => $s['task_category'] ?? '',
        'difficulty'   => $s['task_difficulty'] ?? 'STARTER',
        'reward'       => money($s['reward']),
        'currency'     => 'USD',
        'deadline'     => $s['task_deadline'] ?? null,
        'status'       => $s['task_status'] ?? 'OPEN',
        'employerName' => $s['employer_name'] ?? '',
    ];
}

function submission_json(array $s, bool $withTask = true, bool $withWorker = false): array {
    return [
        'id'            => (int)$s['id'],
        'status'        => $s['status'],
        'reward'        => money($s['reward']),
        'currency'      => 'USD',
        'proofText'     => $s['proof_text'],
        'proofUrl'      => $s['proof_url'],
        'feedback'      => $s['feedback'],
        'claimedAt'     => $s['claimed_at'],
        'submittedAt'   => $s['submitted_at'],
        'reviewedAt'    => $s['reviewed_at'],
        'disputeReason' => $s['dispute_reason'] ?? null,
        'disputedBy'    => $s['disputed_by'] ?? null,
        'disputedAt'    => $s['disputed_at'] ?? null,
        'resolution'    => $s['resolution'] ?? null,
        'resolvedAt'    => $s['resolved_at'] ?? null,
        'task'          => $withTask ? task_summary($s) : null,
        'worker'        => $withWorker ? public_user([
            'id'         => $s['worker_id'],
            'name'       => $s['worker_name'] ?? '',
            'headline'   => $s['worker_headline'] ?? null,
            'role'       => 'WORKER',
            'created_at' => $s['worker_created_at'] ?? $s['claimed_at'],
        ]) : null,
    ];
}

function tx_json(array $t): array {
    return [
        'id'           => (int)$t['id'],
        'type'         => $t['type'],
        'amount'       => money($t['amount']),
        'balanceAfter' => money($t['balance_after']),
        'currency'     => 'USD',
        'txHash'       => null,
        'description'  => $t['description'],
        'taskId'       => $t['task_id'] === null ? null : (int)$t['task_id'],
        'submissionId' => $t['submission_id'] === null ? null : (int)$t['submission_id'],
        'createdAt'    => $t['created_at'],
    ];
}

/**
 * Worker progression, derived from work done rather than stored, so it can
 * never drift: 10 XP per approved task plus 1 per dollar earned.
 */
function xp_for(int $completed, float $earned): int {
    return $completed * 10 + (int)floor($earned);
}

function tier_for(int $xp): string {
    if ($xp >= 1200) return 'Elite';
    if ($xp >= 400)  return 'Pro';
    if ($xp >= 100)  return 'Contributor';
    return 'Starter';
}

/** SQL fragment selecting task + employer columns the serializers expect. */
function TASK_SELECT(): string {
    return 'SELECT t.*, u.name AS employer_name, u.headline AS employer_headline,
                   u.created_at AS employer_created_at
            FROM tasks t JOIN users u ON u.id = t.employer_id';
}

/** SQL fragment selecting submission + task + worker columns. */
function SUBMISSION_SELECT(): string {
    return 'SELECT s.*, t.title AS task_title, t.category AS task_category,
                   t.difficulty AS task_difficulty, t.deadline AS task_deadline,
                   t.status AS task_status, t.employer_id,
                   e.name AS employer_name,
                   w.name AS worker_name, w.headline AS worker_headline,
                   w.created_at AS worker_created_at
            FROM submissions s
            JOIN tasks t ON t.id = s.task_id
            JOIN users e ON e.id = t.employer_id
            JOIN users w ON w.id = s.worker_id';
}
