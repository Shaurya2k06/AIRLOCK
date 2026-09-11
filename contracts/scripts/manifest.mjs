#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { AbiCoder, id, keccak256 } from "ethers";
import { encode } from "cbor2";

const DOMAIN_SEPARATOR = id("AIRLOCK_RELEASE_V1");
const ZERO_BYTES32 = `0x${"00".repeat(32)}`;
const abi = AbiCoder.defaultAbiCoder();
const componentDefaults = {
    weights: "weights.bin",
    tokenizer: "tokenizer.json",
    systemPrompt: "system-prompt.txt",
    tools: "tools.json",
    container: "container.digest",
    sbom: "sbom.json",
    provenance: "provenance.json",
    agentCard: "agent-card.json",
    a2aCard: "a2a-card.json",
    configSchema: "config.schema.json",
    policyBundle: "policy.json",
    sigstoreBundle: "sigstore.bundle.json",
    rekorProof: "rekor-proof.json",
};

function sha256(value) {
    return `0x${createHash("sha256").update(value).digest("hex")}`;
}

function bytes32(value, name) {
    if (typeof value !== "string" || value.length === 0) throw new Error(`Missing ${name}`);
    if (/^0x[0-9a-fA-F]{64}$/.test(value)) return value.toLowerCase();
    return keccak256(Buffer.from(value, "utf8"));
}

function normalizeRelative(value) {
    const original = String(value);
    const normalizedSeparators = original.replaceAll("\\", "/");
    if (
        !normalizedSeparators
        || normalizedSeparators.startsWith("/")
        || /^[A-Za-z]:\//.test(normalizedSeparators)
        || normalizedSeparators.split("/").some((part) => part === ".." || part === "")
    ) {
        throw new Error(`unsafe artifact path: ${original}`);
    }
    const normalizedUnicode = normalizedSeparators.normalize("NFC");
    if (normalizedUnicode !== normalizedSeparators) {
        throw new Error(`ambiguous Unicode artifact path: ${original}`);
    }
    return normalizedUnicode;
}

function hashPair(left, right) {
    const ordered = left.toLowerCase() < right.toLowerCase() ? [left, right] : [right, left];
    return sha256(Buffer.concat(ordered.map((value) => Buffer.from(value.slice(2), "hex"))));
}

function merkleRoot(leaves) {
    if (!leaves.length) throw new Error("artifact must contain at least one file");
    let level = [...leaves];
    while (level.length > 1) {
        const next = [];
        for (let i = 0; i < level.length; i += 2) {
            next.push(hashPair(level[i], level[i + 1] ?? level[i]));
        }
        level = next;
    }
    return level[0];
}

function artifactLeaf(path, size, contentHash) {
    const sizeBytes = Buffer.alloc(8);
    sizeBytes.writeBigUInt64BE(BigInt(size));
    return sha256(Buffer.concat([
        Buffer.from(path, "utf8"),
        sizeBytes,
        Buffer.from(contentHash.slice(2), "hex"),
    ]));
}

async function collectFiles(root, excludedFile) {
    const rootPath = resolve(root);
    const rootRealPath = await realpath(rootPath);
    const excluded = resolve(excludedFile || "");
    const paths = [];
    const lowerCasePaths = new Map();

    async function walk(current, prefix = "") {
        const entries = await readdir(current, { withFileTypes: true });
        for (const entry of entries) {
            const filePath = join(current, entry.name);
            const path = normalizeRelative(join(prefix, entry.name));
            if (resolve(filePath) === excluded) continue;
            // airlock.json describes the build inputs; it is not itself a release artifact.
            if (path === "airlock.json") continue;
            if (entry.isSymbolicLink()) throw new Error(`symbolic links are not allowed: ${path}`);
            if (entry.isDirectory()) {
                await walk(filePath, path);
                continue;
            }
            if (!entry.isFile()) throw new Error(`unsupported artifact entry: ${path}`);
            const realPath = await realpath(filePath);
            if (realPath !== rootRealPath && !realPath.startsWith(`${rootRealPath}${sep}`)) {
                throw new Error(`artifact path escapes root: ${path}`);
            }
            const lower = path.toLocaleLowerCase("en-US");
            if (lowerCasePaths.has(lower)) throw new Error(`case-ambiguous artifact paths: ${path}`);
            lowerCasePaths.set(lower, path);
            const content = await readFile(filePath);
            const contentHash = sha256(content);
            paths.push({
                path,
                size: content.byteLength,
                sha256: contentHash,
                leaf: artifactLeaf(path, content.byteLength, contentHash),
            });
        }
    }

    await walk(rootPath);
    paths.sort((left, right) => left.path.localeCompare(right.path, "en-US"));
    return paths;
}

