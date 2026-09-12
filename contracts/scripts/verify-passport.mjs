#!/usr/bin/env node

import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const { verifyPassportArtifacts } = require("../../server/passport.js");
const [manifestFile, releaseDir] = process.argv.slice(2);
if (!manifestFile || !releaseDir) throw new Error("Usage: verify-passport.mjs <manifest> <release-dir>");
const document = JSON.parse(await readFile(resolve(manifestFile), "utf8"));
const result = await verifyPassportArtifacts(document, resolve(releaseDir), { requireExternal: true });
console.log(JSON.stringify(result, null, 2));
if (!result.verified) process.exitCode = 1;
