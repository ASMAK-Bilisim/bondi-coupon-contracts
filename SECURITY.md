# Security policy

This repository is pre-production and has not received the focused audit required for deployment.
Do not send funds to contracts built from it.

Report suspected vulnerabilities privately to the ASMAK Bilisim/Bondi Finance security contact
used for the launch review. Do not include private keys, seed phrases or live exploit transactions
in an issue.

## Required review boundary

The review must cover the composition, not only upstream audit reports:

- all differences from Midas `bfe2b5f067f8223164f59e34be3b00b3b832d24a`;
- OpenZeppelin pause/reentrancy storage and initialization;
- allowance-based thirdweb TokenERC20 `burnFrom`;
- decimal accounting and hardcoded 1:1 redemption;
- non-administrable ERC1967 proxy initialization;
- role removal and the single remaining greenlist operator;
- thirdweb Airdrop push-manifest idempotence and owner lock;
- reserve conservation, USDC behavior and the canary/redeployment procedure.

The npm packages are development tooling only; `npm audit --omit=dev` must remain clean. The pinned
Hardhat 2/ethers 5 toolchain has known development-only transitive advisories and must never be used
with production keys. Deployment signing is intentionally absent from this repository.
