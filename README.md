This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Supabase Migrations

Use the repo scripts instead of hand-running ad hoc SQL when you change cloud schema.

Create a new migration file with a unique timestamp prefix:

```bash
npm run supabase:migration:new -- your_change_name
```

Check whether there are any cloud-managed migrations still not applied to the linked Supabase project:

```bash
npm run supabase:migrations:check
```

Push pending cloud-managed migrations to Supabase:

```bash
npm run supabase:migrations:push
```

Notes:

- The push/check script reads the linked project ref from `supabase/.temp/project-ref`.
- Authentication prefers `SUPABASE_ACCESS_TOKEN`; on macOS it can also reuse the local Supabase CLI token from Keychain.
- CI should expose the same token as the repository secret `SUPABASE_ACCESS_TOKEN`.
- Historical date-only migrations are frozen in `supabase/migrations/.cloud-baseline.json`.
- New migrations should always use the generated unique timestamp format to avoid duplicate-version drift.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
