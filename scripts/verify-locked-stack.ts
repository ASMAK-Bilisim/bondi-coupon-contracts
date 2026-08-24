// SPDX-License-Identifier: AGPL-3.0-or-later
import fs from "node:fs";
import path from "node:path";

import { BigNumber, Contract, providers, utils } from "ethers";

const ROOT = path.resolve(__dirname, "..");
const APPROVED_RELEASE_PATH = path.join(ROOT, "config/release-manifest.json");
const CANONICAL_USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const DEFAULT_ADMIN_ROLE = utils.hexZeroPad("0x00", 32);
const MINTER_ROLE = utils.id("MINTER_ROLE");
const TRANSFER_ROLE = utils.id("TRANSFER_ROLE");
const VAULT_ADMIN_ROLE = utils.id("REDEMPTION_VAULT_ADMIN_ROLE");
const BLACKLIST_OPERATOR_ROLE = utils.id("BLACKLIST_OPERATOR_ROLE");
const GREENLIST_OPERATOR_ROLE = utils.id("GREENLIST_OPERATOR_ROLE");
const GREENLISTED_ROLE = utils.id("GREENLISTED_ROLE");
const BLACKLISTED_ROLE = utils.id("BLACKLISTED_ROLE");
const COUPON_PER_USDC_BASE_UNIT = BigNumber.from(10).pow(12);
const LOG_CHUNK_SIZE = 50_000;

const IMPLEMENTATION_SLOT = BigNumber.from(
  utils.keccak256(utils.toUtf8Bytes("eip1967.proxy.implementation"))
)
  .sub(1)
  .toHexString();
const ADMIN_SLOT = BigNumber.from(utils.keccak256(utils.toUtf8Bytes("eip1967.proxy.admin")))
  .sub(1)
  .toHexString();

interface ArtifactIdentity {
  artifactPath: string;
  creationCodeHash: string;
  runtimeCodeHash: string;
}

interface ImmutableReference {
  start: number;
  length: number;
}

interface AirdropImmutableReference extends ImmutableReference {
  name:
    | "cachedThis"
    | "cachedChainId"
    | "cachedNameHash"
    | "cachedVersionHash"
    | "cachedDomainSeparator";
}

interface AirdropArtifactIdentity {
  artifactPath: string;
  creationCodeHash: string;
  runtimeTemplateCodeHash: string;
  immutableReferences: AirdropImmutableReference[];
}

interface ApprovedReleaseManifest {
  schemaVersion: 1;
  releaseId: string;
  sourceCommit: string;
  approvalStatus: "candidate" | "approved";
  artifacts: {
    erc1967Proxy: ArtifactIdentity;
    redemptionVault: ArtifactIdentity;
    midasAccessControl: ArtifactIdentity;
    tokenERC20: ArtifactIdentity;
    airdrop: AirdropArtifactIdentity;
  };
}

interface Qualification {
  chainId: 1;
  approvedReleaseManifestHash: string;
  lockEvidenceHash: string;
  vaultAddress: string;
  vaultImplementationAddress: string;
  vaultProxyCreationTransactionHash: string;
  accessControlAddress: string;
  accessControlImplementationAddress: string;
  accessControlProxyCreationTransactionHash: string;
  couponTokenAddress: string;
  couponTokenImplementationAddress: string;
  couponTokenProxyCreationTransactionHash: string;
  airdropAddress: string;
  airdropImplementationAddress: string;
  airdropImplementationRuntimeCodeHash: string;
  airdropImplementationCreationTransactionHash: string;
  airdropProxyCreationTransactionHash: string;
  usdcTokenAddress: string;
  initialCouponSupplyBaseUnits: string;
  greenlistOperatorAddress: string;
}

interface ContractArtifact {
  abi: readonly unknown[];
  bytecode: string;
  deployedBytecode: string;
}

interface ReleaseArtifacts {
  proxy: ContractArtifact;
  vault: ContractArtifact;
  accessControl: ContractArtifact;
  token: ContractArtifact;
  airdrop: ContractArtifact;
}

interface CreationEvidence {
  blockNumber: number;
  transactionData: string;
}

interface RoleEvidence {
  members: Map<string, Set<string>>;
  observed: Map<string, Set<string>>;
  evidenceHash: string;
}

