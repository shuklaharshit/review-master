# 0005 — Persist with better-sqlite3 directly, not Drizzle at runtime

**Status:** Accepted

## Context
We need local relational storage. Drizzle ORM is in the dependency list and is fine for schema typing, but adds a runtime/migration layer.

## Decision
Use **better-sqlite3 directly** with hand-written prepared statements behind the repository interfaces in `src/main/db/types.ts`. Schema is applied from `schema.ts` (`CREATE TABLE IF NOT EXISTS`), versioned via `PRAGMA user_version`. Repositories are synchronous.

## Consequences
- Simple, fast, no migration-runtime surprises; full control over SQL.
- The `Database`/repository interfaces are the contract — implementations could be swapped (incl. to Drizzle) without touching services.
- Schema changes are manual; add real migrations here if/when the schema churns.
