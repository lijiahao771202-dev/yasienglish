import fs from "node:fs/promises";
import path from "node:path";

const SCRIPT_LOADED_KEYS = new Set();

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const equalsIndex = trimmed.indexOf("=");
  if (equalsIndex === -1) {
    return null;
  }

  const key = trimmed.slice(0, equalsIndex).trim();
  let value = trimmed.slice(equalsIndex + 1).trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  value = value.replace(/\\n/g, "\n");
  return { key, value };
}

export async function loadLocalEnv(cwd = process.cwd()) {
  for (const envFile of [".env", ".env.local"]) {
    const envPath = path.join(cwd, envFile);
    try {
      const raw = await fs.readFile(envPath, "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const parsed = parseEnvLine(line);
        if (!parsed) {
          continue;
        }

        const { key, value } = parsed;
        if (process.env[key] === undefined || SCRIPT_LOADED_KEYS.has(key)) {
          process.env[key] = value;
          SCRIPT_LOADED_KEYS.add(key);
        }
      }
    } catch (error) {
      if (error && error.code === "ENOENT") {
        continue;
      }

      throw error;
    }
  }
}

export function requireStitchApiKey() {
  const apiKey = process.env.STITCH_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing STITCH_API_KEY. Add it to .env.local or export it in your shell.",
    );
  }

  return apiKey;
}

export function parseArgs(argv) {
  const args = { _: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      args._.push(token);
      continue;
    }

    const body = token.slice(2);
    const equalsIndex = body.indexOf("=");
    if (equalsIndex !== -1) {
      const key = body.slice(0, equalsIndex);
      args[key] = body.slice(equalsIndex + 1);
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[body] = next;
      index += 1;
      continue;
    }

    args[body] = true;
  }

  return args;
}

export function sanitizeFileSegment(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "untitled";
}

export async function downloadToFile(url, filePath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, Buffer.from(arrayBuffer));
}

export function printUsage(lines) {
  console.error(lines.join("\n"));
}
