// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.8.23;

// Compile-only import so Hardhat emits the published OpenZeppelin 4.9.6 ERC1967Proxy
// artifact. Do not wrap or subclass it; empty-initializer rejection lives in deploy
// scripts and qualification, not in Bondi bytecode.
// solhint-disable-next-line no-unused-import
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
