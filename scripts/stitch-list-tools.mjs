import { stitch } from "@google/stitch-sdk";
import { loadLocalEnv, requireStitchApiKey } from "./stitch-utils.mjs";

await loadLocalEnv();
requireStitchApiKey();

const { tools } = await stitch.listTools();
for (const tool of tools) {
  console.log(`${tool.name}\t${tool.description ?? ""}`);
}
