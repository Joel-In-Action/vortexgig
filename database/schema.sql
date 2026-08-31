-- ============================================================================
-- VortexGig — full database schema (MySQL 8 / MariaDB 10.4+)
-- ----------------------------------------------------------------------------
-- Import once via hPanel > Databases > phpMyAdmin > Import.
--
-- This is the whole source of truth for the schema. Money is DECIMAL(12,2)
-- everywhere and there is no floating point anywhere in the payment path.
--
-- Tables are ordered so every foreign-key target exists before its referrer,
-- and everything is IF NOT EXISTS, so re-importing is safe.
-- ============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------------
-- Users — a real account, with a real password hash.
--
-- An account is an EMPLOYER (posts work), a WORKER (does it) or an ADMIN.
-- The wallet lives here as four running totals, each moved only by the payment
-- helpers in api/wallet.php, inside the same transaction as the event that
-- caused it:
--   available       spendable now
--   pending         a worker's payout held in escrow while proof is reviewed
--   lifetime_earned every payout ever approved (never decreases)
--   total_spent     every payout + fee an employer has actually paid
-- wallet_transactions below is the append-only ledger explaining each change.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(120)  NOT NULL,
  email           VARCHAR(180)  NOT NULL,
  password_hash   VARCHAR(255)  NOT NULL,
  role            ENUM('EMPLOYER','WORKER','ADMIN') NOT NULL,
  status          ENUM('ACTIVE','SUSPENDED')        NOT NULL DEFAULT 'ACTIVE',
  headline        VARCHAR(160)  NULL,
  bio             TEXT          NULL,
  available       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  pending         DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  lifetime_earned DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total_spent     DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  email_updates   TINYINT(1)    NOT NULL DEFAULT 1,
  dark_mode       TINYINT(1)    NOT NULL DEFAULT 0,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Tasks — a brief an employer publishes, paying `reward` per accepted slot.
--
-- Two slot counters, deliberately:
--   slots_taken   reserved by a live claim (CLAIMED + PENDING + APPROVED).
--                 This gates claiming, so two workers cannot both take the last
--                 slot, and it drops back when a submission is rejected.
--   slots_filled  approved-and-paid only. Drives the progress bar and the
--                 auto-close once it reaches slots_total.
--
-- `escrow` is money still held against this task: funded with `budget` at
-- publish, drawn down by each approval, refunded to the employer on close.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  employer_id  INT           NOT NULL,
  title        VARCHAR(160)  NOT NULL,
  description  TEXT          NOT NULL,
  category     VARCHAR(60)   NOT NULL,
  difficulty   ENUM('STARTER','INTERMEDIATE','EXPERT') NOT NULL DEFAULT 'STARTER',
  reward       DECIMAL(12,2) NOT NULL,
  slots_total  INT           NOT NULL DEFAULT 1,
  slots_taken  INT           NOT NULL DEFAULT 0,
  slots_filled INT           NOT NULL DEFAULT 0,
  budget       DECIMAL(12,2) NOT NULL,
  platform_fee DECIMAL(12,2) NOT NULL,
  escrow       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  deadline     DATE          NULL,
  status       ENUM('OPEN','PAUSED','CLOSED') NOT NULL DEFAULT 'OPEN',
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_tasks_employer FOREIGN KEY (employer_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_tasks_employer (employer_id),
  KEY idx_tasks_status (status),
  KEY idx_tasks_category (category),
  KEY idx_tasks_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Submissions — one worker's run at one task, and the unit of payment.
--
-- Lifecycle: CLAIMED -> PENDING -> APPROVED | REJECTED, with DISPUTED as an
-- escalation from PENDING (or from REJECTED, contested by the worker).
--
-- `reward` is snapshotted at claim time, so editing a task later never changes
-- what an in-flight worker was promised. The unique key is both "one shot per
-- task per worker" and the backstop against a double-click double-claim.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS submissions (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  task_id        INT           NOT NULL,
  worker_id      INT           NOT NULL,
  status         ENUM('CLAIMED','PENDING','APPROVED','REJECTED','DISPUTED') NOT NULL DEFAULT 'CLAIMED',
  reward         DECIMAL(12,2) NOT NULL,
  proof_text     TEXT          NULL,
  proof_url      VARCHAR(500)  NULL,
  feedback       TEXT          NULL,
  dispute_reason TEXT          NULL,
  disputed_by    ENUM('EMPLOYER','WORKER') NULL,
  disputed_at    DATETIME      NULL,
  resolution     TEXT          NULL,
  resolved_at    DATETIME      NULL,
  claimed_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at   DATETIME      NULL,
  reviewed_at    DATETIME      NULL,
  CONSTRAINT fk_sub_task   FOREIGN KEY (task_id)   REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_sub_worker FOREIGN KEY (worker_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_sub_task_worker (task_id, worker_id),
  KEY idx_sub_worker (worker_id),
  KEY idx_sub_status (status),
  KEY idx_sub_reviewed (reviewed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Wallet transactions — append-only ledger. Every balance change on `users`
-- writes exactly one row here, recording the balance that resulted, so the
-- activity feeds are a straight read and any balance can be audited after the
-- fact. Rows are never updated or deleted.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT           NOT NULL,
  type          ENUM('DEPOSIT','WITHDRAWAL','ESCROW_HOLD','ESCROW_REFUND','PLATFORM_FEE','PAYOUT','BONUS') NOT NULL,
  amount        DECIMAL(12,2) NOT NULL,
  balance_after DECIMAL(12,2) NOT NULL,
  description   VARCHAR(255)  NOT NULL,
  task_id       INT           NULL,
  submission_id INT           NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tx_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_tx_user (user_id, created_at),
  KEY idx_tx_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Platform settings — one row, edited from the admin control centre.
-- The fee lives here rather than in code because an admin changes it at
-- runtime; tasks snapshot the fee they were charged, so a change only affects
-- tasks published afterwards.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_settings (
  id                  TINYINT      NOT NULL PRIMARY KEY DEFAULT 1,
  fee_percent         DECIMAL(5,2) NOT NULL DEFAULT 5.00,
  reward_pool_percent DECIMAL(5,2) NOT NULL DEFAULT 20.00,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT ck_settings_single CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO platform_settings (id) VALUES (1)
  ON DUPLICATE KEY UPDATE id = id;

-- ---------------------------------------------------------------------------
-- Reward pool distributions — one row per payout cycle. The live pool is a
-- share of fees collected since the newest row's period_end, which is what
-- stops the same fee revenue being paid out twice.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reward_pool_distributions (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  period_start DATETIME      NOT NULL,
  period_end   DATETIME      NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL,
  recipients   INT           NOT NULL,
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
