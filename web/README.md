# PrintShop — Business Management System

A role-based web application for a Philippine printing shop (sublimation jersey + cut & sew production), built with **Next.js 14 (App Router)**, **Tailwind CSS + shadcn-style UI**, and **Supabase** (PostgreSQL, Auth, Storage, Row Level Security).

## Features

| Module | Admin | Employee |
| --- | --- | --- |
| Dashboard | Sales, profit, expenses, low stock | Open tasks, latest pay, time clock |
| Orders | Full CRUD, assign to employees | View assigned, advance status |
| Inventory | Full CRUD | Read-only |
| Employees | Add / edit / role / salary config | View own profile |
| Attendance | View all logs | Time in / Time out |
| Salary | Process payroll, mark paid | View earnings |
| Expenses | Full CRUD | — |
| Reports | Sales, profit, BIR Non-VAT 3% | — |

Security is enforced **on the database** via Supabase Row Level Security policies — the frontend role gates are a UX layer only.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → New project.
2. In the SQL Editor, paste and run [`supabase/schema.sql`](supabase/schema.sql).  
   This creates all tables, the `is_admin()` helper, RLS policies, the auto-profile trigger, and seeds inventory.

### 3. Environment variables

Copy `.env.local.example` → `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>   # required for Admin → Add Employee (server-side auth.admin.createUser)
```

Find these in **Supabase → Project Settings → API**.

### 4. Create the first admin

Sign up via `/register` — the trigger creates a profile with role `employee`. Promote yourself in the SQL editor:

```sql
update public.profiles set role = 'admin', full_name = 'Owner' where email = 'you@example.com';
```

### 5. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll be redirected to `/login`, then to `/admin` or `/employee` based on your role.

## Architecture

```
app/
  login/                public auth page
  register/             public auth page
  admin/                admin-only routes (gated by middleware + RLS)
    dashboard, orders, inventory, employees, attendance, salary, expenses, reports
  employee/             employee routes (gated by middleware + RLS)
    dashboard, orders, attendance, salary, profile
components/
  sidebar.tsx           role-aware navigation
  ui/                   shadcn-style primitives (button, card, dialog, badge, ...)
lib/
  supabase/{client,server}.ts   typed clients for browser & server
  utils.ts              cn(), peso(), formatDate()
middleware.ts           redirects unauthenticated users; enforces /admin role
supabase/schema.sql     full DB schema + RLS policies + seed data
```

### Role-based access — three layers

1. **Middleware** (`middleware.ts`) redirects users away from routes they shouldn't reach.
2. **Server components** call `requireRole("admin")` / `getSessionUser()` and `redirect()` if unauthorized.
3. **Row Level Security** (PostgreSQL) is the authoritative gate — every table has policies keyed off the `is_admin()` SQL helper or `auth.uid() = user_id`. Even if a client bypasses (1) and (2), RLS prevents reads/writes they aren't entitled to.

### Order status flow (employee-facing)

`pending → printing → sewing → ready` (admin can also set `delivered` or `cancelled`).

## Tech stack

- **Next.js 14** App Router, React Server Components
- **Tailwind CSS 3** + custom CSS variables for light/dark themes
- **shadcn-style** UI primitives (no shadcn CLI needed — included as plain components)
- **`next-themes`** for dark mode
- **Supabase JS** + `@supabase/ssr` for cookie-based session sync
- **lucide-react** icons

## Notes for production

- Set `SUPABASE_SERVICE_ROLE_KEY` only in server env (never expose to client).
- Enable email confirmations in Supabase Auth before going live.
- Consider Supabase Storage buckets for design files (the `orders.design_ref` field is currently a free-text reference).
- Add a CRON to roll forward salary periods automatically.
