import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StitchProxy } from "@google/stitch-sdk";
import { loadLocalEnv, requireStitchApiKey } from "./stitch-utils.mjs";

await loadLocalEnv();
const apiKey = requireStitchApiKey();

const proxy = new StitchProxy({
  apiKey,
  name: "yasi-stitch-proxy",
  version: "0.1.0",
});

const transport = new StdioServerTransport();

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    await proxy.close();
    process.exit(0);
  });
}

await proxy.start(transport);
