// SPDX-License-Identifier: AGPL-3.0-or-later
import fs from "node:fs";
import path from "node:path";

import { BigNumber, Contract, providers, utils } from "ethers";

const CANONICAL_USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const DEFAULT_ADMIN_ROLE = utils.hexZeroPad("0x00", 32);
const MINTER_ROLE = utils.id("MINTER_ROLE");
const TRANSFER_ROLE = utils.id("TRANSFER_ROLE");
const VAULT_ADMIN_ROLE = utils.id("REDEMPTION_VAULT_ADMIN_ROLE");
const BLACKLIST_OPERATOR_ROLE = utils.id("BLACKLIST_OPERATOR_ROLE");
const GREENLIST_OPERATOR_ROLE = utils.id("GREENLIST_OPERATOR_ROLE");
const ONE = BigNumber.from(10).pow(18);
const COUPON_PER_USDC_BASE_UNIT = BigNumber.from(10).pow(12);

const IMPLEMENTATION_SLOT = BigNumber.from(
  utils.keccak256(utils.toUtf8Bytes("eip1967.proxy.implementation"))
)
  .sub(1)
  .toHexString();
const ADMIN_SLOT = BigNumber.from(utils.keccak256(utils.toUtf8Bytes("eip1967.proxy.admin")))
  .sub(1)
  .toHexString();

