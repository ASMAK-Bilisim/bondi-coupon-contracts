# Security invariants

## Distribution

- The finalized entitlement total equals Rail A USDC plus Rail B coupon-token value.
- Every entitled address appears on exactly one rail.
- Every Rail B amount is a multiple of `1e12` coupon base units.
- TokenERC20 total supply is minted once in the exact Rail B event amount.
- Every push batch is reconciled from its manifest, transaction target, calldata and ERC-20 logs
  before the next batch is authorized.
- The thirdweb Airdrop owner is zero after distribution, making every owner-only push path unusable.

The audited Airdrop push method intentionally has no onchain batch UID. Idempotence therefore lives
in the signed/reviewed manifest and transaction reconciliation. A batch must never be resubmitted
merely because an RPC response was lost.

## Redemption

- A vault is dedicated to one event coupon token.
- Only canonical Ethereum USDC is configured as a payment token in a production qualification.
- Token identity, decimals, hardcoded 1:1 price, fees, minimum, allowance, daily limit and reserve
  are independently verified at a finalized block.
- A successful redemption requires an amount of at least `1e12` and an exact multiple of `1e12`.
- `minReceiveAmount` must equal the coupon amount in base-18 accounting.
- The caller and recipient are the same wallet.
- `burnFrom` consumes the vault's exact ERC-20 allowance from that wallet.
- A failed USDC transfer reverts the entire transaction, including the burn and allowance change.
- A holder-initiated TokenERC20 `burn` is an irrevocable claim waiver. Complete coupon burn logs
  minus vault `RedeemInstant` logs equal waived coupon units. Internal USDC allowance may exceed
  remaining supply only by exactly that proven waiver amount.
- Final reserve equals internal allowance divided by `1e12`. Any reserve above remaining
  redeemable supply must be exactly the base-unit surplus implied by proven claim waivers and can
  never be withdrawn.

## Authority lock

- Vault, token and access-control implementations are reached through published OpenZeppelin 4.9.6
  `ERC1967Proxy` instances, initialized in the creation transaction. Empty initializer data is
  rejected by the deploy helper and by qualification; the OpenZeppelin constructor itself allows it.
  No ProxyAdmin exists and no implementation exposes UUPS upgrade calls.
- The vault hardcodes 1:1 redemption (`1e12` coupon units = 1 USDC). Coupon and payment-token feed
  slots must be the zero address. No feed contract is deployed.
- `DEFAULT_ADMIN_ROLE`, `REDEMPTION_VAULT_ADMIN_ROLE` and `MINTER_ROLE` have no members.
- Public transfers remain enabled through thirdweb's `TRANSFER_ROLE` grant to `address(0)`.
- The Airdrop owner is `address(0)`.
- `GREENLIST_OPERATOR_ROLE` is the only surviving operational authority, with exactly one member.
- That role's admin remains `DEFAULT_ADMIN_ROLE`. After default admin is removed, generic grant,
  revoke and batch functions cannot add or remove an operator. `renounceRole` is forbidden. There is
  no onchain operator rotation; a lost operator key freezes future KYC changes but does not disturb
  already-greenlisted redemptions.
- The operator can add or remove `GREENLISTED_ROLE` only. It cannot change vault economics, withdraw
  USDC, mint coupons, unpause disabled routes or upgrade code.

## Qualification boundary

Passing unit tests is not production qualification. An event remains disabled until the candidate
release manifest is independently reproduced and approved, exact mainnet creation transactions,
addresses, runtime hashes, EIP-1967 slots, complete role-log closure, snapshot/manifests, burn-waiver
and reserve proof, fork results, canary result and the founder-approved configuration hash are
published and reviewed.
