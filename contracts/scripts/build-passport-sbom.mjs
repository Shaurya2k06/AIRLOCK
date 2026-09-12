#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const output = process.argv[2];
const inputs = process.argv.slice(3);
if (!output || inputs.length === 0) throw new Error("Usage: build-passport-sbom.mjs <output> <sbom...>");

const documents = await Promise.all(inputs.map(async (file) => JSON.parse(await readFile(file, "utf8"))));
const components = new Map();
for (const document of documents) {
    for (const component of document.components || []) {
        const key = component["bom-ref"] || `${component.purl || component.name}@${component.version}`;
        components.set(key, component);
    }
}
const result = {
    $schema: "https://cyclonedx.org/schema/bom-1.7.schema.json",
    bomFormat: "CycloneDX",
    specVersion: "1.7",
    serialNumber: `urn:uuid:${randomUUID()}`,
    version: 1,
    metadata: {
        timestamp: new Date().toISOString(),
        tools: [{ vendor: "npm", name: "npm sbom", version: process.env.npm_config_user_agent?.split("npm/")[1]?.split(" ")[0] || "unknown" }],
        component: { type: "application", name: "airlock", version: process.env.RELEASE_VERSION || "1" },
    },
    components: [...components.values()].sort((left, right) => String(left["bom-ref"] || left.name).localeCompare(String(right["bom-ref"] || right.name))),
};
await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
