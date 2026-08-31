<?php
/**
 * VortexGig — demo data seeder.
 *
 * Run ONCE after importing schema.sql, by visiting:
 *     https://your-domain.com/api/../seed.php?key=YOUR_SEED_KEY
 * or, better, from hPanel's terminal:  php seed.php
 *
 * DELETE THIS FILE once you have run it. It creates accounts.
 *
 * Everything goes through the same helpers the live API uses, so seeded
 * balances, escrow and ledger rows are produced by exactly the code paths a
 * real user hits and cannot drift from them.
 */

// Works whether this file sits next to public_html (as in the repo) or inside
// it (as DEPLOY.md instructs for Hostinger).
$candidates = [
    __DIR__ . '/api/lib.php',                 // seed.php inside public_html
    __DIR__ . '/../public_html/api/lib.php',  // seed.php in the repo's database/
    __DIR__ . '/../html/api/lib.php',         // seed.php beside a docroot named html
];
$lib = null;
foreach ($candidates as $candidate) {
    if (is_file($candidate)) { $lib = $candidate; break; }
}
if ($lib === null) {
    exit("Could not find api/lib.php. Put seed.php inside public_html and run it again.\n");
}
require_once $lib;

// Only runs from the command line, or with the key below in the URL.
define('SEED_KEY', 'change-me-before-running');
if (PHP_SAPI !== 'cli' && ($_GET['key'] ?? '') !== SEED_KEY) {
    http_response_code(403);
    exit("Set SEED_KEY in seed.php and pass ?key=... to run this.\n");
}

$pdo = get_pdo();
$out = fn($m) => print(PHP_SAPI === 'cli' ? "$m\n" : "$m<br>\n");

