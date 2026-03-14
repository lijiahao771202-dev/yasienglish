import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingIncludes: {
    "/api/ai/transcribe": [
      "./node_modules/@lumen-labs-dev/whisper-node/**/*",
      "./node_modules/ffmpeg-static/**/*",
    ],
    "/api/ai/score": [
      "./node_modules/@lumen-labs-dev/whisper-node/**/*",
      "./node_modules/ffmpeg-static/**/*",
    ],
  },
};

export default nextConfig;
