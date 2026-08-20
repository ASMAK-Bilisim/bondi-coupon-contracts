# Dust and long-tail claims

The coupon token is intentionally transferable and retains normal 18-decimal ERC-20 transfers.
The vault does not modify thirdweb TokenERC20 to impose transfer granularity.

The operational policy is:

- Initial Rail B allocations must be exact multiples of `1e12` coupon units.
- The vault redeems only multiples of `1e12`, with a minimum of `1e12` (0.000001 USDC).
- Transfer-created dust below that unit is not confiscated, rounded up, rounded down or swept.
- Dust remains transferable and can be combined with other coupon units until it reaches a
  redeemable multiple.
- Economically uneconomic claims do not expire. Holders may aggregate or transfer them; a future
  gas-sponsorship product may help, but must not change entitlement or recipient semantics.
- Reserve USDC corresponding to outstanding supply is never reclaimed merely because a claim is
  small or dormant.

This policy preserves conservation and holder rights. Its cost is an indefinitely locked residual
reserve when fragmented holders choose not to consolidate or redeem.
