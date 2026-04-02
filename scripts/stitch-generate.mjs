import fs from "node:fs/promises";
import path from "node:path";
import { StitchToolClient } from "@google/stitch-sdk";
import {
  downloadToFile,
  loadLocalEnv,
  parseArgs,
  printUsage,
  requireStitchApiKey,
  sanitizeFileSegment,
} from "./stitch-utils.mjs";

function resolvePrompt(args) {
  if (typeof args.prompt === "string" && args.prompt.trim()) {
    return args.prompt.trim();
  }

  return args._.join(" ").trim();
}

function normalizeProjectId(value) {
  if (typeof value !== "string" || !value) {
    return undefined;
  }

  return value.startsWith("projects/") ? value.slice("projects/".length) : value;
}

function normalizeScreenId(screen) {
  if (screen?.id) {
    return screen.id;
  }

  if (typeof screen?.name === "string" && screen.name.includes("/screens/")) {
    return screen.name.split("/screens/").pop();
  }

  return undefined;
}

function extractScreenResult(rawResult, projectId) {
  const outputComponents = Array.isArray(rawResult?.outputComponents) ? rawResult.outputComponents : [];
  const screen = outputComponents.flatMap((component) => component?.design?.screens ?? [])[0];
  if (!screen) {
    throw new Error("Stitch returned no screens in outputComponents.");
  }

  return {
    projectId,
    screenId: normalizeScreenId(screen),
    prompt: screen.prompt ?? null,
    title: screen.title ?? null,
    htmlUrl: screen.htmlCode?.downloadUrl ?? null,
    imageUrl: screen.screenshot?.downloadUrl ?? null,
    suggestions: outputComponents
      .map((component) => component?.suggestion)
      .filter((value) => typeof value === "string"),
    summary: outputComponents
      .map((component) => component?.text)
      .find((value) => typeof value === "string") ?? null,
    rawResult,
  };
}

await loadLocalEnv();
requireStitchApiKey();

const args = parseArgs(process.argv.slice(2));
const prompt = resolvePrompt(args);
if (!prompt) {
  printUsage([
    "Usage:",
    '  npm run stitch:generate -- --prompt "A mobile onboarding flow"',
    '  npm run stitch:generate -- --project-id <id> --screen-id <id> --prompt "Make the hero lighter"',
  ]);
  process.exit(1);
}

const deviceType = String(args.device ?? "DESKTOP").toUpperCase();
const modelId = args.model ? String(args.model).toUpperCase() : undefined;
const outdir = path.resolve(process.cwd(), String(args.outdir ?? "output/stitch"));

const client = new StitchToolClient();

try {
  let projectId = normalizeProjectId(args["project-id"]);
  if (!projectId) {
    const projectTitle = String(args["project-title"] ?? "Yasi Frontend Lab");
    const projectResult = await client.callTool("create_project", { title: projectTitle });
    projectId = normalizeProjectId(projectResult?.name ?? projectResult?.projectId);
    if (!projectId) {
      throw new Error("Stitch create_project did not return a project ID.");
    }
  }

  let screenResult;
  if (args["screen-id"]) {
    const rawResult = await client.callTool("edit_screens", {
      projectId,
      selectedScreenIds: [String(args["screen-id"])],
      prompt,
      deviceType,
      modelId,
    });
    screenResult = extractScreenResult(rawResult, projectId);
  } else {
    const rawResult = await client.callTool("generate_screen_from_text", {
      projectId,
      prompt,
      deviceType,
      modelId,
    });
    screenResult = extractScreenResult(rawResult, projectId);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = path.join(
    outdir,
    sanitizeFileSegment(projectId),
    `${stamp}-${sanitizeFileSegment(screenResult.screenId ?? "screen")}`,
  );

  const htmlPath = path.join(runDir, "screen.html");
  const imagePath = path.join(runDir, "screen.png");
  const metadataPath = path.join(runDir, "metadata.json");
  const rawResponsePath = path.join(runDir, "raw-response.json");

  await fs.mkdir(runDir, { recursive: true });
  if (screenResult.htmlUrl) {
    await downloadToFile(screenResult.htmlUrl, htmlPath);
  }
  if (screenResult.imageUrl) {
    await downloadToFile(screenResult.imageUrl, imagePath);
  }
  await fs.writeFile(
    metadataPath,
    JSON.stringify(
      {
        prompt,
        projectId,
        screenId: screenResult.screenId,
        deviceType,
        modelId: modelId ?? null,
        title: screenResult.title,
        summary: screenResult.summary,
        suggestions: screenResult.suggestions,
        htmlUrl: screenResult.htmlUrl,
        imageUrl: screenResult.imageUrl,
        generatedAt: new Date().toISOString(),
        files: {
          html: screenResult.htmlUrl ? htmlPath : null,
          image: screenResult.imageUrl ? imagePath : null,
          rawResponse: rawResponsePath,
        },
      },
      null,
      2,
    ),
  );
  await fs.writeFile(rawResponsePath, JSON.stringify(screenResult.rawResult, null, 2));

  console.log(JSON.stringify({
    projectId,
    screenId: screenResult.screenId,
    runDir,
    htmlPath: screenResult.htmlUrl ? htmlPath : null,
    imagePath: screenResult.imageUrl ? imagePath : null,
    metadataPath,
    rawResponsePath,
    suggestions: screenResult.suggestions,
  }, null, 2));
} finally {
  await client.close();
}