const vaultAbi = [
  "function mToken() view returns (address)",
  "function accessControl() view returns (address)",
  "function mTokenDataFeed() view returns (address)",
  "function paused() view returns (bool)",
  "function greenlistEnabled() view returns (bool)",
  "function instantFee() view returns (uint256)",
  "function instantDailyLimit() view returns (uint256)",
  "function initialCouponSupply() view returns (uint256)",
  "function minAmount() view returns (uint256)",
  "function tokensConfig(address) view returns (address dataFeed,uint256 fee,uint256 allowance,bool stable)",
  "function getPaymentTokens() view returns (address[])",
  "event RedeemInstant(address indexed user,address indexed tokenOut,uint256 amount,uint256 feeAmount,uint256 amountTokenOut)",
];
const accessControlAbi = [
  "function hasRole(bytes32 role,address account) view returns (bool)",
  "function getRoleAdmin(bytes32 role) view returns (bytes32)",
  "event RoleGranted(bytes32 indexed role,address indexed account,address indexed sender)",
  "event RoleRevoked(bytes32 indexed role,address indexed account,address indexed sender)",
];
const tokenAbi = [
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function getRoleMemberCount(bytes32 role) view returns (uint256)",
  "function getRoleMember(bytes32 role,uint256 index) view returns (address)",
  "event Transfer(address indexed from,address indexed to,uint256 value)",
];
const erc20Abi = [
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
];
const airdropAbi = [
  "function owner() view returns (address)",
  "function tokenMerkleRoot(address) view returns (bytes32)",
];

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function normalize(address: string) {
  return utils.getAddress(address);
}

function sameHex(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase();
}

function slotAddress(value: string) {
  return normalize(utils.hexDataSlice(value, 12));
}

function readArtifact(relativePath: string): ContractArtifact {
  const artifactPath = path.resolve(ROOT, relativePath);
  invariant(
    artifactPath.startsWith(`${ROOT}${path.sep}`),
    `Artifact path escapes repository: ${relativePath}`
  );
  invariant(fs.existsSync(artifactPath), `Missing compiled artifact: ${relativePath}`);
  return JSON.parse(fs.readFileSync(artifactPath, "utf8")) as ContractArtifact;
}

function assertArtifactIdentity(
  name: string,
  artifact: ContractArtifact,
  identity: ArtifactIdentity
) {
  invariant(
    sameHex(utils.keccak256(artifact.bytecode), identity.creationCodeHash),
    `${name}: local creation bytecode differs from approved release`
  );
  invariant(
    sameHex(utils.keccak256(artifact.deployedBytecode), identity.runtimeCodeHash),
    `${name}: local runtime bytecode differs from approved release`
  );
}

function loadApprovedRelease(): {
  manifest: ApprovedReleaseManifest;
  manifestHash: string;
  artifacts: ReleaseArtifacts;
} {
  const raw = fs.readFileSync(APPROVED_RELEASE_PATH, "utf8");
  const manifest = JSON.parse(raw) as ApprovedReleaseManifest;
  invariant(manifest.schemaVersion === 1, "Unsupported approved release manifest");
  invariant(
    manifest.approvalStatus === "approved",
    "Release manifest is still a candidate and has not been independently approved"
  );
  invariant(
    /^([0-9a-f]{40})$/i.test(manifest.sourceCommit),
    "Approved release manifest does not pin a source commit"
  );

  const artifacts: ReleaseArtifacts = {
    proxy: readArtifact(manifest.artifacts.erc1967Proxy.artifactPath),
    vault: readArtifact(manifest.artifacts.redemptionVault.artifactPath),
    accessControl: readArtifact(manifest.artifacts.midasAccessControl.artifactPath),
    token: readArtifact(manifest.artifacts.tokenERC20.artifactPath),
    airdrop: readArtifact(manifest.artifacts.airdrop.artifactPath),
  };

  assertArtifactIdentity("ERC1967Proxy", artifacts.proxy, manifest.artifacts.erc1967Proxy);
  assertArtifactIdentity("RedemptionVault", artifacts.vault, manifest.artifacts.redemptionVault);
  assertArtifactIdentity(
    "MidasAccessControl",
    artifacts.accessControl,
    manifest.artifacts.midasAccessControl
  );
  assertArtifactIdentity("TokenERC20", artifacts.token, manifest.artifacts.tokenERC20);

  const airdropIdentity = manifest.artifacts.airdrop;
  invariant(
    sameHex(utils.keccak256(artifacts.airdrop.bytecode), airdropIdentity.creationCodeHash),
    "Airdrop: local creation bytecode differs from approved release"
  );
  invariant(
    sameHex(
      utils.keccak256(artifacts.airdrop.deployedBytecode),
      airdropIdentity.runtimeTemplateCodeHash
    ),
    "Airdrop: local runtime template differs from approved release"
  );

  return {
    manifest,
    manifestHash: utils.keccak256(utils.toUtf8Bytes(raw)),
    artifacts,
  };
}

async function assertCodeHash(
  provider: providers.JsonRpcProvider,
  address: string,
  expectedHash: string,
  blockTag: number
) {
  const code = await provider.getCode(address, blockTag);
  invariant(code !== "0x", `No code at ${address}`);
  invariant(
    sameHex(utils.keccak256(code), expectedHash),
    `Runtime code hash mismatch at ${address}`
  );
}

