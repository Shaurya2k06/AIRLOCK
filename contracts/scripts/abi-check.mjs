import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const artifactDirectory = resolve(process.cwd(), "artifacts/contracts/Airlock.sol");
const snapshotFile = resolve(process.cwd(), "abi/Airlock.abi.sha256");

const names = (await readdir(artifactDirectory))
    .filter((name) => name.endsWith(".json"))
    .sort();
const snapshot = {};
for (const name of names) {
    const artifact = JSON.parse(await readFile(join(artifactDirectory, name), "utf8"));
    snapshot[name.slice(0, -5)] = artifact.abi;
}

const digest = createHash("sha256")
    .update(JSON.stringify(snapshot))
    .digest("hex");

if (process.argv.includes("--update")) {
    await mkdir(dirname(snapshotFile), { recursive: true });
    await writeFile(snapshotFile, `${digest}\n`);
    console.log(`updated ${snapshotFile}: ${digest}`);
} else {
    const expected = (await readFile(snapshotFile, "utf8")).trim();
    if (expected !== digest) {
        throw new Error(`ABI drift detected: expected ${expected}, got ${digest}; review and update abi/Airlock.abi.sha256`);
    }
    console.log(`ABI snapshot matches: ${digest}`);
}
