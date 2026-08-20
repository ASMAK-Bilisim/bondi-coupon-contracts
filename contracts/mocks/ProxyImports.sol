// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.8.23;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @dev Makes the non-administrable ERC1967Proxy artifact available to tests
 * and deployment tooling. The proxy exposes no upgrade function.
 */
contract BondiERC1967Proxy is ERC1967Proxy {
    constructor(
        address implementation,
        bytes memory initializationData
    ) ERC1967Proxy(implementation, initializationData) {}
}
