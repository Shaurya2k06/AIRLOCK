#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const [bundleFile, payloadFile, outputFile] = process.argv.slice(2);
if (!bundleFile || !payloadFile || !outputFile) throw new Error("Usage: build-rekor-proof.mjs <bundle> <payload> <output>");
const bundle = JSON.parse(await readFile(bundleFile, "utf8"));
const payloadSha256 = `0x${createHash("sha256").update(await readFile(payloadFile)).digest("hex")}`;
const entries = bundle.verificationMaterial?.tlogEntries || [];
if (!entries.length) throw new Error("Sigstore bundle contains no Rekor transparency-log entry");
await writeFile(outputFile, `${JSON.stringify({ schema: "AIRLOCK_REKOR_PROOF_V1", payloadSha256, entries }, null, 2)}\n`);
