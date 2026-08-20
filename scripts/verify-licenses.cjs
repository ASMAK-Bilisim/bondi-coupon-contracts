// SPDX-License-Identifier: AGPL-3.0-or-later
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const allowed = new Set(["MIT", "Apache-2.0", "Apache 2.0", "AGPL-3.0-or-later"]);

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

const solidityFiles = [
  ...walk(path.join(root, "contracts")),
  ...walk(path.join(root, "vendor/thirdweb")),
].filter((file) => file.endsWith(".sol"));

for (const file of solidityFiles) {
  const source = fs.readFileSync(file, "utf8");
  const match = source.match(/SPDX-License-Identifier:\s*([^\r\n*]+)/);
  if (!match) throw new Error(`Missing SPDX identifier: ${path.relative(root, file)}`);
  const identifier = match[1].trim();
  if (!allowed.has(identifier)) {
    throw new Error(`Disallowed SPDX identifier ${identifier}: ${path.relative(root, file)}`);
  }
  if (/UNLICENSED/i.test(source)) {
    throw new Error(`UNLICENSED source detected: ${path.relative(root, file)}`);
  }
}

const manageableVault = fs.readFileSync(
  path.join(root, "contracts/abstract/ManageableVault.sol"),
  "utf8"
);
if (manageableVault.includes("access/Pausable.sol")) {
  throw new Error("Midas UNLICENSED Pausable import must never be restored");
}
if (!manageableVault.includes("PausableUpgradeable")) {
  throw new Error("OpenZeppelin PausableUpgradeable replacement is missing");
}

const forbiddenPauser = path.join(root, "contracts/access/Pausable.sol");
if (fs.existsSync(forbiddenPauser)) {
  throw new Error("Midas UNLICENSED Pausable.sol must not be present");
}

const midasManifest = JSON.parse(
  fs.readFileSync(path.join(root, "provenance/midas-derived-files.json"), "utf8")
);
for (const entry of midasManifest.files) {
  const localHash = execFileSync("git", ["hash-object", entry.path], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  if (entry.localStatus === "verbatim" && localHash !== entry.upstreamBlob) {
    throw new Error(`Verbatim Midas source drift: ${entry.path}`);
  }
  if (entry.localStatus === "modified" && localHash === entry.upstreamBlob) {
    throw new Error(`Midas source marked modified but unchanged: ${entry.path}`);
  }
}

console.log(
  `Verified SPDX identifiers for ${solidityFiles.length} Solidity files and ${midasManifest.files.length} Midas provenance entries.`
);
