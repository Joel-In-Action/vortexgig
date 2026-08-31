-- ============================================================================
-- VortexGig — drop the previous schema before re-importing schema.sql
-- ----------------------------------------------------------------------------
-- ONLY run this if you are reusing an existing database that already has tables
-- in it. IT DESTROYS DATA AND CANNOT BE UNDONE. Export the database from
-- phpMyAdmin first.
--
-- Why this is needed: schema.sql uses CREATE TABLE IF NOT EXISTS, so if tables
-- named `tasks` or `submissions` already exist — from the earlier build, whose
-- columns are completely different — the import SILENTLY SKIPS them. You end up
-- with the old incompatible tables and an API that fails on every query.
--
-- Safer alternative: create a brand new database in hPanel, import schema.sql
-- into that, and point api/config.php at it. The old database stays untouched
-- as a rollback.
-- ============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- Tables from the previous VortexGig build
DROP TABLE IF EXISTS activities;
DROP TABLE IF EXISTS leaderboard;

-- Tables shared by name between the two builds, with different columns
DROP TABLE IF EXISTS submissions;
DROP TABLE IF EXISTS tasks;

-- Tables from this build
DROP TABLE IF EXISTS wallet_transactions;
DROP TABLE IF EXISTS reward_pool_distributions;
DROP TABLE IF EXISTS platform_settings;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

-- Now import schema.sql.
