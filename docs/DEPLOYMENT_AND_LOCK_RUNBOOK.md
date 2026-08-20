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

1. Reproduce and verify the published TokenERC20 5.0.4 and Airdrop 2.0.2 bytecode with
   `npm run thirdweb:verify`.
2. Deploy each implementation, then initialize its dedicated non-administrable ERC1967 proxy in
   the proxy constructor. Never leave an uninitialized proxy.
3. Mint the exact Rail B TokenERC20 supply once.
4. Deploy two direct `FixedPriceDataFeed` instances: one for the coupon token and one for USDC.
5. Configure the vault with zero fees, minimum `1e12`, internal USDC allowance equal to initial
   coupon supply, and `instantDailyLimit` equal to initial coupon supply.
6. Add canonical Ethereum USDC only and enable greenlisting.

## 3. Distribute and reconcile

1. Give the Airdrop only exact, per-batch ERC-20 allowances.
2. Push Rail A USDC and Rail B coupon tokens from the approved distribution account.
3. Reconcile each transaction against the frozen manifest and ERC-20 logs before continuing.
4. Confirm the sum of Rail B balances and burned supply equals the initial coupon supply.
5. Set Airdrop owner to the zero address and verify owner-only calls revert.

## 4. Remove authority

1. Remove TokenERC20 `MINTER_ROLE` and every `DEFAULT_ADMIN_ROLE` holder.
2. Remove every `REDEMPTION_VAULT_ADMIN_ROLE` holder.
3. Remove every access-control `DEFAULT_ADMIN_ROLE` holder.
4. Remove the temporary deployer's `GREENLIST_OPERATOR_ROLE` after the final operator is live.
5. Verify the only operational role left is the final greenlist operator.
6. Verify both ERC1967 admin slots are zero and no implementation exposes an upgrade function.
7. Scan all role grant/revoke logs from deployment through the finalized lock block and publish the
   resulting `lockEvidenceHash`.

The final greenlist operator should be an operational identity that can be rotated without gaining
any economic or code authority. The external mirror must apply both additions and revocations
within the separately approved SLO. A lost, unrotatable operator would strand otherwise valid
claims, which is why the role is deliberately self-administered.

## 5. Test before full reserve funding

1. Re-run source, bytecode, proxy, feed, role and configuration verification at a finalized block.
2. Run the full read/write matrix on an Ethereum mainnet fork using the exact deployment.
3. While the locked vault is still empty, send only a very small canonical-USDC canary.
4. Perform one real greenlisted, exact-approval redemption.
5. If it fails, abandon only that canary and redeploy; the locked stack cannot be repaired.
6. If it succeeds, fund the vault to exactly the reserve required by remaining coupon supply. The
   successful canary burn has already reduced both supply and required reserve.
7. Re-run finalized-state verification and publish the canary and funding transactions.

## 6. Enable consumers

Only after all prior steps pass may the frontend receive an event-specific qualification record.
Its production `enabled` flag stays false until the founder approves the final configuration hash.
