# Dust, claim waivers and long-tail claims

The coupon token is intentionally transferable and retains normal 18-decimal ERC-20 transfers and
TokenERC20's holder `burn` function. The vault does not modify the published thirdweb bytecode.

The operational policy is:

- Initial Rail B allocations must be exact multiples of `1e12` coupon units.
- The vault redeems only multiples of `1e12`, with a minimum of `1e12` (0.000001 USDC).
- Transfer-created dust below that unit is not confiscated, rounded up, rounded down or swept.
- Dust remains transferable and can be combined with other coupon units until it reaches a
  redeemable multiple.
- Economically uneconomic claims do not expire. Holders may aggregate or transfer them; a future
  gas-sponsorship product may help, but must not change entitlement or recipient semantics.
- A holder-initiated `burn`, or an authorized third-party `burnFrom` outside the event vault, is an
  irrevocable claim waiver. It returns no USDC and creates no right to recover reserve.
- The qualification verifier scans every coupon `Transfer` to the zero address and every vault
  `RedeemInstant` event from their authenticated creation blocks. Total burns minus vault-matched
  redemption burns are the exact waived coupon amount.
- Vault internal allowance must equal remaining coupon supply plus that exact waived amount. Final
  USDC reserve must equal internal allowance divided by `1e12`.
- Because internal allowance remains `1e12`-aligned, reserve above the remaining redeemable supply
  equals `ceil(waived coupon units / 1e12)` USDC base units. That surplus is proven from logs and is
  permanently locked; it cannot be swept.
- Reserve USDC corresponding to outstanding or waived claims is never reclaimed merely because a
  claim is small, dormant or deliberately burned.

This policy preserves other holders' claims and makes every accounting difference explainable from
onchain logs. Its cost is indefinitely locked residual reserve for dormant claims, fragmented dust
and explicit claim waivers.