async function readMetadata(input) {
    try {
        return JSON.parse(await readFile(join(input, "airlock.json"), "utf8"));
    } catch (error) {
        if (error.code === "ENOENT") return {};
        throw error;
    }
}

async function componentHash(input, metadata, name, directName = `${name}Hash`) {
    const direct = metadata[directName] || metadata[`${name}Hash`];
    if (direct) return bytes32(direct, `${name}Hash`);
    const reference = metadata[name] || componentDefaults[name];
    const referencePath = resolve(input, normalizeRelative(reference));
    const content = await readFile(referencePath);
    return sha256(content);
}

async function optionalComponentHash(input, metadata, name) {
    try {
        return await componentHash(input, metadata, name, `${name}Hash`);
    } catch (error) {
        if (error.code === "ENOENT") return ZERO_BYTES32;
        throw error;
    }
}

function passportHash(value) {
    return keccak256(canonicalBytes(value));
}

function computeReleaseDigest(payload, manifestHash, artifactRoot) {
    if (!payload.passport) {
        return keccak256(abi.encode(
            ["bytes32", "bytes32", "bytes32", "bytes32", "bytes32", "bytes32", "bytes32", "bytes32", "bytes32", "bytes32", "bytes32", "bytes32", "uint64"],
            [
                DOMAIN_SEPARATOR,
                payload.orgId,
                payload.releaseId,
                manifestHash,
                artifactRoot,
                payload.components.weightsHash,
                payload.components.tokenizerHash,
                payload.components.systemPromptHash,
                payload.components.toolManifestRoot,
                payload.components.containerImageDigest,
                payload.components.sbomHash,
                payload.components.provenanceHash,
                payload.releaseVersion,
            ],
        ));
    }
    const passport = payload.passport;
    const values = [
        DOMAIN_SEPARATOR,
        payload.orgId,
        payload.releaseId,
        manifestHash,
        artifactRoot,
        payload.components.weightsHash,
        payload.components.tokenizerHash,
        payload.components.systemPromptHash,
        payload.components.toolManifestRoot,
        payload.components.containerImageDigest,
        payload.components.sbomHash,
        payload.components.provenanceHash,
        payload.releaseVersion,
        passport.modelProviderHash,
        passport.modelIdentifierHash,
        passport.modelChecksum,
        passport.promptTemplateHash,
        passport.agentCardHash,
        passport.a2aCardHash,
        passport.configSchemaHash,
        passport.policyBundleHash,
        passport.sigstoreBundleHash,
        passport.rekorProofHash,
        passport.previousReleaseDigest,
    ];
    return keccak256(abi.encode(
        ["bytes32", "bytes32", "bytes32", "bytes32", "bytes32", "bytes32", "bytes32", "bytes32", "bytes32", "bytes32", "bytes32", "bytes32", "uint64", "bytes32", "bytes32", "bytes32", "bytes32", "bytes32", "bytes32", "bytes32", "bytes32", "bytes32", "bytes32", "bytes32"],
        values,
    ));
}

function canonicalBytes(payload) {
    return encode(payload, { cde: true });
}

