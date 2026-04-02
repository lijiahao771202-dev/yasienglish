import { stitch } from "@google/stitch-sdk";
import { loadLocalEnv, requireStitchApiKey } from "./stitch-utils.mjs";

await loadLocalEnv();
requireStitchApiKey();

const projects = await stitch.projects();
for (const project of projects) {
  let screenCount = "unknown";
  try {
    const screens = await project.screens();
    screenCount = String(screens.length);
  } catch (error) {
    screenCount = `error: ${error instanceof Error ? error.message : String(error)}`;
  }

  console.log(`${project.projectId}\t${screenCount}`);
}
