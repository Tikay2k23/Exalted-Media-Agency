# Database environments

Four databases, and one rule: **name the environment in the command.** Nothing
here relies on remembering which variable happens to be set.

| Environment | Database | Used by | Port |
| --- | --- | --- | --- |
| Development | `exalted_media_agency` | `npm run dev`, manual work | 3000 |
| Test | `exalted_test` | `npm test` — creates and deletes fixtures | — |
| Staging/UAT | `exalted_uat` | Human UAT, authenticated testers | 3100 |
| Production | Vercel-managed | Real client operations | — |

Automated tests must never run against UAT or production: the suites open by
deleting fixtures, so a misdirected run destroys data before the first
assertion. `tests/setup/assert-test-database.mjs` refuses to start in that case.

## The rule that bites

`prisma.config.ts` resolves its connection from the first of these that has a
value:

```
DIRECT_URL → PRISMA_DATABASE_URL → POSTGRES_URL_NON_POOLING
           → POSTGRES_PRISMA_URL → DATABASE_URL → POSTGRES_URL
```

`DATABASE_URL` is fifth. Every script also runs `import "dotenv/config"`, and
dotenv fills in any variable that is merely *unset* — it does not overwrite one
you set. So this does **not** do what it looks like:

```bash
DATABASE_URL="…/exalted_uat" npx prisma migrate deploy
```

`DIRECT_URL` is still unset, dotenv supplies it from `.env` pointing at
development, and it outranks the variable you set. On 2026-08-31 that migrated
development, printed *No pending migrations*, and left the UAT database empty
with nothing to indicate anything was wrong.

**Set every connection variable, or use the commands below, which do.**

## Commands

### Development

```bash
npm run dev
npx prisma migrate dev --name <change>
npm run db:seed
```

Reads `.env` / `.env.local` / `.env.development.local` as Next.js resolves them.

### Test

```bash
npm test
npm run test:migrate
npm run test:seed
```

`npm test` loads `.env.test` when present and aborts if the resolved database is
UAT, staging, production, or a name nobody has classified. Without `.env.test`
it falls back to development and says so.

### Staging / UAT

```bash
npm run uat:identity
npm run uat:migrate
npm run uat:seed
npm run uat:verify
npm run uat:dev
```

Every one loads `.env.uat`, refuses to run when the connection variables
disagree, and refuses any database whose name is not UAT. Run `uat:identity`
first when in doubt — it asks the server `current_database()` rather than
trusting the string that was configured.

Standing one up from nothing:

```bash
npm run uat:identity && npm run uat:migrate && npm run uat:seed && npm run uat:verify
```

### Production

Migrations run through the deployment pipeline (`scripts/vercel-build.mjs`), not
by hand. `scripts/uat.mjs`, `scripts/seed-environment.ts` and the test guard all
refuse to run when `NODE_ENV=production` or `VERCEL_ENV` is set. There is no
command here that seeds or resets production, on purpose.

## Environment files

`.env.uat` and `.env.test` are git-ignored and do not arrive with a clone —
`.env.example` carries their shape. Each sets **every** connection variable to
the same database. No password, secret or connection string is committed.

## Adding an environment

Add it to `ENVIRONMENTS` in `scripts/db-identity.mjs`. Anything unclassified is
treated as unsafe rather than assumed harmless, so a new database is refused by
the test guard until it is named there.