async function buildManifest({ input, output, orgId, releaseId, releaseVersion, componentOverrides = {} }) {
    const inputPath = resolve(input);
    const outputPath = resolve(output);
    const metadata = await readMetadata(inputPath);
    const files = await collectFiles(inputPath, outputPath);
    const payload = {
        schema: "AIRLOCK_MANIFEST_V1",
        orgId: bytes32(orgId || metadata.orgId, "orgId"),
        releaseId: bytes32(releaseId || metadata.releaseId, "releaseId"),
        releaseVersion: Number(releaseVersion || metadata.releaseVersion || 1),
        suiteId: bytes32(metadata.suiteId || "AIRLOCK_SUITE_V1", "suiteId"),
        files,
        components: {
            weightsHash: await componentHash(inputPath, metadata, "weights"),
            tokenizerHash: await componentHash(inputPath, metadata, "tokenizer"),
            systemPromptHash: await componentHash(inputPath, metadata, "systemPrompt"),
            toolManifestRoot: await componentHash(inputPath, metadata, "tools", "toolManifestRoot"),
            containerImageDigest: await componentHash(inputPath, metadata, "container", "containerImageDigest"),
            sbomHash: await componentHash(inputPath, metadata, "sbom"),
            provenanceHash: await componentHash(inputPath, metadata, "provenance"),
            ...componentOverrides,
        },
    };
    payload.passport = {
        modelProviderHash: bytes32(metadata.modelProvider || "AIRLOCK_RUNTIME", "modelProvider"),
        modelIdentifierHash: bytes32(metadata.modelIdentifier || "release-bound-agent", "modelIdentifier"),
        modelChecksum: bytes32(metadata.modelChecksum || payload.components.weightsHash, "modelChecksum"),
        promptTemplateHash: payload.components.systemPromptHash,
        agentCardHash: await optionalComponentHash(inputPath, metadata, "agentCard"),
        a2aCardHash: await optionalComponentHash(inputPath, metadata, "a2aCard"),
        configSchemaHash: await optionalComponentHash(inputPath, metadata, "configSchema"),
        policyBundleHash: await optionalComponentHash(inputPath, metadata, "policyBundle"),
        sigstoreBundleHash: await optionalComponentHash(inputPath, metadata, "sigstoreBundle"),
        rekorProofHash: await optionalComponentHash(inputPath, metadata, "rekorProof"),
        previousReleaseDigest: bytes32(metadata.previousReleaseDigest || ZERO_BYTES32, "previousReleaseDigest"),
        runtimeAssurance: metadata.runtimeAssurance || "L0",
    };
    payload.passport.passportHash = passportHash(payload.passport);
    if (!Number.isSafeInteger(payload.releaseVersion) || payload.releaseVersion < 1 || payload.releaseVersion > 0xffffffffffffffff) {
        throw new Error("releaseVersion must be a positive uint64");
    }
    const artifactRoot = merkleRoot(files.map((file) => file.leaf));
    const canonical = canonicalBytes(payload);
    const manifestHash = sha256(canonical);
    const document = {
        schema: payload.schema,
        payload,
        artifactRoot,
        manifestHash,
        releaseDigest: computeReleaseDigest(payload, manifestHash, artifactRoot),
        canonicalCbor: Buffer.from(canonical).toString("base64"),
    };
    await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`);
    return document;
}

function sameBytes(left, right) {
    return Buffer.from(left).equals(Buffer.from(right));
}

function verifyDocument(document) {
    if (document?.schema !== "AIRLOCK_MANIFEST_V1" || document?.payload?.schema !== document.schema) {
        throw new Error("unsupported manifest schema");
    }
    const canonical = canonicalBytes(document.payload);
    if (!sameBytes(canonical, Buffer.from(document.canonicalCbor, "base64"))) {
        throw new Error("canonical CBOR does not match payload");
    }
    const manifestHash = sha256(canonical);
    if (manifestHash !== document.manifestHash) throw new Error("manifest hash mismatch");
    for (const file of document.payload.files) {
        const expected = artifactLeaf(file.path, file.size, file.sha256);
        if (expected !== file.leaf) throw new Error(`artifact leaf mismatch: ${file.path}`);
    }
    const artifactRoot = merkleRoot(document.payload.files.map((file) => file.leaf));
    if (artifactRoot !== document.artifactRoot) throw new Error("artifact root mismatch");
    if (document.payload.passport?.passportHash) {
        const passport = { ...document.payload.passport };
        delete passport.passportHash;
        if (passportHash(passport) !== document.payload.passport.passportHash) throw new Error("release passport hash mismatch");
    }
    const releaseDigest = computeReleaseDigest(document.payload, manifestHash, artifactRoot);
    if (releaseDigest !== document.releaseDigest) throw new Error("release digest mismatch");
    return { manifestHash, artifactRoot, releaseDigest, files: document.payload.files.length };
}

async function verifyManifest(file, input) {
    const path = resolve(file);
    const document = JSON.parse(await readFile(path, "utf8"));
    const result = verifyDocument(document);
    if (input) {
        const files = await collectFiles(resolve(input), path);
        if (JSON.stringify(files) !== JSON.stringify(document.payload.files)) throw new Error("source files do not match manifest");
    }
    return result;
}

function artifactProof(document, path) {
    const normalized = normalizeRelative(path);
    const index = document.payload.files.findIndex((file) => file.path === normalized);
    if (index < 0) throw new Error(`path not found in manifest: ${normalized}`);
    let position = index;
    let level = document.payload.files.map((file) => file.leaf);
    const proof = [];
    while (level.length > 1) {
        const siblingIndex = position % 2 === 0 ? Math.min(position + 1, level.length - 1) : position - 1;
        proof.push({ hash: level[siblingIndex], isLeft: siblingIndex < position });
        const next = [];
        for (let i = 0; i < level.length; i += 2) next.push(hashPair(level[i], level[i + 1] ?? level[i]));
        position = Math.floor(position / 2);
        level = next;
    }
    return { path: normalized, leaf: document.payload.files[index].leaf, root: document.artifactRoot, proof };
}

function parseFlags(argv) {
    const command = argv.shift();
    const flags = {};
    for (let index = 0; index < argv.length; index += 1) {
        const flag = argv[index];
        if (!flag.startsWith("--")) throw new Error(`unexpected argument: ${flag}`);
        const name = flag.slice(2);
        const value = argv[index + 1];
        if (!value || value.startsWith("--")) throw new Error(`missing value for --${name}`);
        flags[name] = value;
        index += 1;
    }
    return { command, flags };
}

async function main(argv = process.argv.slice(2)) {
    const { command, flags } = parseFlags(argv);
    if (command === "build") {
        const document = await buildManifest({
            input: flags.input,
            output: flags.output || "./airlock-manifest.json",
            orgId: flags["org-id"],
            releaseId: flags["release-id"],
            releaseVersion: flags["release-version"],
        });
        console.log(JSON.stringify({ releaseDigest: document.releaseDigest, manifestHash: document.manifestHash, artifactRoot: document.artifactRoot }, null, 2));
        return;
    }
    if (command === "verify") {
        console.log(JSON.stringify(await verifyManifest(flags.file, flags.input), null, 2));
        return;
    }
    if (command === "prove") {
        const document = JSON.parse(await readFile(resolve(flags.file), "utf8"));
        verifyDocument(document);
        console.log(JSON.stringify(artifactProof(document, flags.path), null, 2));
        return;
    }
    if (command === "inspect") {
        const document = JSON.parse(await readFile(resolve(flags.file), "utf8"));
        const result = verifyDocument(document);
        console.log(JSON.stringify({ ...result, orgId: document.payload.orgId, releaseId: document.payload.releaseId, releaseVersion: document.payload.releaseVersion, suiteId: document.payload.suiteId }, null, 2));
        return;
    }
    throw new Error("Usage: manifest.mjs <build|verify|prove|inspect> [--flags]");
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    });
}

export { artifactLeaf, artifactProof, buildManifest, canonicalBytes, collectFiles, merkleRoot, verifyDocument, verifyManifest };