async function assertDirectCreation(
  provider: providers.JsonRpcProvider,
  transactionHash: string,
  expectedAddress: string,
  blockTag: number
): Promise<CreationEvidence> {
  const [transaction, receipt] = await Promise.all([
    provider.getTransaction(transactionHash),
    provider.getTransactionReceipt(transactionHash),
  ]);
  invariant(Boolean(transaction), `Missing creation transaction ${transactionHash}`);
  invariant(Boolean(receipt), `Missing creation receipt ${transactionHash}`);
  invariant(transaction!.to === null, `${expectedAddress}: creation transaction is not direct`);
  invariant(receipt!.status === 1, `${expectedAddress}: creation transaction failed`);
  invariant(
    Boolean(receipt!.contractAddress),
    `${expectedAddress}: receipt has no contract address`
  );
  invariant(
    normalize(receipt!.contractAddress!) === normalize(expectedAddress),
    `${expectedAddress}: creation receipt address mismatch`
  );
  invariant(
    receipt!.blockNumber <= blockTag,
    `${expectedAddress}: creation is newer than qualification block`
  );
  invariant(
    transaction!.blockNumber === receipt!.blockNumber &&
      transaction!.blockHash === receipt!.blockHash,
    `${expectedAddress}: creation transaction/receipt mismatch`
  );

  const canonicalBlock = await provider.getBlock(receipt!.blockNumber);
  invariant(
    Boolean(canonicalBlock) && canonicalBlock.hash === receipt!.blockHash,
    `${expectedAddress}: creation receipt is not canonical`
  );
  invariant(receipt!.blockNumber > 0, `${expectedAddress}: invalid creation block`);
  const codeBeforeCreation = await provider.getCode(expectedAddress, receipt!.blockNumber - 1);
  invariant(
    codeBeforeCreation === "0x",
    `${expectedAddress}: code existed before claimed creation`
  );

  return {
    blockNumber: receipt!.blockNumber,
    transactionData: transaction!.data,
  };
}

function strictDecodeInitializer(
  artifact: ContractArtifact,
  initializerData: string
): { iface: utils.Interface; values: utils.Result } {
  const iface = new utils.Interface(artifact.abi as utils.Fragment[]);
  const fragment = iface.getFunction("initialize");
  const values = iface.decodeFunctionData(fragment, initializerData);
  const args = fragment.inputs.map((_, index) => values[index]);
  invariant(
    sameHex(iface.encodeFunctionData(fragment, args), initializerData),
    "Initializer calldata is not canonical"
  );
  return { iface, values };
}

async function assertLockedProxy(
  provider: providers.JsonRpcProvider,
  proxy: string,
  implementation: string,
  creationTransactionHash: string,
  proxyArtifact: ContractArtifact,
  expectedProxyRuntimeHash: string,
  blockTag: number,
  validateInitializer: (initializerData: string) => void
): Promise<number> {
  await assertCodeHash(provider, proxy, expectedProxyRuntimeHash, blockTag);
  const [implementationValue, adminValue] = await Promise.all([
    provider.getStorageAt(proxy, IMPLEMENTATION_SLOT, blockTag),
    provider.getStorageAt(proxy, ADMIN_SLOT, blockTag),
  ]);
  invariant(
    slotAddress(implementationValue) === normalize(implementation),
    `${proxy}: wrong implementation`
  );
  invariant(BigNumber.from(adminValue).isZero(), `${proxy}: EIP-1967 admin slot is not zero`);

  const creation = await assertDirectCreation(provider, creationTransactionHash, proxy, blockTag);
  invariant(
    creation.transactionData.toLowerCase().startsWith(proxyArtifact.bytecode.toLowerCase()),
    `${proxy}: creation transaction did not use approved proxy creation bytecode`
  );
  const encodedArgs = `0x${creation.transactionData.slice(proxyArtifact.bytecode.length)}`;
  const [createdImplementation, initializerData] = utils.defaultAbiCoder.decode(
    ["address", "bytes"],
    encodedArgs
  );
  const canonicalData = utils.hexConcat([
    proxyArtifact.bytecode,
    utils.defaultAbiCoder.encode(["address", "bytes"], [createdImplementation, initializerData]),
  ]);
  invariant(
    sameHex(canonicalData, creation.transactionData),
    `${proxy}: noncanonical proxy constructor data`
  );
  invariant(
    normalize(createdImplementation) === normalize(implementation),
    `${proxy}: constructor implementation mismatch`
  );
  invariant(initializerData !== "0x", `${proxy}: empty constructor initializer`);
  validateInitializer(initializerData);
  return creation.blockNumber;
}

