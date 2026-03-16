import fs from "fs";
import path from "path";

const rootDir = process.cwd();
const standaloneDir = path.join(rootDir, ".next", "standalone");
const staticDir = path.join(rootDir, ".next", "static");
const publicDir = path.join(rootDir, "public");
const outDir = path.join(rootDir, "dist-electron", "server");

if (!fs.existsSync(standaloneDir)) {
    throw new Error(`Missing Next standalone output at ${standaloneDir}. Run \`next build\` first.`);
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
// Preserve Next standalone's relative symlinks so macOS code signing
// doesn't reject bundle resources that point outside the app sandbox.
fs.cpSync(standaloneDir, outDir, { recursive: true, verbatimSymlinks: true });

for (const removablePath of [
    path.join(outDir, "dist-desktop"),
    path.join(outDir, "dist-electron"),
    path.join(outDir, ".next", "standalone"),
    path.join(outDir, ".next", "cache"),
    path.join(outDir, "coverage"),
]) {
    fs.rmSync(removablePath, { recursive: true, force: true });
}

const tracedNodeModulesDir = path.join(outDir, ".next", "node_modules");
if (fs.existsSync(tracedNodeModulesDir)) {
    for (const entry of fs.readdirSync(tracedNodeModulesDir)) {
        const symlinkPath = path.join(tracedNodeModulesDir, entry);
        const stats = fs.lstatSync(symlinkPath);

        if (!stats.isSymbolicLink()) {
            continue;
        }

        const resolvedPath = fs.realpathSync(symlinkPath);
        fs.rmSync(symlinkPath, { recursive: true, force: true });
        fs.cpSync(resolvedPath, symlinkPath, { recursive: true, verbatimSymlinks: true });
    }
}

const runtimeNodeModulesDir = path.join(outDir, "runtime_node_modules");
const topLevelNodeModulesDir = path.join(outDir, "node_modules");
if (fs.existsSync(topLevelNodeModulesDir)) {
    fs.renameSync(topLevelNodeModulesDir, runtimeNodeModulesDir);
}

const nextNativeSwcPackageDir = path.join(
    rootDir,
    "node_modules",
    "@next",
    `swc-${process.platform}-${process.arch}`,
);

if (fs.existsSync(nextNativeSwcPackageDir) && fs.existsSync(runtimeNodeModulesDir)) {
    const nextScopeDir = path.join(runtimeNodeModulesDir, "@next");
    fs.mkdirSync(nextScopeDir, { recursive: true });
    fs.cpSync(
        nextNativeSwcPackageDir,
        path.join(nextScopeDir, path.basename(nextNativeSwcPackageDir)),
        { recursive: true, verbatimSymlinks: true },
    );
}

if (fs.existsSync(runtimeNodeModulesDir)) {
    const stack = [runtimeNodeModulesDir];

    while (stack.length > 0) {
        const currentDir = stack.pop();

        for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
            const entryPath = path.join(currentDir, entry.name);

            if (entry.isDirectory()) {
                if (entry.name === ".git") {
                    fs.rmSync(entryPath, { recursive: true, force: true });
                    continue;
                }

                stack.push(entryPath);
            }
        }
    }
}

if (fs.existsSync(staticDir)) {
    fs.mkdirSync(path.join(outDir, ".next"), { recursive: true });
    fs.cpSync(staticDir, path.join(outDir, ".next", "static"), { recursive: true, verbatimSymlinks: true });
}

if (fs.existsSync(publicDir)) {
    fs.cpSync(publicDir, path.join(outDir, "public"), { recursive: true, verbatimSymlinks: true });
}

for (const envFile of [".env", ".env.local", ".env.production", ".env.production.local"]) {
    const source = path.join(rootDir, envFile);
    if (fs.existsSync(source)) {
        fs.copyFileSync(source, path.join(outDir, envFile));
    }
}

console.log(`Prepared Electron server bundle at ${outDir}`);
