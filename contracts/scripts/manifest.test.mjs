import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { artifactProof, buildManifest, verifyManifest, verifyDocument } from "./manifest.mjs";

async function fixture() {
    const root = await mkdtemp(join(tmpdir(), "airlock-manifest-"));
    await writeFile(join(root, "airlock.json"), JSON.stringify({
        orgId: "org-a",
        releaseId: "release-a",
        releaseVersion: 1,
        suiteId: "suite-a",
        weights: "weights.bin",
        tokenizer: "tokenizer.json",
        systemPrompt: "system.txt",
        tools: "tools.json",
        container: "container.digest",
        sbom: "sbom.json",
        provenance: "provenance.json",
    }));
    await writeFile(join(root, "weights.bin"), "weights-v1");
    await writeFile(join(root, "tokenizer.json"), "{\"version\":1}");
    await writeFile(join(root, "system.txt"), "system-v1");
    await writeFile(join(root, "tools.json"), "{\"pay\":true}");
    await writeFile(join(root, "container.digest"), "sha256:container-v1");
    await writeFile(join(root, "sbom.json"), "{\"deps\":[]}");
    await writeFile(join(root, "provenance.json"), "{\"source\":\"test\"}");
    return root;
}

test("manifest is canonical, order-independent, and proves a file path", async () => {
    const root = await fixture();
    const output = join(root, "manifest.json");
    try {
        const document = await buildManifest({ input: root, output });
        assert.equal(document.releaseDigest, '0xf50242c69cb47aeda77910c8c09c6147f2a00ef3cb2aa0c39f0a6eae420fcd97');
        assert.equal(document.manifestHash, '0x33691a164e51da33af43f3fa48b3e0a571dc3214819a9dba17e0f73437e29164');
        assert.equal(document.artifactRoot, '0x156da8b0ef0244a7873b0dca90663820dcb3a976b500c1631748406b251a6dc2');
        assert.deepEqual(await verifyManifest(output, root), {
            manifestHash: document.manifestHash,
            artifactRoot: document.artifactRoot,
            releaseDigest: document.releaseDigest,
            files: 7,
        });
        const proof = artifactProof(document, "weights.bin");
        assert.equal(proof.root, document.artifactRoot);
        assert.equal(verifyDocument(document).releaseDigest, document.releaseDigest);

        const before = document.releaseDigest;
        await writeFile(join(root, "weights.bin"), "weights-v2");
        const changed = await buildManifest({ input: root, output });
        assert.notEqual(changed.releaseDigest, before);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("manifest rejects symlink escapes", async () => {
    const root = await fixture();
    const outside = join(root, "..", "airlock-outside.txt");
    await writeFile(outside, "outside");
    try {
        await symlink(outside, join(root, "escape.txt"));
        await assert.rejects(
            buildManifest({ input: root, output: join(root, "manifest.json") }),
            /symbolic links are not allowed/,
        );
    } finally {
        await rm(root, { recursive: true, force: true });
        await rm(outside, { force: true });
    }
});
