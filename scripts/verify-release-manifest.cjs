// SPDX-License-Identifier: AGPL-3.0-or-later
const fs = require("node:fs");
const path = require("node:path");

const { utils } = require("ethers");

const root = path.resolve(__dirname, "..");
const manifestPath = path.join(root, "config/release-manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

if (manifest.schemaVersion !== 1) throw new Error("Unsupported release-manifest schema");
if (!["candidate", "approved"].includes(manifest.approvalStatus)) {
  throw new Error("Invalid release-manifest approval status");
}
if (manifest.approvalStatus === "approved" && !/^[0-9a-f]{40}$/i.test(manifest.sourceCommit)) {
  throw new Error("An approved release manifest must pin a reviewed source commit");
}

function artifact(identity) {
  const artifactPath = path.resolve(root, identity.artifactPath);
  if (!artifactPath.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Artifact path escapes repository: ${identity.artifactPath}`);
  }
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Missing compiled artifact: ${identity.artifactPath}`);
  }
  return JSON.parse(fs.readFileSync(artifactPath, "utf8"));
}

function assertHash(label, code, expected) {
  const actual = utils.keccak256(code);
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`${label} hash mismatch: expected ${expected}, got ${actual}`);
  }
}

for (const name of ["erc1967Proxy", "redemptionVault", "midasAccessControl", "tokenERC20"]) {
  const identity = manifest.artifacts[name];
  const compiled = artifact(identity);
  assertHash(`${name} creation code`, compiled.bytecode, identity.creationCodeHash);
  assertHash(`${name} runtime code`, compiled.deployedBytecode, identity.runtimeCodeHash);
}

function assertZeroImmutableTemplate(label, compiled, references) {
  const template = utils.arrayify(compiled.deployedBytecode);
  for (const reference of references) {
    if (reference.length !== 32 || reference.start + reference.length > template.length) {
      throw new Error(`Invalid ${label} immutable reference`);
    }
    if (template.slice(reference.start, reference.start + reference.length).some(Boolean)) {
      throw new Error(`${label} runtime template immutable placeholder is not zero`);
    }
  }
}

function compiledImmutableKeys(compiled) {
  return Object.values(compiled.immutableReferences || {})
    .flat()
    .map(({ start, length }) => `${start}:${length}`)
    .sort();
}

const airdropIdentity = manifest.artifacts.airdrop;
const airdrop = artifact(airdropIdentity);
assertHash("airdrop creation code", airdrop.bytecode, airdropIdentity.creationCodeHash);
assertHash(
  "airdrop runtime template",
  airdrop.deployedBytecode,
  airdropIdentity.runtimeTemplateCodeHash
);
const expectedAirdropImmutableNames = new Set([
  "cachedThis",
  "cachedChainId",
  "cachedNameHash",
  "cachedVersionHash",
  "cachedDomainSeparator",
]);
if (
  airdropIdentity.immutableReferences.length !== expectedAirdropImmutableNames.size ||
  airdropIdentity.immutableReferences.some(
    (reference) => !expectedAirdropImmutableNames.delete(reference.name)
  ) ||
  expectedAirdropImmutableNames.size !== 0
) {
  throw new Error("Airdrop immutable semantic mapping is incomplete or duplicated");
}
const compiledAirdropReferences = compiledImmutableKeys(airdrop);
const manifestAirdropReferences = airdropIdentity.immutableReferences
  .map(({ start, length }) => `${start}:${length}`)
  .sort();
if (JSON.stringify(compiledAirdropReferences) !== JSON.stringify(manifestAirdropReferences)) {
  throw new Error("Airdrop immutable offsets differ from the compiler output");
}
assertZeroImmutableTemplate("Airdrop", airdrop, airdropIdentity.immutableReferences);

if (manifest.artifacts.fixedPriceDataFeed) {
  throw new Error("Release manifest must not pin removed FixedPriceDataFeed artifacts");
}

const manifestHash = utils.keccak256(utils.toUtf8Bytes(fs.readFileSync(manifestPath, "utf8")));
console.log(
  `Verified ${manifest.approvalStatus} release manifest ${manifest.releaseId} (${manifestHash}).`
);
