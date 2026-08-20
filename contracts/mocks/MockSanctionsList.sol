// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.8.9;

import {ISanctionsList} from "../interfaces/ISanctionsList.sol";

contract MockSanctionsList is ISanctionsList {
    mapping(address => bool) public sanctioned;

    function setSanctioned(address account, bool value) external {
        sanctioned[account] = value;
    }

    function isSanctioned(address account) external view override returns (bool) {
        return sanctioned[account];
    }
}