if ((int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn() > 0) {
    $out('Database already has accounts — skipping seed.');
    exit;
}

const PASSWORD = 'vortex123';

function make_user(PDO $pdo, string $name, string $email, string $role, string $headline, float $funds = 0): int {
    $pdo->prepare('INSERT INTO users (name, email, password_hash, role, headline) VALUES (?, ?, ?, ?, ?)')
        ->execute([$name, $email, password_hash(PASSWORD, PASSWORD_BCRYPT), $role, $headline]);
    $id = (int)$pdo->lastInsertId();
    ledger($pdo, $id, 'DEPOSIT', money(SIGNUP_BONUS), 'Welcome to VortexGig');
    if ($funds > 0) ledger($pdo, $id, 'DEPOSIT', money($funds), 'Starting employer balance');
    return $id;
}

function make_task(PDO $pdo, int $employerId, string $title, string $desc, string $cat,
                   string $diff, float $reward, int $slots, int $dueDays, int $agoDays): int {
    $q = quote($pdo, $reward, $slots);
    $pdo->prepare('INSERT INTO tasks (employer_id, title, description, category, difficulty, reward,
                                      slots_total, budget, platform_fee, deadline, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(CURDATE(), INTERVAL ? DAY),
                           DATE_SUB(NOW(), INTERVAL ? DAY))')
        ->execute([$employerId, $title, $desc, $cat, $diff, $q['reward'], $slots,
                   $q['budget'], $q['platformFee'], $dueDays, $agoDays]);
    $id = (int)$pdo->lastInsertId();

    $stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
    $stmt->execute([$employerId]);
    fund_task($pdo, $stmt->fetch(), $id, $title, $q['budget'], $q['platformFee']);
    return $id;
}

/** Claim -> proof -> verdict, with the review pushed into the past. */
function run_task(PDO $pdo, int $workerId, int $taskId, string $proof, string $verdict,
                  int $agoDays = 0, string $note = ''): void {
    $t = $pdo->prepare('SELECT * FROM tasks WHERE id = ?');
    $t->execute([$taskId]);
    $task = $t->fetch();

    $pdo->prepare('INSERT INTO submissions (task_id, worker_id, status, reward, proof_text, submitted_at)
                   VALUES (?, ?, "PENDING", ?, ?, DATE_SUB(NOW(), INTERVAL ? DAY))')
        ->execute([$taskId, $workerId, money($task['reward']), $proof, $agoDays]);
    $subId = (int)$pdo->lastInsertId();
    $pdo->prepare('UPDATE tasks SET slots_taken = slots_taken + 1 WHERE id = ?')->execute([$taskId]);
    hold_pending($pdo, $workerId, money($task['reward']));

    if ($verdict === 'PENDING') return;

    $s = $pdo->prepare('SELECT * FROM submissions WHERE id = ?');
    $s->execute([$subId]);
    $sub = $s->fetch();

    if ($verdict === 'APPROVED') {
        $pdo->prepare('UPDATE submissions SET status = "APPROVED", feedback = ?, reviewed_at = DATE_SUB(NOW(), INTERVAL ? DAY) WHERE id = ?')
            ->execute([$note ?: 'Exactly what we needed — thank you.', $agoDays, $subId]);
        pay_out($pdo, $sub, $task);
        $pdo->prepare('UPDATE tasks SET slots_filled = slots_filled + 1 WHERE id = ?')->execute([$taskId]);
    } elseif ($verdict === 'REJECTED') {
        $pdo->prepare('UPDATE submissions SET status = "REJECTED", feedback = ?, reviewed_at = DATE_SUB(NOW(), INTERVAL ? DAY) WHERE id = ?')
            ->execute([$note, $agoDays, $subId]);
        release_pending($pdo, $workerId, money($task['reward']));
        $pdo->prepare('UPDATE tasks SET slots_taken = GREATEST(0, slots_taken - 1) WHERE id = ?')->execute([$taskId]);
    } elseif ($verdict === 'DISPUTED') {
        $pdo->prepare('UPDATE submissions SET status = "DISPUTED", disputed_by = "WORKER", dispute_reason = ?, disputed_at = NOW() WHERE id = ?')
            ->execute([$note, $subId]);
    }
}

$pdo->beginTransaction();

// Admin accounts are provisioned, never self-served through /auth/register.
$pdo->prepare('INSERT INTO users (name, email, password_hash, role, headline) VALUES (?, ?, ?, "ADMIN", ?)')
    ->execute(['Ada Whitfield', 'admin@vortexgig.com', password_hash(PASSWORD, PASSWORD_BCRYPT), 'Keeping VortexGig fair']);

$maya  = make_user($pdo, 'Maya Chen',   'maya@vortexgig.com',  'EMPLOYER', 'Building a plant care app', 1500);
$priya = make_user($pdo, 'Priya Raman', 'priya@vortexgig.com', 'EMPLOYER', 'Ops lead at a small marketplace', 1500);

$sam  = make_user($pdo, 'Sam Okafor',  'sam@vortexgig.com',  'WORKER', 'Detail work, fast turnarounds');
$lena = make_user($pdo, 'Lena Torres', 'lena@vortexgig.com', 'WORKER', 'Words, research, and tidy spreadsheets');
$ravi = make_user($pdo, 'Ravi Shah',   'ravi@vortexgig.com', 'WORKER', 'QA by day, curious by night');
$nora = make_user($pdo, 'Nora Beck',   'nora@vortexgig.com', 'WORKER', 'Transcription and audio clean-up');
$ines = make_user($pdo, 'Ines Duarte', 'ines@vortexgig.com', 'WORKER', 'Design systems and icon work');

$list = make_task($pdo, $maya, 'Clean up a product list',
    "Our catalogue export has about 200 rows with inconsistent capitalisation, stray whitespace and a few duplicated SKUs. Normalise the names to title case, trim the whitespace, and flag anything that looks like a duplicate in a new column. Done means: no leading or trailing spaces, consistent casing, and every suspected duplicate flagged.",
    'Data', 'STARTER', 4.50, 5, 21, 22);

$brief = make_task($pdo, $maya, 'Create a brief for a landing page',
    "We need a one-page brief for a plant care app landing page: who it is for, the three things it should say, the tone we are going for, and a suggested section order. Around 400 words. Done means: a brief a designer could start from without asking a follow-up question.",
    'Writing', 'INTERMEDIATE', 18.00, 2, 30, 4);

$mobile = make_task($pdo, $maya, 'Test the signup flow on mobile',
    "Walk through signup on a real phone — both iOS Safari and Android Chrome if you have them. Note anything that feels slow, confusing or broken, with a screenshot for each issue. Done means: a numbered list of what you hit, with device and browser noted.",
    'Testing', 'STARTER', 6.00, 4, 10, 9);

$news = make_task($pdo, $maya, 'Find 25 plant-care newsletters',
    "Build a list of 25 active newsletters about houseplants or indoor gardening. For each: name, link, rough subscriber count if it is public, and one line on who reads it. Skip anything that has not published in six months. Done means: 25 rows, all links working.",
    'Research', 'STARTER', 9.00, 3, 14, 14);

$icons = make_task($pdo, $maya, 'Design three app icon options',
    "Three distinct app icon directions for a plant care app, delivered at 1024x1024 with a short note on the thinking behind each. Warm and friendly, not clinical. Done means: three PNGs plus the source file, and none of them are a literal leaf on a circle.",
    'Design', 'EXPERT', 45.00, 1, 25, 18);

$tickets = make_task($pdo, $priya, 'Tag 300 support tickets by topic',
    "We have 300 anonymised support tickets that need a topic tag each, from a fixed list of eight. Where a ticket spans two topics, pick the one the customer led with. Done means: every row tagged, and a short note on any that did not fit the list.",
    'Data', 'STARTER', 12.00, 4, 18, 13);

$descs = make_task($pdo, $priya, 'Write 10 short product descriptions',
    "Ten products, 60 to 80 words each, written to be scanned rather than read. No superlatives, no \"revolutionary\". We will send the spec sheet and photos. Done means: ten descriptions a shopper could act on.",
    'Writing', 'INTERMEDIATE', 22.00, 2, 20, 8);

$audio = make_task($pdo, $priya, 'Transcribe a 20-minute interview',
    "One 20-minute recorded interview, two speakers, clear audio. We need a clean verbatim transcript with speaker labels and timestamps every couple of minutes. Done means: a transcript we could paste into an article with light editing.",
    'Audio', 'STARTER', 14.00, 2, 12, 6);

$safari = make_task($pdo, $priya, 'Reproduce a checkout bug on Safari',
    "A handful of customers report the checkout button doing nothing on desktop Safari. We cannot reproduce it. Try to, and if you can, tell us exactly how — versions, steps, and whatever the console says. Done means: either reliable repro steps, or a clear account of what you tried and ruled out.",
    'Development', 'INTERMEDIATE', 30.00, 2, 9, 2);

$social = make_task($pdo, $priya, 'Draft 5 social posts for launch week',
    "Five short posts for launch week, each standing on its own, no thread. One should be about why we built the thing. Done means: five posts we could schedule as written.",
    'Marketing', 'INTERMEDIATE', 16.00, 3, 16, 5);

// A marketplace mid-flight: work paid, work waiting, one rejection, one dispute.
run_task($pdo, $sam,  $list,   'Cleaned all 214 rows, title-cased the names and flagged 6 likely duplicates in column H.', 'APPROVED', 19);
run_task($pdo, $lena, $list,   'Done — normalised casing, trimmed whitespace, and left a note on three SKUs that look intentional.', 'APPROVED', 17);
run_task($pdo, $ravi, $list,   'Finished the sheet. Flagged 5 duplicates and highlighted the ambiguous ones rather than deleting them.', 'PENDING');
run_task($pdo, $nora, $mobile, 'Eight issues across iOS 17 Safari and Pixel Chrome, screenshots attached for each.', 'APPROVED', 8);
run_task($pdo, $sam,  $news,   '25 newsletters, all publishing within the last two months, subscriber counts where public.', 'APPROVED', 12);
run_task($pdo, $ines, $icons,  'Three directions: a potted sprout, an abstract water drop, and a hand-drawn frond. Sources included.', 'APPROVED', 15);
run_task($pdo, $ines, $tickets,'All 300 tagged. Twelve did not fit the list cleanly — noted at the bottom.', 'APPROVED', 11);
run_task($pdo, $lena, $tickets,'Tagged everything. I split the billing bucket in two in my notes; happy to merge if you would rather.', 'PENDING');
run_task($pdo, $ravi, $descs,  'First drafts for all ten.', 'REJECTED', 6,
         'These read as feature lists rather than descriptions, and three are over 100 words. Worth another pass with the spec sheet open.');
run_task($pdo, $nora, $audio,  'Clean verbatim with speaker labels and timestamps every two minutes.', 'APPROVED', 5);
run_task($pdo, $sam,  $safari, 'Reproduced it on Safari 17.4 with a content blocker enabled. Steps and console output in the doc.', 'PENDING');
run_task($pdo, $ines, $social, 'Five posts, one on why we built it. Kept them all under 200 characters.', 'APPROVED', 3);
run_task($pdo, $ravi, $safari, 'Recorded the repro twice on video before submitting, with the console open.', 'DISPUTED', 0,
         'This has been sitting in review for over a week with no answer, and I have a recording of the repro. Asking for a ruling.');

// One claim with no proof yet.
$pdo->prepare('INSERT INTO submissions (task_id, worker_id, status, reward) VALUES (?, ?, "CLAIMED", ?)')
    ->execute([$brief, $lena, money(18.00)]);
$pdo->prepare('UPDATE tasks SET slots_taken = slots_taken + 1 WHERE id = ?')->execute([$brief]);

$pdo->commit();

$out('Seeded VortexGig demo data.');
$out('Sign in with password: ' . PASSWORD);
$out('  admin@vortexgig.com   (admin)');
$out('  maya@vortexgig.com    (employer)');
$out('  sam@vortexgig.com     (worker)');
$out('');
$out('NOW DELETE database/seed.php FROM THE SERVER.');
