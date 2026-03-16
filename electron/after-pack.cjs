const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

function collectSignableFiles(rootDir, output = []) {
    if (!fs.existsSync(rootDir)) {
        return output;
    }

    for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
        const entryPath = path.join(rootDir, entry.name);

        if (entry.isDirectory()) {
            collectSignableFiles(entryPath, output);
            continue;
        }

        if (
            entry.name.endsWith(".dylib")
            || entry.name.endsWith(".node")
            || entry.name === "ffmpeg"
            || entry.name === "whisper-cli"
        ) {
            output.push(entryPath);
        }
    }

    return output;
}

exports.default = async function afterPack(context) {
    if (context.electronPlatformName !== "darwin") {
        return;
    }

    const resourcesDir = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, "Contents", "Resources");
    const serverRoot = path.join(resourcesDir, "server");
    const signTargets = collectSignableFiles(path.join(serverRoot, "runtime_node_modules"));

    for (const target of signTargets) {
        execFileSync("codesign", [
            "--force",
            "--sign",
            "-",
            "--timestamp=none",
            target,
        ]);
    }
};
