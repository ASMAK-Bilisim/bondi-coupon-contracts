# Deployment and lock runbook

This is a review checklist, not authorization to deploy or transact. Production execution requires
an independently reviewed release artifact and an approved runbook instance containing exact
addresses, hashes and signers.

## 1. Freeze event inputs

1. Finalize the coupon snapshot only after Bondi-controlled Uniswap v3 liquidity is removed and
   the finalized residual-pool policy passes.
2. Classify every entitled address exactly once into Rail A or Rail B.
3. Require every amount to conserve value and every Rail B amount to be divisible by `1e12`.
4. Freeze the manifests, Merkle/conservation roots, snapshot block/hash and configuration hash.

## 2. Build the isolated stack while unfunded

1. From a clean, pinned source commit, reproduce and verify TokenERC20 5.0.4, Airdrop 2.0.2 and all
   Bondi artifacts with `npm run compile && npm run verify:release`.
2. An independent reviewer must reproduce every manifest hash, pin the reviewed source commit and
   change the release manifest from `candidate` to `approved` before deployment.
3. Deploy each implementation, then initialize its dedicated OpenZeppelin 4.9.6 `ERC1967Proxy` in
   the proxy constructor using `scripts/deploy-initialized-proxy.ts`. That helper refuses empty
   initializer data. The published OpenZeppelin constructor still accepts `0x`; qualification must
   reject any such creation transaction. Record every direct creation transaction hash, including
   the Airdrop implementation transaction needed to prove its Solady EIP-712 runtime immutables.
4. TokenERC20 initialization must encode an empty trusted-forwarder array. Decode and review the
   creation transaction before minting.
5. Mint the exact Rail B TokenERC20 supply once.
6. Configure the vault with zero fees, minimum `1e12`, internal USDC allowance equal to initial
   coupon supply, and `instantDailyLimit` equal to initial coupon supply. Pass the zero address for
   `mTokenDataFeed` and for each `addPaymentToken` data-feed argument. Do not deploy a feed.
7. Add canonical Ethereum USDC only and enable greenlisting.

## 3. Distribute and reconcile

1. Give the Airdrop only exact, per-batch ERC-20 allowances.
2. Push Rail A USDC and Rail B coupon tokens from the approved distribution account.
3. Reconcile each transaction against the frozen manifest and ERC-20 logs before continuing. Do not
   resubmit a batch merely because an RPC response was lost.
4. Confirm the sum of Rail B balances and all coupon burn logs equals the initial coupon supply.
   Classify burns not matched by a vault `RedeemInstant` log as irrevocable claim waivers.
5. Set Airdrop owner to the zero address and verify owner-only calls revert.

## 4. Remove authority

1. While `DEFAULT_ADMIN_ROLE` is still live, grant `GREENLIST_OPERATOR_ROLE` to exactly one reviewed
   operational identity. Do not grant it to the deployer unless that identity is the intended
   operator.
2. Confirm `getRoleAdmin(GREENLIST_OPERATOR_ROLE)` remains `DEFAULT_ADMIN_ROLE`.
3. Remove TokenERC20 `MINTER_ROLE` and every `DEFAULT_ADMIN_ROLE` holder.
4. Remove every `REDEMPTION_VAULT_ADMIN_ROLE` holder.
5. Remove every access-control `DEFAULT_ADMIN_ROLE` holder.
6. Verify the only operational authority left is that single greenlist operator. After this step the
   operator can manage `GREENLISTED_ROLE` only. It cannot grant or revoke `GREENLIST_OPERATOR_ROLE`,
   and `renounceRole` remains forbidden. Lost-key replacement requires a new event stack.
7. Verify every proxy has the approved OpenZeppelin ERC1967 runtime hash, its ERC1967 admin slot is
   zero, and its implementation has the independently approved runtime hash.
8. Derive the access-control creation block from its canonical direct-creation receipt using an
   archive RPC. Scan chunked role grant/revoke logs from that block through one finalized block,
   cross-check every observed membership with live `hasRole`, and publish `lockEvidenceHash`.

The final greenlist operator should be a reviewed recoverable operational identity. The external
mirror must apply both additions and revocations within the separately approved SLO. No remaining
function grants economic or code authority.

## 5. Test before full reserve funding

1. Run the unfunded fork/configuration checks against the exact deployment. Final locked-stack
   verification also proves reserve equality and therefore runs after final reserve funding.
2. Run the full read/write matrix on an Ethereum mainnet fork using the exact deployment.
3. While the locked vault is still empty, send only a very small canonical-USDC canary.
4. Perform one real greenlisted, exact-approval redemption.
5. If it fails, abandon only that canary and redeploy; the locked stack cannot be repaired.
6. If it succeeds, fund the vault to exactly `internal USDC allowance / 1e12`. The successful
   canary reduced both allowance and supply. Holder-initiated burns did not reduce allowance: they
   are claim waivers whose corresponding reserve remains permanent surplus.
7. Re-run finalized-state verification. It must prove from complete burn and redemption logs that
   allowance exceeds remaining supply only by waived claims and that reserve surplus exactly
   matches those waivers. Publish the canary, funding and evidence transactions.

## 6. Enable consumers

Only after all prior steps pass may the frontend receive an event-specific qualification record.
Its production `enabled` flag stays false until the founder approves the final configuration hash.
