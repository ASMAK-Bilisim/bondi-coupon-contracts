# Qualification and deployment evidence

This process is read-only and accepts no private key. It does not authorize deployment. A candidate
release or a partially populated qualification record must fail closed.

## 1. Approve one reproducible release

`config/release-manifest.json` pins creation and runtime hashes for OpenZeppelin `ERC1967Proxy`, the
vault, access control and TokenERC20. Airdrop's Solady EIP-712 base embeds the implementation
address, chain ID and domain cache in runtime immutables, so its entry pins the exact creation hash,
normalized runtime template and all five compiler-reported immutable offsets.

The checked-in record intentionally starts with `approvalStatus: candidate`. An independent reviewer
must:

1. check out the proposed clean source commit;
2. use Node 22 and run `npm ci`, `npm run compile`, `npm run verify:release` and the full check suite;
3. reproduce every creation/runtime hash independently;
4. record that 40-hex reviewed source commit in `sourceCommit`;
5. change only the manifest approval metadata to `approved`; and
6. publish and review the resulting manifest hash.

The qualification JSON must contain that exact `approvedReleaseManifestHash`. Implementation hashes
cannot be supplied or substituted by an event deployer.

## 2. Authenticate creation

The qualification record contains direct creation transaction hashes for all four proxies. The
verifier requires each receipt to be successful, canonical and finalized, to create the stated
address, and to have no destination address. An archive RPC must show that the address had no code in
the preceding block.

For every proxy, the verifier checks exact approved proxy creation and runtime bytecode, decodes the
constructor `(implementation, initializationData)`, rejects empty or noncanonical data, and compares
the live EIP-1967 implementation/admin slots. It then decodes the component initializer. TokenERC20's
trusted-forwarder array must be empty.

For the Airdrop implementation, the verifier authenticates the direct creation transaction, checks
each EIP-712 cached immutable against the implementation address and Ethereum chain ID, and compares
the normalized runtime with the approved template.

The vault initializer must name the coupon token and the zero address as `mTokenDataFeed`. Live
state must show that coupon and USDC feed slots are empty. Payout is the vault's hardcoded 1:1 rate.

## 3. Reconstruct authority

The access-control role scan begins at the authenticated proxy creation receipt—not a caller-supplied
block. Logs are queried in bounded chunks through one finalized block. The deterministic
`lockEvidenceHash` covers every grant/revoke log for default admin, vault admin, blacklist operator
and greenlist operator. Every observed final membership is cross-checked using `hasRole`, and the
complete expected role-admin graph is checked live.

Exactly one live greenlist operator may remain. Default admin, vault admin and blacklist operator
must have no members. `GREENLIST_OPERATOR_ROLE`'s admin must still be `DEFAULT_ADMIN_ROLE`.

## 4. Prove claim waivers and reserve

The verifier scans coupon burns and vault instant-redemption events from their authenticated creation
blocks. A coupon burn without a matching vault redemption is a claim waiver. It checks:

```text
total burns = initial supply - current supply
internal allowance = initial supply - vault redemptions
internal allowance - current supply = claim waivers
USDC reserve = internal allowance / 1e12
reserve surplus over remaining redeemable supply = ceil(claim waivers / 1e12)
```

The mismatch errors print the computed release or role-evidence hash needed to assemble the
candidate record. Those values still require independent review and founder approval before the
frontend may enable the event.
