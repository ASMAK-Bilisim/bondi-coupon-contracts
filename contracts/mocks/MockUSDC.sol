// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.8.9;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDC is ERC20 {
    mapping(address => bool) public blockedSender;

    constructor() ERC20("Mock USD Coin", "mUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setBlockedSender(address account, bool blocked) external {
        blockedSender[account] = blocked;
    }

    function _beforeTokenTransfer(address from, address to, uint256 amount) internal override {
        require(!blockedSender[from], "MockUSDC: blocked sender");
        super._beforeTokenTransfer(from, to, amount);
    }
}
