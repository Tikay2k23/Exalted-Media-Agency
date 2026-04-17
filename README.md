# Exalted Media Operations

Internal operations platform for a professional digital marketing agency, built with Next.js, TypeScript, Tailwind CSS, Prisma, PostgreSQL, and NextAuth.

## What This App Covers

- Role-based authentication for admins, managers, and team members
- Client account management with pipeline history
- Weekly work tracking with daily EOD updates attached to each task
- Internal task assignment for delivery teams
- Admin user management
- Personal profile settings with editable account details and profile photo upload

## Core Product Areas

- `Dashboard`: real operational metrics based on live clients, open work, workload, and activity
- `Accounts`: client ownership, service scope, status, and linked delivery work
- `Pipeline`: drag-and-drop account movement with saved history
- `Weekly Work`: week-based task review with EOD logging and search
- `Team`: workload visibility, task assignment, and account ownership snapshot
- `Settings`: personal profile updates and profile photo management

## Default Agency Users

The app synchronizes these default users:

- `Aileen Romero` / `aileen@theexaltedmedia.com` / `ADMIN`
- `Mark Angelo Yakit` / `angelo@theexaltedmedia.com` / `MANAGER`

Passwords are not exposed in the UI. Set them through environment variables before seeding or deploying:

```env
DEFAULT_ADMIN_PASSWORD="your-secure-admin-password"
DEFAULT_MANAGER_PASSWORD="your-secure-manager-password"
```

In local non-production development, the app falls back to a local-only bootstrap password if those variables are not set so initial setup stays smooth.

## Local Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Use `.env.example` as the starting point.

Important variables:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/exalted_media_agency?schema=public"
DIRECT_URL="postgresql://postgres:postgres@localhost:5432/exalted_media_agency?schema=public"
AUTH_SECRET="replace-with-a-long-random-secret"
NEXTAUTH_URL="http://localhost:3000"
DEFAULT_ADMIN_PASSWORD="replace-with-a-secure-admin-password"
DEFAULT_MANAGER_PASSWORD="replace-with-a-secure-manager-password"
```

### 3. Make sure PostgreSQL is running

The default local database name is `exalted_media_agency`.

### 4. Push the schema and synchronize seed data

```bash
npm run db:push
npm run db:seed
```

The seed is safe to rerun. It:

- synchronizes the required pipeline stages
- upserts the required default agency users
- removes the exact legacy seeded demo users and demo client records from older versions of the project

### 5. Start the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deployment Notes

Set these variables on Vercel:

```env
DATABASE_URL=...
DIRECT_URL=...
AUTH_SECRET=...
NEXTAUTH_URL=https://your-domain.vercel.app
DEFAULT_ADMIN_PASSWORD=...
DEFAULT_MANAGER_PASSWORD=...
```

Build behavior on Vercel:

- Prisma client is generated during install
- `prisma db push` runs during build
- a safe bootstrap seed runs during build to synchronize required workspace records

## Project Structure

```text
app/
  (auth)/login/page.tsx
  (dashboard)/
    dashboard/
    clients/
    pipeline/
    fulfillment/
    team/
    settings/
    admin/users/
  api/
components/
  admin/
  auth/
  clients/
  dashboard/
  fulfillment/
  layout/
  pipeline/
  settings/
  team/
  ui/
lib/
  auth.ts
  prisma.ts
  permissions.ts
  session.ts
  activity.ts
  data/queries.ts
  workspace-bootstrap.ts
  workspace-defaults.ts
  validators/
prisma/
  schema.prisma
  seed.ts
prisma.config.ts
```

## Useful Scripts

- `npm run dev` - start local development
- `npm run build` - run the production build pipeline
- `npm run start` - run the production server
- `npm run lint` - lint the codebase
- `npm run typecheck` - run TypeScript checks
- `npm run db:generate` - regenerate Prisma client
- `npm run db:push` - sync Prisma schema to PostgreSQL
- `npm run db:seed` - synchronize required workspace data
- `npm run db:studio` - open Prisma Studio
- `npm run db:bootstrap` - push schema and seed in one command

## Verification

Recommended after major changes:

```bash
npm run db:push
npm run db:seed
npm run typecheck
npm run lint
npm run build
```