function expectedAirdropImmutable(name: AirdropImmutableReference["name"], address: string) {
  const nameHash = utils.id("Airdrop");
  const versionHash = utils.id("1");
  const domainTypeHash = utils.id(
    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
  );
  const values: Record<AirdropImmutableReference["name"], string> = {
    cachedThis: utils.hexZeroPad(address, 32),
    cachedChainId: utils.hexZeroPad(utils.hexlify(1), 32),
    cachedNameHash: nameHash,
    cachedVersionHash: versionHash,
    cachedDomainSeparator: utils.keccak256(
      utils.defaultAbiCoder.encode(
        ["bytes32", "bytes32", "bytes32", "uint256", "address"],
        [domainTypeHash, nameHash, versionHash, 1, address]
      )
    ),
  };
  return values[name];
}

async function assertAirdropImplementation(
  provider: providers.JsonRpcProvider,
  address: string,
  expectedRuntimeHash: string,
  creationTransactionHash: string,
  artifact: ContractArtifact,
  identity: AirdropArtifactIdentity,
  blockTag: number
) {
  const code = await provider.getCode(address, blockTag);
  invariant(code !== "0x", `No Airdrop implementation code at ${address}`);
  const actualRuntimeHash = utils.keccak256(code);
  invariant(
    sameHex(actualRuntimeHash, expectedRuntimeHash),
    `Airdrop runtime hash mismatch; computed ${actualRuntimeHash}`
  );
  const normalizedCode = utils.arrayify(code);
  for (const reference of identity.immutableReferences) {
    invariant(reference.length === 32, "Unexpected Airdrop immutable width");
    const actual = utils.hexlify(
      normalizedCode.slice(reference.start, reference.start + reference.length)
    );
    invariant(
      sameHex(actual, expectedAirdropImmutable(reference.name, address)),
      `Airdrop immutable ${reference.name} mismatch`
    );
    normalizedCode.fill(0, reference.start, reference.start + reference.length);
  }
  invariant(
    sameHex(utils.keccak256(normalizedCode), identity.runtimeTemplateCodeHash),
    "Airdrop runtime is not the approved immutable template"
  );

  const creation = await assertDirectCreation(provider, creationTransactionHash, address, blockTag);
  invariant(
    sameHex(creation.transactionData, artifact.bytecode),
    "Airdrop implementation creation bytecode mismatch"
  );
}

async function getLogsInChunks(
  provider: providers.JsonRpcProvider,
  filter: providers.Filter,
  fromBlock: number,
  toBlock: number
) {
  const logs: providers.Log[] = [];
  for (let start = fromBlock; start <= toBlock; start += LOG_CHUNK_SIZE) {
    const end = Math.min(start + LOG_CHUNK_SIZE - 1, toBlock);
    logs.push(...(await provider.getLogs({ ...filter, fromBlock: start, toBlock: end })));
  }
  logs.sort(
    (left, right) =>
      left.blockNumber - right.blockNumber ||
      left.transactionIndex - right.transactionIndex ||
      left.logIndex - right.logIndex
  );
  return logs;
}

async function administrativeRoleMembers(
  provider: providers.JsonRpcProvider,
  accessControlAddress: string,
  fromBlock: number,
  toBlock: number
): Promise<RoleEvidence> {
  const iface = new utils.Interface(accessControlAbi);
  const eventTopics = [iface.getEventTopic("RoleGranted"), iface.getEventTopic("RoleRevoked")];
  const administrativeRoles = [
    DEFAULT_ADMIN_ROLE,
    VAULT_ADMIN_ROLE,
    BLACKLIST_OPERATOR_ROLE,
    GREENLIST_OPERATOR_ROLE,
  ];
  const logs = await getLogsInChunks(
    provider,
    {
      address: accessControlAddress,
      topics: [eventTopics, administrativeRoles],
    },
    fromBlock,
    toBlock
  );
  const members = new Map<string, Set<string>>();
  const observed = new Map<string, Set<string>>();

  for (const log of logs) {
    const parsed = iface.parseLog(log);
    const role = String(parsed.args.role).toLowerCase();
    const account = normalize(parsed.args.account);
    const set = members.get(role) ?? new Set<string>();
    const seen = observed.get(role) ?? new Set<string>();
    seen.add(account);
    if (parsed.name === "RoleGranted") set.add(account);
    else set.delete(account);
    members.set(role, set);
    observed.set(role, seen);
  }

  const canonicalLogs = logs.map((log) => ({
    blockNumber: log.blockNumber,
    blockHash: log.blockHash.toLowerCase(),
    transactionHash: log.transactionHash.toLowerCase(),
    transactionIndex: log.transactionIndex,
    logIndex: log.logIndex,
    topics: log.topics.map((topic) => topic.toLowerCase()),
    data: log.data.toLowerCase(),
  }));
  return {
    members,
    observed,
    evidenceHash: utils.keccak256(utils.toUtf8Bytes(JSON.stringify(canonicalLogs))),
  };
}

