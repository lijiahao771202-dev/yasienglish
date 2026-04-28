import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: [
    "@andresaya/edge-tts",
    "sherpa-onnx-node",
    "ws",
    "bufferutil",
    "utf-8-validate",
  ],
  outputFileTracingIncludes: {
    "/api/ai/transcribe": [
      "./node_modules/sherpa-onnx-node/**/*",
      "./node_modules/sherpa-onnx-darwin-arm64/**/*",
      "./node_modules/sherpa-onnx-darwin-x64/**/*",
      "./node_modules/sherpa-onnx-win-x64/**/*",
    ],
  },
  async rewrites() {
    return [
      {
        source: '/models/:modelId/resolve/main/:path*',
        destination: '/models/:modelId/:path*',
      },
    ];
  },
};

export default nextConfig;
