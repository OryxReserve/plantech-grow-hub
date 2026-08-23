# Plantech Garden Hub

We are starting Phase 0 of the Plantech project and we must use PLAN first before any BUILD.

Project context:
- Product: Plantech, a mobile-first PWA for plant identification, plant care, garden management, diagnosis support, and shared product cabinet management.
- Frontend: React/TypeScript
- Backend: Supabase + Edge Functions
- AI Gateway: LogoriOn
- Multi-tenant from day one: all business data must belong to `account_id`, never to a loose `user_id`
- Product languages from the beginning: Portuguese, English, Spanish
- All code, SQL, table names, column names, enums, functions, files, components, and technical artifacts must be in English only
- Greg app is only a flow reference, never a visual copy

Critical execution rules:
- Do NOT generate BUILD output now
- Do NOT generate final SQL yet
- First inspect and explain the current database/backend state clearly
- If information is missing or unclear, say so explicitly instead of guessing
- We want to avoid common Lovable issues: orphan tables, incomplete CRUD, disconnected features, fake buttons, and database structures that are not actually used

Your task in this PLAN response:
1. Inspect the current Supabase/database/backend structure of the project
2. List all existing tables, views, enums, functions, triggers, policies, storage buckets, and auth-related structures already present
3. Identify which existing structures appear relevant vs irrelevant to Plantech
4. Flag anything that looks generic, unused, duplicate, disconnected, or risky
5. Tell us whether the project already has a safe multi-tenant foundation or not
6. Tell us whether the project already has any user profile / account membership structure or not
7. Tell us whether the project already has admin bootstrap logic or not
8. Tell us whether the project already has RLS enabled and whether the existing policies appear correct or incomplete
9. Tell us whether there are empty tables, suspicious tables, or tables that likely exist without actual app usage
10. Recommend the minimum clean Phase 0 schema we should create next, but only as a PLAN recommendation, not as SQL yet

Target Phase 0 foundation we expect to move toward:
- `accounts`
- `profiles`
- `account_members`
- `plants`
- `plant_photos`
- `plant_care_log`
- `products`
- `ai_usage_log`

Important modeling expectations:
- `profiles` should represent user-level profile data linked 1:1 with `auth.users`
- `account_members` should represent the relationship between users and accounts, including role and membership status
- All multi-tenant RLS should derive from the relationship between `auth.uid()` and `account_members.account_id`
- Initial roles should stay simple: `owner`, `admin`, `member`
- Admin bootstrap must not rely on frontend-only logic
- Initial admin email for bootstrap planning: `br61982407140@gmail.com`
- `ai_usage_log.summarized_payload` must remain minimal structured JSON only, never base64 images or sensitive persistent URLs
- We prefer a lean v1 foundation, not an overbuilt schema

Output format:
- Section 1: Current backend/database findings
- Section 2: Risks and inconsistencies found
- Section 3: What is missing for a correct Phase 0 foundation
- Section 4: Recommended minimal schema direction for next step
- Section 5: Questions or uncertainties that still require clarification before BUILD

Do not produce SQL migration code yet. This is PLAN only.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://plantech-grow-hub.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/62c5244f-2ae1-45d4-a61f-b6f9ec380d1b).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