interface Qualification {
  chainId: 1;
  deploymentBlockNumber: number;
  vaultAddress: string;
  vaultImplementationAddress: string;
  vaultImplementationRuntimeCodeHash: string;
  accessControlAddress: string;
  accessControlImplementationAddress: string;
  accessControlImplementationRuntimeCodeHash: string;
  couponTokenAddress: string;
  couponTokenImplementationAddress: string;
  couponTokenImplementationRuntimeCodeHash: string;
  airdropAddress: string;
  airdropImplementationAddress: string;
  airdropImplementationRuntimeCodeHash: string;
  couponDataFeedAddress: string;
  usdcDataFeedAddress: string;
  usdcTokenAddress: string;
  initialCouponSupplyBaseUnits: string;
  greenlistOperatorAddress: string;
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
];
const accessControlAbi = [
  "function hasRole(bytes32 role,address account) view returns (bool)",
  "event RoleGranted(bytes32 indexed role,address indexed account,address indexed sender)",
  "event RoleRevoked(bytes32 indexed role,address indexed account,address indexed sender)",
];
const tokenAbi = [
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function getRoleMemberCount(bytes32 role) view returns (uint256)",
  "function getRoleMember(bytes32 role,uint256 index) view returns (address)",
];
const erc20Abi = [
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
];
const feedAbi = [
  "function asset() view returns (address)",
  "function getDataInBase18() view returns (uint256)",
  "function feedAdminRole() view returns (bytes32)",
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

function slotAddress(value: string) {
  return normalize(utils.hexDataSlice(value, 12));
}

async function assertCodeHash(
  provider: providers.JsonRpcProvider,
  address: string,
  expectedHash: string,
  blockTag: number
) {
  const code = await provider.getCode(address, blockTag);
  invariant(code !== "0x", `No code at ${address}`);
  invariant(utils.keccak256(code) === expectedHash, `Runtime code hash mismatch at ${address}`);
}

async function assertLockedProxy(
  provider: providers.JsonRpcProvider,
  proxy: string,
  implementation: string,
  blockTag: number
) {
  const [implementationValue, adminValue] = await Promise.all([
    provider.getStorageAt(proxy, IMPLEMENTATION_SLOT, blockTag),
    provider.getStorageAt(proxy, ADMIN_SLOT, blockTag),
  ]);
  invariant(
    slotAddress(implementationValue) === normalize(implementation),
    `${proxy}: wrong implementation`
  );
  invariant(BigNumber.from(adminValue).isZero(), `${proxy}: EIP-1967 admin slot is not zero`);
}

async function administrativeRoleMembers(
  provider: providers.JsonRpcProvider,
  accessControlAddress: string,
  fromBlock: number,
  toBlock: number
) {
  const iface = new utils.Interface(accessControlAbi);
  const topics = [iface.getEventTopic("RoleGranted"), iface.getEventTopic("RoleRevoked")];
  const logs = await provider.getLogs({
    address: accessControlAddress,
    fromBlock,
    toBlock,
    topics: [topics],
  });
  const members = new Map<string, Set<string>>();

  for (const log of logs) {
    const parsed = iface.parseLog(log);
    const role = String(parsed.args.role).toLowerCase();
    const account = normalize(parsed.args.account);
    const set = members.get(role) ?? new Set<string>();
    if (parsed.name === "RoleGranted") set.add(account);
    else set.delete(account);
    members.set(role, set);
  }

  return members;
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

  const provider = new providers.JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();
  invariant(network.chainId === 1, `RPC chainId is ${network.chainId}, expected 1`);
  const finalized = await provider.send("eth_getBlockByNumber", ["finalized", false]);
  invariant(Boolean(finalized?.number), "RPC did not return a finalized block");
  const blockTag = BigNumber.from(finalized.number).toNumber();

  const implementationChecks: Array<[string, string]> = [
    [qualification.vaultImplementationAddress, qualification.vaultImplementationRuntimeCodeHash],
    [
      qualification.accessControlImplementationAddress,
      qualification.accessControlImplementationRuntimeCodeHash,
    ],
    [
      qualification.couponTokenImplementationAddress,
      qualification.couponTokenImplementationRuntimeCodeHash,
    ],
    [
      qualification.airdropImplementationAddress,
      qualification.airdropImplementationRuntimeCodeHash,
    ],
  ];
  for (const [address, expectedHash] of implementationChecks) {
    await assertCodeHash(provider, address, expectedHash, blockTag);
  }

  await Promise.all([
    assertLockedProxy(
      provider,
      qualification.vaultAddress,
      qualification.vaultImplementationAddress,
      blockTag
    ),
    assertLockedProxy(
      provider,
      qualification.accessControlAddress,
      qualification.accessControlImplementationAddress,
      blockTag
    ),
    assertLockedProxy(
      provider,
      qualification.couponTokenAddress,
      qualification.couponTokenImplementationAddress,
      blockTag
    ),
    assertLockedProxy(
      provider,
      qualification.airdropAddress,
      qualification.airdropImplementationAddress,
      blockTag
    ),
  ]);

  const call = { blockTag };
  const vault = new Contract(qualification.vaultAddress, vaultAbi, provider);
  const accessControl = new Contract(
    qualification.accessControlAddress,
    accessControlAbi,
    provider
  );
  const couponToken = new Contract(qualification.couponTokenAddress, tokenAbi, provider);
  const usdc = new Contract(qualification.usdcTokenAddress, erc20Abi, provider);
  const couponFeed = new Contract(qualification.couponDataFeedAddress, feedAbi, provider);
  const usdcFeed = new Contract(qualification.usdcDataFeedAddress, feedAbi, provider);
  const airdrop = new Contract(qualification.airdropAddress, airdropAbi, provider);

  const initialSupply = BigNumber.from(qualification.initialCouponSupplyBaseUnits);
  invariant(
    initialSupply.gt(0) && initialSupply.mod(COUPON_PER_USDC_BASE_UNIT).isZero(),
    "Invalid initial supply"
  );

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
    couponRate,
    usdcRate,
    couponFeedAsset,
    usdcFeedAsset,
    couponFeedAdmin,
    usdcFeedAdmin,
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
    couponFeed.getDataInBase18(call),
    usdcFeed.getDataInBase18(call),
    couponFeed.asset(call),
    usdcFeed.asset(call),
    couponFeed.feedAdminRole(call),
    usdcFeed.feedAdminRole(call),
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
    normalize(configuredCouponFeed) === normalize(qualification.couponDataFeedAddress),
    "Vault coupon feed mismatch"
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
    normalize(tokenConfig.dataFeed) === normalize(qualification.usdcDataFeedAddress),
    "USDC feed mismatch"
  );
  invariant(BigNumber.from(tokenConfig.fee).isZero(), "USDC fee is nonzero");
  invariant(Number(couponDecimals) === 18 && Number(usdcDecimals) === 6, "Token decimals mismatch");
  invariant(
    BigNumber.from(currentSupply).lte(initialSupply),
    "Current coupon supply exceeds initial supply"
  );
  invariant(
    BigNumber.from(tokenConfig.allowance).eq(currentSupply),
    "Internal allowance does not equal outstanding supply"
  );
  invariant(
    BigNumber.from(reserve).gte(BigNumber.from(currentSupply).div(COUPON_PER_USDC_BASE_UNIT)),
    "USDC reserve is insufficient"
  );
  invariant(
    BigNumber.from(couponRate).eq(ONE) && BigNumber.from(usdcRate).eq(ONE),
    "A fixed feed is not $1"
  );
  invariant(
    normalize(couponFeedAsset) === normalize(qualification.couponTokenAddress),
    "Coupon feed asset mismatch"
  );
  invariant(normalize(usdcFeedAsset) === CANONICAL_USDC, "USDC feed asset mismatch");
  invariant(
    BigNumber.from(couponFeedAdmin).isZero() && BigNumber.from(usdcFeedAdmin).isZero(),
    "A feed reports an admin role"
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

  const roleMembers = await administrativeRoleMembers(
    provider,
    qualification.accessControlAddress,
    qualification.deploymentBlockNumber,
    blockTag
  );
  for (const role of [DEFAULT_ADMIN_ROLE, VAULT_ADMIN_ROLE, BLACKLIST_OPERATOR_ROLE]) {
    invariant(
      (roleMembers.get(role.toLowerCase())?.size ?? 0) === 0,
      `Administrative role ${role} still has members`
    );
  }
  const greenlistOperators =
    roleMembers.get(GREENLIST_OPERATOR_ROLE.toLowerCase()) ?? new Set<string>();
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
    "Configured greenlist operator role is not live"
  );

  console.log(`Locked coupon stack verified at finalized block ${blockTag}.`);
}

function ethersZeroAddress() {
  return "0x0000000000000000000000000000000000000000";
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
