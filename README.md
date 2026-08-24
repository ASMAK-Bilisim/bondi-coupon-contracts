# Bondi coupon contracts

Public source for Bondi Finance coupon distribution and Rail B coupon-token redemption.

> **Not production qualified.** Nothing in this repository has been deployed, configured,
> funded, signed or submitted to Ethereum mainnet. Do not deploy this stack until the modified
> Midas dependency tree and integration have received a focused audit, the full fork matrix has
> passed, the lock evidence has been independently reviewed, and the canary procedure has passed.

## What is included

- Bondi's coupon-specific Midas `RedemptionVault`, continued from
  [`midas-apps/contracts@bfe2b5f`](https://github.com/midas-apps/contracts/tree/bfe2b5f067f8223164f59e34be3b00b3b832d24a).
- OpenZeppelin 4.9.6 `PausableUpgradeable` in place of Midas's `UNLICENSED`
  `contracts/access/Pausable.sol`. The unlicensed file and its Git history are not present here.
- The allowance-based `burnFrom(holder, amount)` adaptation required by thirdweb TokenERC20.
- Hardcoded 1:1 coupon-to-USDC redemption in the vault. There is no data-feed contract.
- Exact published source and compiler manifests for:
  - thirdweb TokenERC20 5.0.4;
  - thirdweb Airdrop 2.0.2, using only its owner-push `airdropERC20` path.
- OpenZeppelin 4.9.6 `ERC1967Proxy` as the proxy, without a Bondi subclass. Empty-initializer
  rejection is enforced by the deploy helper and fail-closed qualification.
- Tests for Rail A USDC distribution, Rail B coupon-token distribution, permanent route disabling,
  exact approvals, burns, payouts, lock behavior and a single remaining greenlist operator.

The seven-bond catalogue belongs in Bondi's frontend/configuration repository. These contracts are
event-generic: each coupon event gets its own isolated token, access control and vault stack.

## Intended flow

1. The finalized holder snapshot is partitioned exactly once.
2. The pinned thirdweb Airdrop pushes canonical USDC to Rail A wallets and the event's transferable
   TokenERC20 coupon token to Rail B wallets.
3. The Airdrop owner is set to the zero address after every reconciled distribution batch.
4. A Rail B holder that is greenlisted approves the event vault for an exact coupon amount.
5. The holder calls `redeemInstant(usdc, couponAmount, couponAmount)`.
6. The vault consumes that exact allowance with `burnFrom` and transfers exact USDC to `msg.sender`
   atomically.

There is no custom recipient, request redemption, fiat redemption, deadline, market maker, Safe
signature per redemption, or operator-submitted holder transaction.

## Hard security properties

- Coupon token decimals: 18. USDC decimals: 6.
- `1e12` coupon base units redeem for exactly one USDC base unit. The vault hardcodes that rate and
  rejects any named data feed.
- Redemptions below `1e12`, non-`1e12` multiples and non-exact minimum outputs revert.
- Instant and payment-token fees must remain zero.
- Greenlisting must be enabled on every successful redemption.
- The vault starts permanently paused. Only the approved three-argument same-wallet path omits
  `whenNotPaused`; custom-recipient, request and fiat paths can never execute.
- ERC1967 proxies are the published OpenZeppelin 4.9.6 contract: non-administrable, no upgrade
  function, and initialized in the creation transaction. Qualification rejects empty initializer
  data because the OpenZeppelin constructor allows it.
- After setup, vault admin, default admin, token minter and token admin roles must have no members.
- The only surviving operational authority is one `GREENLIST_OPERATOR_ROLE` member, granted before
  default admin is removed. Upstream Midas access control keeps default admin as that role's admin,
  so after lock the operator can manage `GREENLISTED_ROLE` only. It cannot add operators, remove
  itself, restore vault, mint or upgrade powers. Lost-key recovery is operational, not
  onchain.

See [security invariants](docs/SECURITY_INVARIANTS.md) and the
[deployment and lock runbook](docs/DEPLOYMENT_AND_LOCK_RUNBOOK.md).

## Verify locally

Use Node 22 LTS.

```bash
npm ci
npm run check
```

`thirdweb:verify` rebuilds TokenERC20 5.0.4 and Airdrop 2.0.2 with solc 0.8.23 from
their exact published compiler manifests. It fails unless every source hash and the complete
creation bytecode match the official published artifacts.

`verify:release` checks compiled creation/runtime bytecode against the repository-pinned release
manifest. The checked-in manifest remains a candidate until an independent reviewer pins the
reviewed source commit and changes its status to `approved`.

After an event is deployed and locked, the read-only verifier accepts an archive-capable public RPC
URL and a qualification record. It authenticates direct creation transactions, constructor
initializers, proxy runtime code, the complete administrative role history, and claim-waiver
burn evidence. It never accepts a private key:

```bash
ETHEREUM_RPC_URL=https://... npm run verify:stack -- qualification.json
```

See [qualification evidence](docs/QUALIFICATION_EVIDENCE.md) for the release approval and
deployment-evidence procedure.

Hardhat is a development-only dependency. Production deployment artifacts must be generated in a
reviewed, reproducible release process, not from a developer's mutable environment.

## Licensing and provenance

New Bondi-authored material is AGPL-3.0-or-later. Midas-derived files retain their upstream MIT
SPDX identifiers. Exact thirdweb sources retain Apache-2.0 identifiers; OpenZeppelin and Solady are
MIT. See [the file-by-file review](docs/LICENSING_REVIEW.md),
[third-party notices](THIRD_PARTY_NOTICES.md), and the machine-readable manifests in
[`provenance/`](provenance/).

The public-repository decision does not expand the license of any excluded upstream file. In
particular, Midas's `UNLICENSED` pauser is excluded rather than relicensed.
