#!/usr/bin/env node

import { writeFile } from "node:fs/promises";

const [output, imageDigest, imageRef, commit] = process.argv.slice(2);
if (!output || !/^sha256:[0-9a-f]{64}$/i.test(imageDigest || "") || !imageRef || !commit) {
    throw new Error("Usage: build-slsa-provenance.mjs <output> <sha256:digest> <image-ref> <commit>");
}
await writeFile(output, `${JSON.stringify({
    _type: "https://in-toto.io/Statement/v1",
    subject: [{ name: imageRef, digest: { sha256: imageDigest.slice("sha256:".length) } }],
    predicateType: "https://slsa.dev/provenance/v1",
    predicate: {
        buildDefinition: {
            buildType: "https://github.com/slsa-framework/slsa-github-generator/generic@v1",
            externalParameters: { repository: process.env.GITHUB_REPOSITORY || "Shaurya2k06/AIRLOCK", ref: process.env.GITHUB_REF || "refs/heads/main" },
            resolvedDependencies: [{ uri: `git+https://github.com/${process.env.GITHUB_REPOSITORY || "Shaurya2k06/AIRLOCK"}@${commit}`, digest: { sha1: commit } }],
        },
        runDetails: {
            builder: { id: "https://github.com/slsa-framework/slsa-github-generator" },
            metadata: { invocationId: `${process.env.GITHUB_RUN_ID || "local"}/${process.env.GITHUB_RUN_ATTEMPT || "1"}` },
        },
    },
}, null, 2)}\n`);
