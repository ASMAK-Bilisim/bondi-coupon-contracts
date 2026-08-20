// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

/**
 * @notice Event coupon-token surface used only by the instant redemption path.
 * @dev TokenERC20 5.0.4 inherits OpenZeppelin ERC20BurnableUpgradeable, whose
 *      burnFrom consumes the caller's ERC-20 allowance.
 */
interface ICouponToken is IERC20 {
    function burnFrom(address account, uint256 amount) external;
}
