<?php
/**
 * VortexGig — configuration.
 *
 * ── EDIT THE FOUR DATABASE LINES with the values from hPanel > Databases ──
 * On Hostinger the host is almost always "localhost", and the database name
 * and user are both prefixed with your account number, e.g. u123456789_vortexgig.
 */

define('DB_HOST', 'localhost');
define('DB_NAME', 'u123456789_vortexgig');
define('DB_USER', 'u123456789_vgadmin');
define('DB_PASS', 'REPLACE_WITH_YOUR_DB_PASSWORD');

/**
 * Signing key for login tokens. CHANGE THIS before going live and keep it
 * secret — anyone who knows it can mint a token for any account, including an
 * admin. Any long random string works:
 *   php -r "echo bin2hex(random_bytes(32));"
 */
define('JWT_SECRET', 'CHANGE_ME_to_a_long_random_string_at_least_32_chars');

/** How long a login lasts, in seconds. */
define('JWT_TTL', 7 * 24 * 60 * 60);

/** Play money granted to a new account so the marketplace is usable at once. */
define('SIGNUP_BONUS', '250.00');

/**
 * Browser origins allowed to call the API. The site is same-origin in normal
 * use, so this only matters for a dev server or a different host name.
 * Use ['*'] to allow any origin.
 */
define('CORS_ORIGINS', ['*']);

function get_pdo(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4';
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            // Real prepared statements, so LIMIT/OFFSET bind as integers and
            // nothing is ever interpolated into SQL text.
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    }
    return $pdo;
}
