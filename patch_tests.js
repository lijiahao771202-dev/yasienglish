import fs from 'fs';

let content = fs.readFileSync('src/hooks/useListeningCabinPlayer.test.tsx', 'utf8');

// The initialization check to replace
const targetStr = `        if (!latestAudio || !latestPlayer) {
            throw new Error("Player did not initialize");
        }`;

const replacementForAutoAll = `        if (!latestAudio || !latestPlayer) {
            throw new Error("Player did not initialize");
        }

        await act(async () => {
            latestPlayer?.setAutoAllMode();
            await latestPlayer?.resumeOrPlay();
        });`;

const replacementForSinglePausePlay = `        if (!latestAudio || !latestPlayer) {
            throw new Error("Player did not initialize");
        }

        await act(async () => {
            latestPlayer?.setSinglePauseMode();
            await latestPlayer?.resumeOrPlay();
        });`;

// List of test descriptions that need auto_all + play
const autoAllTests = [
    "auto-advances subtitles sentence by sentence using duration fallback timings",
    "keeps the current subtitle through sentence boundary and switches with a small delay",
    "uses segmentTimings in dialogue mode without aggressive early subtitle switching",
    "progressively corrects segment timing drift so later sentences still advance into the final subtitle",
    "does not shrink segment timings when browser duration is slightly shorter, avoiding cumulative early switching",
    "re-seeks the current sentence instead of resuming a stale later timestamp in auto-all mode"
];

// List of test descriptions that need single_pause + play
const singlePauseTests = [
    "keeps playback active when jumping to later sentences in single-pause mode",
    "falls back to even timings when segment timings are unreliable in single-pause mode",
    "applies single-pause mode immediately by replaying the current sentence from start",
    "re-initializes playback correctly under StrictMode remounts",
    "replays the current sentence on play in single-pause mode instead of continuing into the next one",
    "keeps full sentence tail in single-pause mode and only pauses near segment boundary",
    "restarts current sentence immediately when switching from auto-all to single-pause"
];

// Split the file by `it("` and replace within each block
let parts = content.split('    it("');
for (let i = 1; i < parts.length; i++) {
    let part = parts[i];
    let testName = part.substring(0, part.indexOf('", async () => {'));
    
    if (autoAllTests.includes(testName)) {
        parts[i] = part.replace(targetStr, replacementForAutoAll);
        if (parts[i] === part) {
            console.log("Failed to replace in: " + testName);
        }
    } else if (singlePauseTests.includes(testName)) {
        parts[i] = part.replace(targetStr, replacementForSinglePausePlay);
        // some tests already do latestPlayer?.setSinglePauseMode(), so we might duplicate it, but it's fine.
    }
}

fs.writeFileSync('src/hooks/useListeningCabinPlayer.test.tsx', parts.join('    it("'));
console.log("Done updating tests.");
