import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT_DIR = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT_DIR, "supabase", "migrations");
const BASELINE_PATH = path.join(MIGRATIONS_DIR, ".cloud-baseline.json");
const PROJECT_REF_PATH = path.join(ROOT_DIR, "supabase", ".temp", "project-ref");

function parseArgs(argv) {
    return {
        apply: argv.includes("--apply"),
        check: argv.includes("--check") || !argv.includes("--apply"),
        verbose: argv.includes("--verbose"),
    };
}

function decodeKeyringValue(raw) {
    const value = raw.trim();
    if (!value.startsWith("go-keyring-base64:")) {
        return value;
    }

    return Buffer.from(value.slice("go-keyring-base64:".length), "base64").toString("utf8").trim();
}

function getSupabaseAccessToken() {
    const fromEnv = process.env.SUPABASE_ACCESS_TOKEN?.trim();
    if (fromEnv) {
        return fromEnv;
    }

    try {
        const raw = execFileSync(
            "security",
            ["find-generic-password", "-s", "Supabase CLI", "-a", "supabase", "-w"],
            { encoding: "utf8" },
        );
        return decodeKeyringValue(raw);
    } catch {
        throw new Error("Missing SUPABASE_ACCESS_TOKEN and could not read the Supabase CLI token from macOS keychain.");
    }
}

async function getProjectRef() {
    const fromEnv = process.env.SUPABASE_PROJECT_REF?.trim();
    if (fromEnv) {
        return fromEnv;
    }

    const fromFile = (await fs.readFile(PROJECT_REF_PATH, "utf8")).trim();
    if (!fromFile) {
        throw new Error("Could not determine Supabase project ref.");
    }

    return fromFile;
}

async function loadBaseline() {
    const raw = await fs.readFile(BASELINE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.migrations)) {
        throw new Error(`${BASELINE_PATH} is missing a "migrations" array.`);
    }

    return new Set(parsed.migrations.map((value) => String(value)));
}

function parseMigrationFilename(filename) {
    const stem = filename.replace(/\.sql$/i, "");
    const match = stem.match(/^(\d+)_([a-z0-9_]+)$/i);
    if (!match) {
        throw new Error(`Invalid migration filename: ${filename}`);
    }

    return {
        filename,
        stem,
        version: match[1],
        name: match[2],
    };
}

async function loadLocalMigrations() {
    const entries = await fs.readdir(MIGRATIONS_DIR, { withFileTypes: true });
    return entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
        .map((entry) => parseMigrationFilename(entry.name))
        .sort((left, right) => left.filename.localeCompare(right.filename));
}

function assertUniqueVersions(migrations) {
    const duplicates = new Map();
    for (const migration of migrations) {
        const current = duplicates.get(migration.version) ?? [];
        current.push(migration.filename);
        duplicates.set(migration.version, current);
    }

    const conflicts = Array.from(duplicates.entries()).filter(([, filenames]) => filenames.length > 1);
    if (conflicts.length === 0) {
        return;
    }

    const detail = conflicts
        .map(([version, filenames]) => `${version}: ${filenames.join(", ")}`)
        .join("\n");
    throw new Error(
        `New cloud-managed migrations must use unique numeric prefixes.\nDuplicate versions found:\n${detail}\nUse \`npm run supabase:migration:new -- your_change_name\` for future files.`,
    );
}

async function runDatabaseQuery(projectRef, token, query) {
    const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Supabase database query failed (${response.status}): ${body}`);
    }

    return response.json();
}

async function loadRemoteMigrations(projectRef, token) {
    const rows = await runDatabaseQuery(
        projectRef,
        token,
        `
            select version, name
            from supabase_migrations.schema_migrations
            order by version asc, name asc nulls last;
        `,
    );

    return Array.isArray(rows)
        ? rows.map((row) => ({
            version: String(row.version ?? ""),
            name: row.name == null ? null : String(row.name),
        }))
        : [];
}

async function applyMigration(projectRef, token, migration) {
    const filePath = path.join(MIGRATIONS_DIR, migration.filename);
    const sql = await fs.readFile(filePath, "utf8");
    if (!sql.trim()) {
        throw new Error(`Migration ${migration.filename} is empty.`);
    }

    await runDatabaseQuery(projectRef, token, sql);
    await runDatabaseQuery(
        projectRef,
        token,
        `
            insert into supabase_migrations.schema_migrations (version, name)
            select '${migration.version}', '${migration.name}'
            where not exists (
              select 1
              from supabase_migrations.schema_migrations
              where version = '${migration.version}'
                and coalesce(name, '') = '${migration.name}'
            );
        `,
    );
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const token = getSupabaseAccessToken();
    const projectRef = await getProjectRef();
    const baseline = await loadBaseline();
    const localMigrations = await loadLocalMigrations();

    const legacyMigrations = localMigrations.filter((migration) => baseline.has(migration.stem));
    const managedMigrations = localMigrations.filter((migration) => !baseline.has(migration.stem));

    assertUniqueVersions(managedMigrations);

    const remoteMigrations = await loadRemoteMigrations(projectRef, token);
    const remoteKeys = new Set(
        remoteMigrations.map((migration) => `${migration.version}:${migration.name ?? ""}`),
    );

    const pending = managedMigrations.filter((migration) => !remoteKeys.has(`${migration.version}:${migration.name}`));

    console.log(`Supabase project: ${projectRef}`);
    console.log(`Legacy baseline migrations: ${legacyMigrations.length}`);
    console.log(`Cloud-managed migrations: ${managedMigrations.length}`);
    console.log(`Pending cloud migrations: ${pending.length}`);

    if (args.verbose && pending.length > 0) {
        for (const migration of pending) {
            console.log(`- ${migration.filename}`);
        }
    }

    if (args.check && !args.apply) {
        if (pending.length > 0) {
            process.exitCode = 1;
        }
        return;
    }

    for (const migration of pending) {
        console.log(`Applying ${migration.filename}`);
        await applyMigration(projectRef, token, migration);
    }

    console.log(pending.length > 0 ? "Cloud migrations applied." : "No pending cloud migrations.");
}

await main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
