# File-by-file licensing review

This inventory records source provenance; it is not legal advice.

## Repository license

Bondi-authored source, tests, scripts and documentation are released under
AGPL-3.0-or-later. Files with their own SPDX identifier remain under that identifier.

## Midas-derived dependency tree

Source was selected from `midas-apps/contracts` commit
`bfe2b5f067f8223164f59e34be3b00b3b832d24a`. The machine-readable upstream blob IDs are
in `provenance/midas-derived-files.json`.

| Local files                                         | Upstream SPDX | Treatment                                                                                                    |
| --------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------ |
| `contracts/RedemptionVault.sol`                     | MIT           | Modified: exact same-wallet minimum, 1e12 granularity, live fixed-profile checks, and TokenERC20 `burnFrom`. |
| `contracts/abstract/ManageableVault.sol`            | MIT           | Modified: Midas pauser removed; OZ 4.9.6 pause and reentrancy initializers added; permanently paused.        |
| `contracts/access/MidasAccessControl.sol`           | MIT           | Modified: greenlist operator is initially granted and made self-administered for constrained rotation.       |
| `contracts/interfaces/IDataFeed.sol`                | MIT           | Modified only to remove unused Chainlink/OZ imports.                                                         |
| `contracts/abstract/MidasInitializable.sol`         | MIT           | Verbatim.                                                                                                    |
| `contracts/abstract/WithSanctionsList.sol`          | MIT           | Verbatim.                                                                                                    |
| `contracts/access/Blacklistable.sol`                | MIT           | Verbatim.                                                                                                    |
| `contracts/access/Greenlistable.sol`                | MIT           | Verbatim.                                                                                                    |
| `contracts/access/MidasAccessControlRoles.sol`      | MIT           | Verbatim.                                                                                                    |
| `contracts/access/WithMidasAccessControl.sol`       | MIT           | Verbatim.                                                                                                    |
| `contracts/interfaces/IMToken.sol`                  | MIT           | Verbatim; the global interface was intentionally not changed.                                                |
| `contracts/interfaces/IManageableVault.sol`         | MIT           | Verbatim.                                                                                                    |
| `contracts/interfaces/IRedemptionVault.sol`         | MIT           | Verbatim.                                                                                                    |
| `contracts/interfaces/ISanctionsList.sol`           | MIT           | Verbatim.                                                                                                    |
| `contracts/libraries/DecimalsCorrectionLibrary.sol` | MIT           | Verbatim.                                                                                                    |

The upstream `contracts/access/Pausable.sol` has SPDX `UNLICENSED`. It was not copied, edited,
relicensed or included in Git history. Its role is replaced by OpenZeppelin 4.9.6
`PausableUpgradeable` (MIT). `npm run verify:licenses` fails if the old import or any UNLICENSED
Solidity source appears.

## Thirdweb published contracts

| Component  | Published version | Source license                     | Exact verification                                                                                                                                              |
| ---------- | ----------------: | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TokenERC20 |             5.0.4 | Apache-2.0 (plus MIT dependencies) | Publish metadata `ipfs://QmNfynBfFjdqmKgeggXAjWWkLzWx1jD84phqJzxwQNY3eP/0`; bytecode hash `0x8f0b6a31c72603c3e4de170187fbccf4e321c408c871ef4720e4607a2d8dde6e`. |
| Airdrop    |             2.0.2 | Apache-2.0 (plus MIT dependencies) | Publish metadata `ipfs://QmPDWPQwJGiwRnnvUrSnEeoXstf26AdKmZ8dZr4o6TS9nk/0`; bytecode hash `0x3c0c18b012867293c346141885e4dc5be3f0b6b5c5686f3459fa7b2cf77eccd7`. |

The exact source, publish metadata, compiler metadata and published bytecode are vendored under
`vendor/thirdweb/`. The verification script checks every compiler-manifest source hash—including
the pinned OpenZeppelin 4.9.0 and Solady dependency files—and reproduces the complete published
creation bytecode with solc 0.8.23.

Official audit references from the publish records:

- TokenERC20: `ipfs://QmaMiezCMfmo5zWmwNc2WXLex11BuRZJ9p9ZhWj638Tdws`
- Airdrop: `ipfs://QmZyURZH8ZT2VbtGjVakJBw8qdM6MDKnDZD993xouaMfnG`

Those audits cover the published thirdweb components, not Bondi's Midas integration, role-removal
sequence, proxy composition, fixed feed, manifest process or deployment configuration.

## Other dependencies

- OpenZeppelin Contracts and Contracts Upgradeable 4.9.6: MIT; used by the Bondi/Midas stack.
- OpenZeppelin Contracts Upgradeable 4.9.0: MIT; installed under an alias only to reproduce the
  exact TokenERC20 5.0.4 published compiler input.
- Solady 0.0.180: MIT; used to reproduce Airdrop 2.0.2.
- Hardhat, ethers, solc and test tooling are development dependencies and are not linked into
  deployed runtime code except for the compiler-selected library source described above.

## Conclusion

The clean repository avoids the unlicensed Midas file and its history. Public AGPL publication
satisfies Bondi's chosen disclosure policy for its own modifications, while permissively licensed
upstream files retain their notices. A focused security review remains mandatory because audit
coverage does not automatically transfer to this composition or its modified vault logic.
