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
- Token/feed identity, decimals, price, fees, minimum, allowance, daily limit and reserve are
  independently verified at a finalized block.
- A successful redemption requires an amount of at least `1e12` and an exact multiple of `1e12`.
- `minReceiveAmount` must equal the coupon amount in base-18 accounting.
- The caller and recipient are the same wallet.
- `burnFrom` consumes the vault's exact ERC-20 allowance from that wallet.
- A failed USDC transfer reverts the entire transaction, including the burn and allowance change.

## Authority lock

- Vault, token and access-control implementations are reached through non-administrable
  `ERC1967Proxy` instances. No ProxyAdmin exists and no implementation exposes UUPS upgrade calls.
- Both fixed feeds are direct, immutable deployments.
- `DEFAULT_ADMIN_ROLE`, `REDEMPTION_VAULT_ADMIN_ROLE` and `MINTER_ROLE` have no members.
- Public transfers remain enabled through thirdweb's `TRANSFER_ROLE` grant to `address(0)`.
- The Airdrop owner is `address(0)`.
- `GREENLIST_OPERATOR_ROLE` is its own role admin and is the only surviving operational role.
- The operator can add/remove KYC status and rotate the operator address, but cannot change vault
  economics, withdraw USDC, mint coupons, alter feeds, unpause disabled routes or upgrade code.

## Qualification boundary

Passing unit tests is not production qualification. An event remains disabled until exact mainnet
addresses, runtime hashes, EIP-1967 slots, role-log closure, snapshot/manifests, reserve proof, fork
results, canary result and the founder-approved configuration hash are published and reviewed.
