-- ============================================================================
-- VortexGig — remove the seeded demo data, keep real accounts
-- ----------------------------------------------------------------------------
-- Run in phpMyAdmin (SQL tab) once the site has real users and you want the
-- demo marketplace gone.
--
-- Deleting the demo users is enough on its own: every foreign key into `users`
-- is ON DELETE CASCADE, so their tasks, submissions and ledger rows go with
-- them. A real worker's submission against a demo task is removed too — the
-- task no longer exists, so the submission cannot survive it.
--
-- This does NOT touch accounts you or your visitors created.
-- ============================================================================

DELETE FROM users WHERE email IN (
  'admin@vortexgig.com',
  'maya@vortexgig.com',
  'priya@vortexgig.com',
  'sam@vortexgig.com',
  'lena@vortexgig.com',
  'ravi@vortexgig.com',
  'nora@vortexgig.com',
  'ines@vortexgig.com'
);

-- Reward-pool cycles are not owned by any user, so clear them separately.
DELETE FROM reward_pool_distributions;

-- Leave platform_settings alone — it holds your live fee configuration.

-- What is left afterwards:
SELECT 'users'       AS table_name, COUNT(*) AS remaining FROM users
UNION ALL SELECT 'tasks',       COUNT(*) FROM tasks
UNION ALL SELECT 'submissions', COUNT(*) FROM submissions
UNION ALL SELECT 'ledger rows', COUNT(*) FROM wallet_transactions;
