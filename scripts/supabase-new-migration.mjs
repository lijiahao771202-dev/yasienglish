import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT_DIR = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT_DIR, "supabase", "migrations");

function sanitizeName(input) {
    return input
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .replace(/_+/g, "_");
}

function buildTimestamp(date = new Date()) {
    const pad = (value) => String(value).padStart(2, "0");
    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate()),
        pad(date.getHours()),
        pad(date.getMinutes()),
        pad(date.getSeconds()),
    ].join("");
}

async function main() {
    const rawName = process.argv.slice(2).join(" ");
    const name = sanitizeName(rawName);

    if (!name) {
        throw new Error("Usage: npm run supabase:migration:new -- your_change_name");
    }

    const filename = `${buildTimestamp()}_${name}.sql`;
    const targetPath = path.join(MIGRATIONS_DIR, filename);
    const template = "-- Write your migration here.\n";

    await fs.writeFile(targetPath, template, { flag: "wx" });
    console.log(path.relative(ROOT_DIR, targetPath));
}

await main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
