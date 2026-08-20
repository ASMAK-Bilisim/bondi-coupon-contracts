// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.8.9;

import {IDataFeed} from "../interfaces/IDataFeed.sol";

/**
 * @title FixedPriceDataFeed
 * @notice Non-upgradeable, non-administrable $1 feed for one coupon-event asset.
 */
contract FixedPriceDataFeed is IDataFeed {
    uint256 public constant FIXED_PRICE_BASE_18 = 1e18;

    address public immutable asset;

    constructor(address asset_) {
        require(asset_ != address(0), "FPDF: zero asset");
        asset = asset_;
    }

    function getDataInBase18() external pure override returns (uint256 answer) {
        return FIXED_PRICE_BASE_18;
    }

    function feedAdminRole() external pure override returns (bytes32) {
        return bytes32(0);
    }
}