async function assertLiveRoleReconstruction(
  accessControl: Contract,
  evidence: RoleEvidence,
  blockTag: number
) {
  const call = { blockTag };
  for (const [role, accounts] of evidence.observed.entries()) {
    const expectedMembers = evidence.members.get(role) ?? new Set<string>();
    for (const account of accounts) {
      const live = await accessControl.hasRole(role, account, call);
      invariant(
        live === expectedMembers.has(account),
        `Role-log reconstruction disagrees with hasRole(${role}, ${account})`
      );
    }
  }
}

async function burnWaiverEvidence(
  provider: providers.JsonRpcProvider,
  couponTokenAddress: string,
  vaultAddress: string,
  usdcTokenAddress: string,
  tokenCreationBlock: number,
  vaultCreationBlock: number,
  toBlock: number
) {
  const tokenIface = new utils.Interface(tokenAbi);
  const vaultIface = new utils.Interface(vaultAbi);
  const mintLogs = await getLogsInChunks(
    provider,
    {
      address: couponTokenAddress,
      topics: [tokenIface.getEventTopic("Transfer"), utils.hexZeroPad(ethersZeroAddress(), 32)],
    },
    tokenCreationBlock,
    toBlock
  );
  const burnLogs = await getLogsInChunks(
    provider,
    {
      address: couponTokenAddress,
      topics: [
        tokenIface.getEventTopic("Transfer"),
        null,
        utils.hexZeroPad(ethersZeroAddress(), 32),
      ],
    },
    tokenCreationBlock,
    toBlock
  );
  const redemptionLogs = await getLogsInChunks(
    provider,
    {
      address: vaultAddress,
      topics: [vaultIface.getEventTopic("RedeemInstant")],
    },
    vaultCreationBlock,
    toBlock
  );

  let totalBurned = BigNumber.from(0);
  const burnsByTransaction = new Map<string, BigNumber>();
  for (const log of burnLogs) {
    const value = BigNumber.from(tokenIface.parseLog(log).args.value);
    totalBurned = totalBurned.add(value);
    const transactionHash = log.transactionHash.toLowerCase();
    burnsByTransaction.set(
      transactionHash,
      (burnsByTransaction.get(transactionHash) ?? BigNumber.from(0)).add(value)
    );
  }

  let redeemed = BigNumber.from(0);
  const redemptionsByTransaction = new Map<string, BigNumber>();
  for (const log of redemptionLogs) {
    const parsed = vaultIface.parseLog(log);
    invariant(
      normalize(parsed.args.tokenOut) === normalize(usdcTokenAddress),
      "Historical instant redemption used a non-USDC token"
    );
    invariant(BigNumber.from(parsed.args.feeAmount).isZero(), "Historical instant fee was nonzero");
    const amount = BigNumber.from(parsed.args.amount);
    redeemed = redeemed.add(amount);
    const transactionHash = log.transactionHash.toLowerCase();
    redemptionsByTransaction.set(
      transactionHash,
      (redemptionsByTransaction.get(transactionHash) ?? BigNumber.from(0)).add(amount)
    );
  }

  for (const [transactionHash, amount] of redemptionsByTransaction.entries()) {
    invariant(
      (burnsByTransaction.get(transactionHash) ?? BigNumber.from(0)).gte(amount),
      `Redemption burn is missing from transaction ${transactionHash}`
    );
  }
  invariant(totalBurned.gte(redeemed), "Redemption events exceed coupon burn logs");

  return {
    mintCount: mintLogs.length,
    totalMinted: mintLogs.reduce(
      (total, log) => total.add(tokenIface.parseLog(log).args.value),
      BigNumber.from(0)
    ),
    totalBurned,
    redeemed,
    waived: totalBurned.sub(redeemed),
  };
}

