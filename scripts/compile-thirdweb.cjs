// SPDX-License-Identifier: AGPL-3.0-or-later
const fs = require("node:fs");
const path = require("node:path");

const { utils } = require("ethers");
const solc = require("solc");

const root = path.resolve(__dirname, "..");
const verifyOnly = process.argv.includes("--verify-only");

const profiles = [
  {
    directory: "TokenERC20-5.0.4",
    expectedName: "TokenERC20",
    expectedVersion: "5.0.4",
  },
  {
    directory: "Airdrop-2.0.2",
    expectedName: "Airdrop",
    expectedVersion: "2.0.2",
  },
];

function dependencyPath(sourceKey) {
  const mappings = [
    [
      "lib/openzeppelin-contracts-upgradeable/contracts/",
      "node_modules/openzeppelin-contracts-upgradeable-4.9.0/",
    ],
    ["lib/openzeppelin-contracts/contracts/", "node_modules/@openzeppelin/contracts/"],
    ["lib/solady/", "node_modules/solady/"],
  ];

  for (const [sourcePrefix, localPrefix] of mappings) {
    if (sourceKey.startsWith(sourcePrefix)) {
      return path.join(root, localPrefix, sourceKey.slice(sourcePrefix.length));
    }
  }

  throw new Error(`No pinned local dependency mapping for ${sourceKey}`);
}

function loadProfile(profile) {
  const profileRoot = path.join(root, "vendor/thirdweb", profile.directory);
  const metadata = JSON.parse(
    fs.readFileSync(path.join(profileRoot, "compiler-metadata.json"), "utf8")
  );
  const publish = JSON.parse(fs.readFileSync(path.join(profileRoot, "publish.json"), "utf8"));

  if (publish.name !== profile.expectedName || publish.version !== profile.expectedVersion) {
    throw new Error(`${profile.directory}: publish identity mismatch`);
  }

  if (!solc.version().startsWith(metadata.compiler.version)) {
    throw new Error(
      `${profile.directory}: expected compiler ${
        metadata.compiler.version
      }, installed ${solc.version()}`
    );
  }

  const sources = {};
  for (const [sourceKey, expected] of Object.entries(metadata.sources)) {
    const localPath = sourceKey.startsWith("contracts/")
      ? path.join(profileRoot, "sources", sourceKey)
      : dependencyPath(sourceKey);
    const content = fs.readFileSync(localPath);
    const actualHash = utils.keccak256(content);

    if (actualHash.toLowerCase() !== expected.keccak256.toLowerCase()) {
      throw new Error(
        `${profile.directory}: source hash mismatch for ${sourceKey}\n` +
          `expected ${expected.keccak256}\nactual   ${actualHash}\npath     ${localPath}`
      );
    }

    sources[sourceKey] = { content: content.toString("utf8") };
  }

  const [targetSource, targetName] = Object.entries(metadata.settings.compilationTarget)[0];
  const settings = { ...metadata.settings };
  delete settings.compilationTarget;
  settings.outputSelection = {
    "*": {
      "*": [
        "abi",
        "evm.bytecode.object",
        "evm.deployedBytecode.object",
        "evm.deployedBytecode.immutableReferences",
        "metadata",
      ],
    },
  };

  const output = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: metadata.language,
        sources,
        settings,
      })
    )
  );

  const errors = (output.errors || []).filter((entry) => entry.severity === "error");
  if (errors.length > 0) {
    throw new Error(errors.map((entry) => entry.formattedMessage).join("\n"));
  }

  const contract = output.contracts[targetSource][targetName];
  const compiledBytecode = `0x${contract.evm.bytecode.object}`;
  const publishedBytecode = fs
    .readFileSync(path.join(profileRoot, "published-bytecode.txt"), "utf8")
    .trim();

  if (compiledBytecode !== publishedBytecode) {
    throw new Error(
      `${profile.directory}: compiled creation bytecode does not match published bytecode`
    );
  }

  return {
    contractName: targetName,
    sourceName: targetSource,
    abi: contract.abi,
    bytecode: compiledBytecode,
    deployedBytecode: `0x${contract.evm.deployedBytecode.object}`,
    immutableReferences: contract.evm.deployedBytecode.immutableReferences,
    compiler: metadata.compiler.version,
    publish,
  };
}

const artifacts = profiles.map(loadProfile);

if (!verifyOnly) {
  const artifactDirectory = path.join(root, "vendor-artifacts");
  fs.mkdirSync(artifactDirectory, { recursive: true });
  for (const artifact of artifacts) {
    fs.writeFileSync(
      path.join(artifactDirectory, `${artifact.contractName}.json`),
      `${JSON.stringify(artifact, null, 2)}\n`
    );
  }
}

for (const artifact of artifacts) {
  console.log(
    `${artifact.contractName}: source hashes and published creation bytecode verified (${artifact.compiler})`
  );
}
