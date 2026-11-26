# PostgreSQL backup and recovery

The live database is PostgreSQL. SQLite backup is for local development only.

- Run on a trusted workstation with a PostgreSQL client compatible with the server.
- Set `MTUNZ_BACKUP_DATABASE_URL` privately to a direct (non-pooled) Neon connection with TLS; prefer `sslmode=verify-full`. Never paste the URL into Git, logs, or command arguments.
- Run `python backup.py backups`. A successful run creates a private directory containing a custom-format dump and a SHA-256 manifest. Archive metadata excludes the connection string. Database contents include private messages and attachment bytes; encrypt and store backups outside the repository and provider.
- The dump omits owner and grant restoration. Configure required roles and privileges separately before any recovery.
- Check the SHA-256 hash and archive listing before restoring. Restore only to a new isolated empty database initially, using `pg_restore --exit-on-error --no-owner --no-privileges --dbname <isolated-database>` with the dump path and securely supplied connection settings. Never point a drill at production. Verify application readiness, accounts, messages, attachments and access control.
- CI performs an isolated backup/restore exercise with synthetic records on a disposable PostgreSQL service. It does not copy or modify Neon production.
- Actual backup schedule, encrypted external storage, retention and production recovery drills require separate configuration. Creating this utility does not mean production backups are already running.
