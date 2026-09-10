import { execFile as execFileCallback } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const patterns = [
    /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/,
    /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{20,})\b/,
    /\bPRIVATE_KEY\s*=\s*0x[0-9a-fA-F]{64}\b/,
];

const repoRoot = resolve(process.cwd(), "..");
const { stdout } = await execFile("git", ["-C", repoRoot, "ls-files", "-z"], { encoding: "utf8" });
const files = stdout.split("\0").filter(Boolean);
const findings = [];
for (const file of files) {
    const content = await readFile(join(repoRoot, file), "utf8");
    if (patterns.some((pattern) => pattern.test(content))) findings.push(file);
}

if (findings.length) throw new Error(`possible secret material in tracked files:\n${findings.map((file) => `- ${file}`).join("\n")}`);
console.log(`secret scan passed (${files.length} tracked files)`);
