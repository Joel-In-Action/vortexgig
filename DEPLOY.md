# Deploying VortexGig to Hostinger

Works on **Shared / Business hosting** — PHP 8 + MySQL, no root, no Composer,
no Node on the server. The React app is pre-built to static files; the API is
plain PHP using only what ships with the platform.

Budget about 15 minutes.

---

## 1. Create the database

hPanel → **Databases → MySQL Databases**

1. Create a database (e.g. `vortexgig`) and a user, and give the user
   **All Privileges** on it.
2. Copy the four values Hostinger shows you — they are prefixed with your
   account number, e.g. `u123456789_vortexgig`:

   | | |
   |---|---|
   | Database | `u123456789_vortexgig` |
   | Username | `u123456789_vgadmin` |
   | Password | *the one you just set* |
   | Host | `localhost` |

## 2. Import the schema

hPanel → **Databases → phpMyAdmin** → your database → **Import** →
choose `database/schema.sql` → **Go**.

You should end up with six tables: `users`, `tasks`, `submissions`,
`wallet_transactions`, `platform_settings`, `reward_pool_distributions`.

## 3. Configure the API

Open `public_html/api/config.php` and edit the top of the file:

```php
define('DB_NAME', 'u123456789_vortexgig');   // from step 1
define('DB_USER', 'u123456789_vgadmin');
define('DB_PASS', 'your-database-password');

define('JWT_SECRET', 'paste-a-long-random-string-here');
```

**`JWT_SECRET` is not optional.** It signs login tokens — anyone who knows it
can mint a token for any account, including an admin. Generate one and paste it:

```
php -r "echo bin2hex(random_bytes(32));"
```

or use any 64-character random string.

## 4. Upload

hPanel → **Files → File Manager** → open `public_html`.

Upload **the contents of** this repo's `public_html/` — not the folder itself:

```
public_html/
├── index.html
├── favicon.svg
├── robots.txt
├── .htaccess
├── assets/
│   ├── index-*.js
│   └── index-*.css
└── api/
    ├── .htaccess
    ├── config.php     ← the one you edited
    ├── index.php
    ├── lib.php
    ├── serialize.php
    ├── routes_work.php
    └── routes_admin.php
```

The File Manager hides dotfiles by default — turn on **Show hidden files**, or
the two `.htaccess` files will be missed and nothing will route.

## 5. Check it

Visit `https://your-domain.com/api/healthz`. You want:

```json
{"status":"ok","service":"vortexgig"}
```

If you get a database error, re-check step 3. If you get a 404, the `.htaccess`
files did not upload.

## 6. Seed the demo data (optional)

Only if you want the site to open with a populated marketplace.

1. Upload `database/seed.php` into `public_html/` (not into `api/`).
2. Edit `SEED_KEY` inside it to any value.
3. Visit `https://your-domain.com/seed.php?key=YOUR_KEY`.
4. **Delete `seed.php` from the server.** It creates accounts, including an admin.

Seeded logins, password `vortex123`:

| Role | Email |
|---|---|
| Admin | `admin@vortexgig.com` |
| Employer | `maya@vortexgig.com` |
| Worker | `sam@vortexgig.com` |

Change those passwords, or delete the accounts, before real users arrive.

Skipping this step is fine — register the first account through the site and it
works exactly the same, just with an empty board.

## 7. HTTPS

hPanel → **Security → SSL** → install the free certificate for your domain, then
turn on **Force HTTPS**. Passwords are posted to this site, so do not skip it.

---

## Rebuilding the frontend

Only needed if you change the React source.

```bash
cd frontend
npm install
npm run build
cp -r dist/* ../public_html/
```

Then re-upload `index.html` and `assets/`. Asset filenames are content-hashed,
so delete the old ones to avoid accumulating dead files.

## Going live properly

Before you point real users at this:

- [ ] `JWT_SECRET` changed from the placeholder
- [ ] Force HTTPS enabled
- [ ] `seed.php` deleted from the server
- [ ] Demo account passwords changed, or the accounts deleted
- [ ] An admin account you control exists (promote one in phpMyAdmin:
      `UPDATE users SET role='ADMIN' WHERE email='you@example.com';`)

## Notes on what this is

The money is play money. Balances, escrow and payouts are real inside the
database and fully double-entry against the `wallet_transactions` ledger, but
nothing connects to a payment processor — `POST /api/wallet/deposit` simply
credits the balance. Wiring a real processor means replacing that one endpoint.