async function main() {
  const qualificationPath = process.argv[2];
  invariant(Boolean(qualificationPath), "Usage: npm run verify:stack -- <qualification.json>");
  const rpcUrl = process.env.ETHEREUM_RPC_URL;
  invariant(Boolean(rpcUrl), "ETHEREUM_RPC_URL is required; no private key is accepted");

  const qualification = JSON.parse(
    fs.readFileSync(path.resolve(qualificationPath), "utf8")
  ) as Qualification;
  invariant(qualification.chainId === 1, "Qualification chainId must be Ethereum mainnet (1)");
  invariant(
    normalize(qualification.usdcTokenAddress) === CANONICAL_USDC,
    "USDC is not canonical mainnet USDC"
  );

  const { manifest, manifestHash, artifacts } = loadApprovedRelease();
  invariant(
    sameHex(qualification.approvedReleaseManifestHash, manifestHash),
    `Qualification does not bind the repository-approved release manifest; computed ${manifestHash}`
  );

  const provider = new providers.JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();
  invariant(network.chainId === 1, `RPC chainId is ${network.chainId}, expected 1`);
  const finalized = await provider.send("eth_getBlockByNumber", ["finalized", false]);
  invariant(Boolean(finalized?.number), "RPC did not return a finalized block");
  const blockTag = BigNumber.from(finalized.number).toNumber();
  const call = { blockTag };

  await Promise.all([
    assertCodeHash(
      provider,
      qualification.vaultImplementationAddress,
      manifest.artifacts.redemptionVault.runtimeCodeHash,
      blockTag
    ),
    assertCodeHash(
      provider,
      qualification.accessControlImplementationAddress,
      manifest.artifacts.midasAccessControl.runtimeCodeHash,
      blockTag
    ),
    assertCodeHash(
      provider,
      qualification.couponTokenImplementationAddress,
      manifest.artifacts.tokenERC20.runtimeCodeHash,
      blockTag
    ),
  ]);

  await assertAirdropImplementation(
    provider,
    qualification.airdropImplementationAddress,
    qualification.airdropImplementationRuntimeCodeHash,
    qualification.airdropImplementationCreationTransactionHash,
    artifacts.airdrop,
    manifest.artifacts.airdrop,
    blockTag
  );

  const initialSupply = BigNumber.from(qualification.initialCouponSupplyBaseUnits);
  invariant(
    initialSupply.gt(0) && initialSupply.mod(COUPON_PER_USDC_BASE_UNIT).isZero(),
    "Invalid initial supply"
  );

  const tokenCreationBlock = await assertLockedProxy(
    provider,
    qualification.couponTokenAddress,
    qualification.couponTokenImplementationAddress,
    qualification.couponTokenProxyCreationTransactionHash,
    artifacts.proxy,
    manifest.artifacts.erc1967Proxy.runtimeCodeHash,
    blockTag,
    (initializerData) => {
      const { values } = strictDecodeInitializer(artifacts.token, initializerData);
      invariant(normalize(values[0]) !== ethersZeroAddress(), "Token initial admin was zero");
      invariant(values[4].length === 0, "Token trusted-forwarder list is not empty");
      invariant(
        BigNumber.from(values[7]).isZero(),
        "Token platform fee was not initialized to zero"
      );
    }
  );

  const accessControlCreationBlock = await assertLockedProxy(
    provider,
    qualification.accessControlAddress,
    qualification.accessControlImplementationAddress,
    qualification.accessControlProxyCreationTransactionHash,
    artifacts.proxy,
    manifest.artifacts.erc1967Proxy.runtimeCodeHash,
    blockTag,
    (initializerData) => {
      const iface = new utils.Interface(artifacts.accessControl.abi as utils.Fragment[]);
      invariant(
        sameHex(initializerData, iface.encodeFunctionData("initialize")),
        "Access-control initializer mismatch"
      );
    }
  );

  const vaultCreationBlock = await assertLockedProxy(
    provider,
    qualification.vaultAddress,
    qualification.vaultImplementationAddress,
    qualification.vaultProxyCreationTransactionHash,
    artifacts.proxy,
    manifest.artifacts.erc1967Proxy.runtimeCodeHash,
    blockTag,
    (initializerData) => {
      const { values } = strictDecodeInitializer(artifacts.vault, initializerData);
      invariant(
        normalize(values[0]) === normalize(qualification.accessControlAddress),
        "Vault initializer access control mismatch"
      );
      invariant(
        normalize(values[1][0]) === normalize(qualification.couponTokenAddress) &&
          normalize(values[1][1]) === ethersZeroAddress(),
        "Vault initializer must name the coupon token and no data feed"
      );
      invariant(
        BigNumber.from(values[3][0]).isZero() && BigNumber.from(values[3][1]).eq(initialSupply),
        "Vault initializer instant profile mismatch"
      );
      invariant(
        BigNumber.from(values[6]).eq(COUPON_PER_USDC_BASE_UNIT),
        "Vault initializer minimum mismatch"
      );
      invariant(
        BigNumber.from(values[7][0]).isZero() && BigNumber.from(values[7][1]).isZero(),
        "Vault initializer fiat fee mismatch"
      );
    }
  );

  await assertLockedProxy(
    provider,
    qualification.airdropAddress,
    qualification.airdropImplementationAddress,
    qualification.airdropProxyCreationTransactionHash,
    artifacts.proxy,
    manifest.artifacts.erc1967Proxy.runtimeCodeHash,
    blockTag,
    (initializerData) => {
      const { values } = strictDecodeInitializer(artifacts.airdrop, initializerData);
      invariant(normalize(values[0]) !== ethersZeroAddress(), "Airdrop initial owner was zero");
    }
  );

  const vault = new Contract(qualification.vaultAddress, vaultAbi, provider);
  const accessControl = new Contract(
    qualification.accessControlAddress,
    accessControlAbi,
    provider
  );
  const couponToken = new Contract(qualification.couponTokenAddress, tokenAbi, provider);
  const usdc = new Contract(qualification.usdcTokenAddress, erc20Abi, provider);
  const airdrop = new Contract(qualification.airdropAddress, airdropAbi, provider);

  const [
    configuredCoupon,
    configuredAccessControl,
    configuredCouponFeed,
    paused,
    greenlistEnabled,
    instantFee,
    dailyLimit,
    onchainInitialSupply,
    minimum,
    paymentTokens,
    tokenConfig,
    couponDecimals,
    currentSupply,
    usdcDecimals,
    reserve,
    airdropOwner,
    couponMerkleRoot,
    usdcMerkleRoot,
  ] = await Promise.all([
    vault.mToken(call),
    vault.accessControl(call),
    vault.mTokenDataFeed(call),
    vault.paused(call),
    vault.greenlistEnabled(call),
    vault.instantFee(call),
    vault.instantDailyLimit(call),
    vault.initialCouponSupply(call),
    vault.minAmount(call),
    vault.getPaymentTokens(call),
    vault.tokensConfig(qualification.usdcTokenAddress, call),
    couponToken.decimals(call),
    couponToken.totalSupply(call),
    usdc.decimals(call),
    usdc.balanceOf(qualification.vaultAddress, call),
    airdrop.owner(call),
    airdrop.tokenMerkleRoot(qualification.couponTokenAddress, call),
    airdrop.tokenMerkleRoot(qualification.usdcTokenAddress, call),
  ]);

  invariant(
    normalize(configuredCoupon) === normalize(qualification.couponTokenAddress),
    "Vault coupon token mismatch"
  );
  invariant(
    normalize(configuredAccessControl) === normalize(qualification.accessControlAddress),
    "Vault access control mismatch"
  );
  invariant(
    normalize(configuredCouponFeed) === ethersZeroAddress(),
    "Vault still names a coupon data feed"
  );
  invariant(paused === true, "Vault is not permanently paused");
  invariant(greenlistEnabled === true, "Greenlist is disabled");
  invariant(BigNumber.from(instantFee).isZero(), "Instant fee is nonzero");
  invariant(
    BigNumber.from(dailyLimit).eq(initialSupply),
    "Daily limit differs from initial supply"
  );
  invariant(
    BigNumber.from(onchainInitialSupply).eq(initialSupply),
    "Stored initial supply mismatch"
  );
  invariant(BigNumber.from(minimum).eq(COUPON_PER_USDC_BASE_UNIT), "Minimum is not 1e12");
  invariant(
    paymentTokens.length === 1 && normalize(paymentTokens[0]) === CANONICAL_USDC,
    "Payment-token set is not canonical-USDC-only"
  );
  invariant(
    normalize(tokenConfig.dataFeed) === ethersZeroAddress(),
    "USDC payment token still names a data feed"
  );
  invariant(tokenConfig.stable === false, "USDC payment token is marked stable-oracle");
  invariant(BigNumber.from(tokenConfig.fee).isZero(), "USDC fee is nonzero");
  invariant(Number(couponDecimals) === 18 && Number(usdcDecimals) === 6, "Token decimals mismatch");
  invariant(
    BigNumber.from(currentSupply).lte(initialSupply),
    "Current coupon supply exceeds initial supply"
  );
  invariant(normalize(airdropOwner) === ethersZeroAddress(), "Airdrop owner is not zero");
  invariant(
    BigNumber.from(couponMerkleRoot).isZero() && BigNumber.from(usdcMerkleRoot).isZero(),
    "Airdrop claim root remains configured"
  );
  for (const role of [DEFAULT_ADMIN_ROLE, MINTER_ROLE]) {
    invariant(
      BigNumber.from(await couponToken.getRoleMemberCount(role, call)).isZero(),
      `Coupon token role ${role} still has members`
    );
  }
  invariant(
    BigNumber.from(await couponToken.getRoleMemberCount(TRANSFER_ROLE, call)).eq(1),
    "Unexpected transfer-role member count"
  );
  invariant(
    normalize(await couponToken.getRoleMember(TRANSFER_ROLE, 0, call)) === ethersZeroAddress(),
    "Public transfers are not the sole transfer role"
  );

  const roleEvidence = await administrativeRoleMembers(
    provider,
    qualification.accessControlAddress,
    accessControlCreationBlock,
    blockTag
  );
  invariant(
    sameHex(roleEvidence.evidenceHash, qualification.lockEvidenceHash),
    `Role log evidence does not match lockEvidenceHash; computed ${roleEvidence.evidenceHash}`
  );
  await assertLiveRoleReconstruction(accessControl, roleEvidence, blockTag);
  for (const role of [DEFAULT_ADMIN_ROLE, VAULT_ADMIN_ROLE, BLACKLIST_OPERATOR_ROLE]) {
    invariant(
      (roleEvidence.members.get(role.toLowerCase())?.size ?? 0) === 0,
      `Administrative role ${role} still has members`
    );
  }
  const greenlistOperators =
    roleEvidence.members.get(GREENLIST_OPERATOR_ROLE.toLowerCase()) ?? new Set<string>();
  invariant(greenlistOperators.size === 1, "Expected exactly one greenlist operator");
  invariant(
    greenlistOperators.has(normalize(qualification.greenlistOperatorAddress)),
    "Unexpected greenlist operator"
  );
  invariant(
    await accessControl.hasRole(
      GREENLIST_OPERATOR_ROLE,
      qualification.greenlistOperatorAddress,
      call
    ),
    "Configured greenlist operator is not live"
  );

  const roleAdminChecks: Array<[string, string]> = [
    [DEFAULT_ADMIN_ROLE, DEFAULT_ADMIN_ROLE],
    [VAULT_ADMIN_ROLE, DEFAULT_ADMIN_ROLE],
    [BLACKLIST_OPERATOR_ROLE, DEFAULT_ADMIN_ROLE],
    [GREENLIST_OPERATOR_ROLE, DEFAULT_ADMIN_ROLE],
    [GREENLISTED_ROLE, GREENLIST_OPERATOR_ROLE],
    [BLACKLISTED_ROLE, BLACKLIST_OPERATOR_ROLE],
  ];
  for (const [role, expectedAdmin] of roleAdminChecks) {
    invariant(
      sameHex(await accessControl.getRoleAdmin(role, call), expectedAdmin),
      `Unexpected role admin for ${role}`
    );
  }

  const burnEvidence = await burnWaiverEvidence(
    provider,
    qualification.couponTokenAddress,
    qualification.vaultAddress,
    qualification.usdcTokenAddress,
    tokenCreationBlock,
    vaultCreationBlock,
    blockTag
  );
  const supply = BigNumber.from(currentSupply);
  const allowance = BigNumber.from(tokenConfig.allowance);
  const reserveAmount = BigNumber.from(reserve);
  invariant(
    burnEvidence.mintCount === 1 && burnEvidence.totalMinted.eq(initialSupply),
    "Coupon supply was not minted once in the exact initial amount"
  );
  invariant(
    initialSupply.sub(supply).eq(burnEvidence.totalBurned),
    "Coupon supply reduction does not match complete burn logs"
  );
  invariant(
    allowance.eq(initialSupply.sub(burnEvidence.redeemed)),
    "Internal allowance does not match vault redemption logs"
  );
  invariant(
    allowance.gte(supply) && allowance.sub(supply).eq(burnEvidence.waived),
    "Internal allowance surplus does not exactly equal waived claims"
  );
  invariant(
    allowance.mod(COUPON_PER_USDC_BASE_UNIT).isZero(),
    "Internal allowance is not USDC-aligned"
  );
  invariant(
    reserveAmount.eq(allowance.div(COUPON_PER_USDC_BASE_UNIT)),
    "USDC reserve does not exactly cover internal allowance"
  );
  const remainingLiability = supply.div(COUPON_PER_USDC_BASE_UNIT);
  const reserveSurplus = reserveAmount.sub(remainingLiability);
  const expectedWaiverSurplus = burnEvidence.waived.isZero()
    ? BigNumber.from(0)
    : burnEvidence.waived.add(COUPON_PER_USDC_BASE_UNIT.sub(1)).div(COUPON_PER_USDC_BASE_UNIT);
  invariant(
    reserveSurplus.eq(expectedWaiverSurplus),
    "Reserve surplus is not fully explained by claim-waiver burn logs"
  );

  console.log(`Locked coupon stack ${manifest.releaseId} verified at finalized block ${blockTag}.`);
  console.log(
    `Claim waivers: ${burnEvidence.waived.toString()} coupon base units; ` +
      `proven reserve surplus: ${reserveSurplus.toString()} USDC base units.`
  );
}

function ethersZeroAddress() {
  return "0x0000000000000000000000000000000000000000";
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
