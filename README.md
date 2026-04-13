# Agency Hub MVP

A production-ready MVP for a digital marketing agency operations platform built with Next.js, TypeScript, Tailwind CSS, Prisma, PostgreSQL, NextAuth, and Recharts.

## Why This Architecture

- Next.js App Router gives us server-rendered dashboards, protected layouts, and a clean API surface in one codebase.
- Prisma + PostgreSQL fit the relational nature of users, clients, pipeline stages, fulfillment tracking, internal tasking, and activity logs.
- NextAuth credentials auth is the fastest secure MVP path for role-based internal team access.
- Tailwind + reusable `components/ui/*` primitives keep the UI consistent and easy to extend.
- Recharts handles the dashboard analytics cleanly without overcomplicating the frontend.
- `dnd-kit` gives us a lightweight drag-and-drop pipeline board with persisted stage history.

## Roles

- `Admin`: manage users, clients, pipelines, weekly task tracking, internal work allocation, and reporting
- `Manager`: manage clients, pipeline movement, weekly task tracking, employee tasking, and team activity
- `Team Member`: view assigned clients, update client status, track posting progress, and manage assigned internal tasks

## Core Features

- Secure login with role-aware routing and UI access
- Dashboard with client counts, pipeline overview, fulfillment metrics, activity feed, department load, and team utilization
- Client management with search, filters, assignment, service type, notes, and detail pages
- Drag-and-drop pipeline board with persistent stage history
- Social media fulfillment tracking with planned vs completed posts and per-platform summaries
- Internal employee task assignment with agency briefs, task categories, estimated hours, due dates, and live status updates
- Weekly task tracker with week/date/client filters, search, and parent-task EOD history
- Daily EOD logging directly on weekly tasks with audit-friendly update history per assignee
- Admin user management for creating users and updating roles, departments, job titles, weekly capacity, and activation status
- Seeded demo data for fast local testing

## Agency Operations Features

- Department-aware workforce planning for content, paid media, SEO, analytics, design, email, operations, and account management
- Capacity planning with weekly hour limits and booked-hour utilization tracking
- Marketing task categories for recurring agency work such as client reporting, creative production, content calendars, SEO audits, and analytics review
- Weekly accountability with searchable daily EOD reporting attached to each task
- Team snapshots that show who owns which clients, what their role is, and how much work is currently booked
- Department load monitoring so managers can rebalance work before teams get overloaded

## Tech Stack

- Next.js 16
- TypeScript
- Tailwind CSS 4
- Prisma ORM 7
- PostgreSQL
- NextAuth
- Recharts
- `dnd-kit`

## Project Structure

```text
app/
  (auth)/login/page.tsx
  (dashboard)/
    layout.tsx
    dashboard/page.tsx
    clients/
    pipeline/
    fulfillment/
    team/
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
  team/
  ui/
lib/
  auth.ts
  prisma.ts
  permissions.ts
  session.ts
  activity.ts
  data/queries.ts
  validators/
prisma/
  schema.prisma
  seed.ts
prisma.config.ts
```

## Database Design

Main entities:

- `User`
- `Client`
- `PipelineStage`
- `ClientStageHistory`
- `SocialMediaTask`
- `EmployeeTask`
- `EmployeeTaskEodEntry`
- `ActivityLog`
- NextAuth support tables: `Account`, `Session`, `VerificationToken`

Key relationships:

- A `User` can own many `Client` records
- A `Client` belongs to one current `PipelineStage`
- A `Client` has many `ClientStageHistory` entries
- A `Client` has many `SocialMediaTask` entries
- A `User` can be assigned many internal `EmployeeTask` records
- An `EmployeeTask` can optionally link back to a `Client`
- An `EmployeeTask` can have many `EmployeeTaskEodEntry` records for daily reporting
- `ActivityLog` records user actions across clients, pipeline moves, tasks, and admin changes

Agency-specific attributes:

- `User.department`
- `User.jobTitle`
- `User.weeklyCapacityHours`
- `EmployeeTask.category`
- `EmployeeTask.estimatedHours`
- `EmployeeTask.weekStartDate`
- `EmployeeTaskEodEntry.entryDate`
- `EmployeeTaskEodEntry.summary`
- `EmployeeTaskEodEntry.blockers`
- `EmployeeTaskEodEntry.nextSteps`

## Local Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Review environment variables

`.env` and `.env.example` use this default local connection:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/exalted_media_agency?schema=public"
AUTH_SECRET="development-secret-change-me"
NEXTAUTH_URL="http://localhost:3000"
```

### 3. Make sure PostgreSQL is running

The local database name used by default is `exalted_media_agency`.

### 4. Push schema and seed data

```bash
npm run db:push
npm run db:seed
```

### 5. Start the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Seeded Demo Accounts

- `admin@exaltedagency.com` / `Agency123!`
- `manager@exaltedagency.com` / `Agency123!`
- `sarah@exaltedagency.com` / `Agency123!`
- `devon@exaltedagency.com` / `Agency123!`

Seeded employee profiles include digital-marketing-specific departments, job titles, weekly capacity hours, sample internal agency tasks, and example daily EOD history for the weekly tracker.

## Available Scripts

- `npm run dev` - start local dev server
- `npm run build` - production build
- `npm run start` - run production server
- `npm run lint` - lint the codebase
- `npm run typecheck` - run TypeScript checks
- `npm run db:generate` - regenerate Prisma client
- `npm run db:push` - sync Prisma schema to PostgreSQL
- `npm run db:seed` - seed demo data
- `npm run db:studio` - open Prisma Studio

## Notes

- Prisma 7 is configured with `@prisma/adapter-pg`, which is the supported PostgreSQL runtime path for this setup.
- The app is intentionally dynamic on protected routes so dashboard data is always current.
- The MVP uses credentials auth for speed and control; OAuth can be added later without reworking the data model.

## Verification

Completed locally:

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run db:push`
- `npm run db:seed`
