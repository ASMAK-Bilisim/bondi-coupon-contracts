// SPDX-License-Identifier: AGPL-3.0-or-later
import fs from "node:fs";
import path from "node:path";

import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

const DEFAULT_ADMIN_ROLE = ethers.constants.HashZero;
const MINTER_ROLE = ethers.utils.id("MINTER_ROLE");
const TRANSFER_ROLE = ethers.utils.id("TRANSFER_ROLE");
const GREENLIST_OPERATOR_ROLE = ethers.utils.id("GREENLIST_OPERATOR_ROLE");
const GREENLISTED_ROLE = ethers.utils.id("GREENLISTED_ROLE");
const VAULT_ADMIN_ROLE = ethers.utils.id("REDEMPTION_VAULT_ADMIN_ROLE");

const COUPON_SUPPLY = ethers.utils.parseEther("1000");
const HOLDER_COUPONS = ethers.utils.parseEther("600");
const OTHER_COUPONS = ethers.utils.parseEther("400");
const RESERVE_USDC = ethers.BigNumber.from(1_000_000_000);
const ONE_COUPON = ethers.utils.parseEther("1");
const ONE_USDC = ethers.BigNumber.from(1_000_000);
const MINIMUM_COUPON = ethers.BigNumber.from(1_000_000_000_000);

function thirdwebArtifact(name: "TokenERC20" | "Airdrop") {
  return JSON.parse(
    fs.readFileSync(path.resolve(__dirname, `../vendor-artifacts/${name}.json`), "utf8")
  );
}

async function deployCouponEventStack() {
  const [deployer, kycOperator, holder, otherHolder, railAHolder] = await ethers.getSigners();

  const Proxy = await ethers.getContractFactory("BondiERC1967Proxy");

  const tokenArtifact = thirdwebArtifact("TokenERC20");
  const tokenImplementation = await new ethers.ContractFactory(
    tokenArtifact.abi,
    tokenArtifact.bytecode,
    deployer
  ).deploy();
  await tokenImplementation.deployed();
  const tokenInterface = new ethers.utils.Interface(tokenArtifact.abi);
  const tokenProxy = await Proxy.deploy(
    tokenImplementation.address,
    tokenInterface.encodeFunctionData("initialize", [
      deployer.address,
      "Bondi Coupon Event",
      "BCPN",
      "ipfs://bondi-coupon-event",
      [],
      deployer.address,
      deployer.address,
      0,
    ])
  );
  await tokenProxy.deployed();
  const couponToken = new ethers.Contract(tokenProxy.address, tokenArtifact.abi, deployer);
  await couponToken.mintTo(deployer.address, COUPON_SUPPLY);

  const Usdc = await ethers.getContractFactory("MockUSDC");
  const usdc = await Usdc.deploy();
  await usdc.deployed();
  await usdc.mint(deployer.address, RESERVE_USDC.add(50_000_000));

  const airdropArtifact = thirdwebArtifact("Airdrop");
  const airdropImplementation = await new ethers.ContractFactory(
    airdropArtifact.abi,
    airdropArtifact.bytecode,
    deployer
  ).deploy();
  await airdropImplementation.deployed();
  const airdropInterface = new ethers.utils.Interface(airdropArtifact.abi);
  const airdropProxy = await Proxy.deploy(
    airdropImplementation.address,
    airdropInterface.encodeFunctionData("initialize", [deployer.address, "ipfs://bondi-airdrop"])
  );
  await airdropProxy.deployed();
  const airdrop = new ethers.Contract(airdropProxy.address, airdropArtifact.abi, deployer);

  await usdc.approve(airdrop.address, 50_000_000);
  await airdrop.airdropERC20(usdc.address, [
    { recipient: railAHolder.address, amount: 50_000_000 },
  ]);

  await couponToken.approve(airdrop.address, COUPON_SUPPLY);
  await airdrop.airdropERC20(couponToken.address, [
    { recipient: holder.address, amount: HOLDER_COUPONS },
    { recipient: otherHolder.address, amount: OTHER_COUPONS },
  ]);
  await airdrop.setOwner(ethers.constants.AddressZero);

  const AccessControl = await ethers.getContractFactory("MidasAccessControl");
  const accessControlImplementation = await AccessControl.deploy();
  await accessControlImplementation.deployed();
  const accessControlProxy = await Proxy.deploy(
    accessControlImplementation.address,
    AccessControl.interface.encodeFunctionData("initialize")
  );
  await accessControlProxy.deployed();
  const accessControl = AccessControl.attach(accessControlProxy.address);

  await accessControl.grantRole(VAULT_ADMIN_ROLE, deployer.address);
  await accessControl.grantRole(GREENLIST_OPERATOR_ROLE, kycOperator.address);

  const Feed = await ethers.getContractFactory("FixedPriceDataFeed");
  const couponFeed = await Feed.deploy(couponToken.address);
  const usdcFeed = await Feed.deploy(usdc.address);
  await Promise.all([couponFeed.deployed(), usdcFeed.deployed()]);

  const Vault = await ethers.getContractFactory("RedemptionVault");
  const vaultImplementation = await Vault.deploy();
  await vaultImplementation.deployed();
  const vaultProxy = await Proxy.deploy(
    vaultImplementation.address,
    Vault.interface.encodeFunctionData("initialize", [
      accessControl.address,
      { mToken: couponToken.address, mTokenDataFeed: couponFeed.address },
      { tokensReceiver: deployer.address, feeReceiver: deployer.address },
      { instantFee: 0, instantDailyLimit: COUPON_SUPPLY },
      ethers.constants.AddressZero,
      1,
      MINIMUM_COUPON,
      { fiatAdditionalFee: 0, fiatFlatFee: 0, minFiatRedeemAmount: 0 },
      deployer.address,
    ])
  );
  await vaultProxy.deployed();
  const vault = Vault.attach(vaultProxy.address);

  await vault.addPaymentToken(usdc.address, usdcFeed.address, 0, COUPON_SUPPLY, false);
  await vault.setGreenlistEnable(true);
  await accessControl.connect(kycOperator).grantRole(GREENLISTED_ROLE, holder.address);
  await usdc.transfer(vault.address, RESERVE_USDC);

  await couponToken.revokeRole(MINTER_ROLE, deployer.address);
  await couponToken.revokeRole(TRANSFER_ROLE, deployer.address);
  await couponToken.revokeRole(DEFAULT_ADMIN_ROLE, deployer.address);

  await accessControl.revokeRole(VAULT_ADMIN_ROLE, deployer.address);
  await accessControl.revokeRole(DEFAULT_ADMIN_ROLE, deployer.address);
  await accessControl.connect(kycOperator).revokeRole(GREENLIST_OPERATOR_ROLE, deployer.address);

  return {
    deployer,
    kycOperator,
    holder,
    otherHolder,
    railAHolder,
    couponToken,
    usdc,
    airdrop,
    accessControl,
    couponFeed,
    usdcFeed,
    vault,
    tokenProxy,
    vaultProxy,
    accessControlProxy,
  };
}

describe("Bondi coupon event stack", function () {
  it("pushes exactly one asset to each rail and permanently closes the airdrop", async function () {
    const { deployer, holder, otherHolder, railAHolder, couponToken, usdc, airdrop } =
      await loadFixture(deployCouponEventStack);

    expect(await usdc.balanceOf(railAHolder.address)).to.equal(50_000_000);
    expect(await couponToken.balanceOf(holder.address)).to.equal(HOLDER_COUPONS);
    expect(await couponToken.balanceOf(otherHolder.address)).to.equal(OTHER_COUPONS);
    expect(await couponToken.totalSupply()).to.equal(COUPON_SUPPLY);
    expect(await airdrop.owner()).to.equal(ethers.constants.AddressZero);
    expect(await airdrop.tokenMerkleRoot(couponToken.address)).to.equal(ethers.constants.HashZero);
    expect(await airdrop.tokenMerkleRoot(usdc.address)).to.equal(ethers.constants.HashZero);

    await expect(
      airdrop
        .connect(deployer)
        .airdropERC20(usdc.address, [{ recipient: railAHolder.address, amount: 1 }])
    ).to.be.revertedWithCustomError(airdrop, "OwnableUnauthorized");
    await expect(
      airdrop.setMerkleRoot(couponToken.address, ethers.utils.id("unexpected-root"), true)
    ).to.be.revertedWithCustomError(airdrop, "OwnableUnauthorized");
    await expect(
      airdrop.claimERC20(couponToken.address, holder.address, 1, [])
    ).to.be.revertedWithCustomError(airdrop, "AirdropNoMerkleRoot");
    await expect(
      airdrop.airdropERC20WithSignature(
        {
          uid: ethers.utils.id("disabled-signature-path"),
          tokenAddress: couponToken.address,
          expirationTimestamp: ethers.constants.MaxUint256,
          contents: [{ recipient: holder.address, amount: 1 }],
        },
        "0x"
      )
    ).to.be.revertedWithCustomError(airdrop, "AirdropRequestInvalidSigner");
  });

  it("redeems through the approved three-argument path while permanently paused", async function () {
    const { holder, couponToken, usdc, vault } = await loadFixture(deployCouponEventStack);

    expect(await vault.paused()).to.equal(true);
    await couponToken.connect(holder).approve(vault.address, ONE_COUPON);

    await expect(
      vault
        .connect(holder)
        ["redeemInstant(address,uint256,uint256)"](usdc.address, ONE_COUPON, ONE_COUPON)
    )
      .to.emit(couponToken, "Transfer")
      .withArgs(holder.address, ethers.constants.AddressZero, ONE_COUPON)
      .and.to.emit(usdc, "Transfer")
      .withArgs(vault.address, holder.address, ONE_USDC);

    expect(await couponToken.allowance(holder.address, vault.address)).to.equal(0);
    expect(await couponToken.balanceOf(holder.address)).to.equal(HOLDER_COUPONS.sub(ONE_COUPON));
    expect(await couponToken.totalSupply()).to.equal(COUPON_SUPPLY.sub(ONE_COUPON));
    expect(await usdc.balanceOf(holder.address)).to.equal(ONE_USDC);
    expect((await vault.tokensConfig(usdc.address)).allowance).to.equal(
      COUPON_SUPPLY.sub(ONE_COUPON)
    );
  });

  it("requires a live greenlist role and an exact burn allowance", async function () {
    const { holder, otherHolder, couponToken, usdc, vault } = await loadFixture(
      deployCouponEventStack
    );

    await couponToken.connect(otherHolder).approve(vault.address, ONE_COUPON);
    await expect(
      vault
        .connect(otherHolder)
        ["redeemInstant(address,uint256,uint256)"](usdc.address, ONE_COUPON, ONE_COUPON)
    ).to.be.revertedWith("WMAC: hasnt role");

    await expect(
      vault
        .connect(holder)
        ["redeemInstant(address,uint256,uint256)"](usdc.address, ONE_COUPON, ONE_COUPON)
    ).to.be.revertedWith("ERC20: insufficient allowance");
  });

  it("keeps the locked coupon token transferable, including aggregatable dust", async function () {
    const { holder, otherHolder, couponToken } = await loadFixture(deployCouponEventStack);

    await couponToken.connect(otherHolder).transfer(holder.address, 1);

    expect(await couponToken.balanceOf(holder.address)).to.equal(HOLDER_COUPONS.add(1));
    expect(await couponToken.balanceOf(otherHolder.address)).to.equal(OTHER_COUPONS.sub(1));
  });

  it("rejects dust, non-USDC-aligned amounts and a non-exact minimum", async function () {
    const { holder, couponToken, usdc, vault } = await loadFixture(deployCouponEventStack);

    await couponToken.connect(holder).approve(vault.address, ONE_COUPON);

    await expect(
      vault
        .connect(holder)
        ["redeemInstant(address,uint256,uint256)"](
          usdc.address,
          MINIMUM_COUPON.sub(1),
          MINIMUM_COUPON.sub(1)
        )
    ).to.be.revertedWith("RV: amount below one USDC unit");

    await expect(
      vault
        .connect(holder)
        ["redeemInstant(address,uint256,uint256)"](
          usdc.address,
          ONE_COUPON.add(1),
          ONE_COUPON.add(1)
        )
    ).to.be.revertedWith("RV: amount not USDC-aligned");

    await expect(
      vault
        .connect(holder)
        ["redeemInstant(address,uint256,uint256)"](usdc.address, ONE_COUPON, ONE_COUPON.sub(1))
    ).to.be.revertedWith("RV: min receive must be exact");
  });

  it("keeps custom-recipient, request and fiat paths permanently unusable", async function () {
    const { holder, otherHolder, usdc, vault } = await loadFixture(deployCouponEventStack);

    await expect(
      vault
        .connect(holder)
        ["redeemInstant(address,uint256,uint256,address)"](
          usdc.address,
          ONE_COUPON,
          ONE_COUPON,
          otherHolder.address
        )
    ).to.be.revertedWith("Pausable: paused");

    await expect(
      vault.connect(holder)["redeemRequest(address,uint256)"](usdc.address, ONE_COUPON)
    ).to.be.revertedWith("Pausable: paused");

    await expect(
      vault
        .connect(holder)
        ["redeemRequest(address,uint256,address)"](usdc.address, ONE_COUPON, otherHolder.address)
    ).to.be.revertedWith("Pausable: paused");

    await expect(vault.connect(holder).redeemFiatRequest(ONE_COUPON)).to.be.revertedWith(
      "Pausable: paused"
    );
  });

  it("removes vault, token mint and upgrade authority", async function () {
    const { deployer, couponToken, usdc, accessControl, vault, vaultProxy, tokenProxy } =
      await loadFixture(deployCouponEventStack);

    expect(await accessControl.hasRole(DEFAULT_ADMIN_ROLE, deployer.address)).to.equal(false);
    expect(await accessControl.hasRole(VAULT_ADMIN_ROLE, deployer.address)).to.equal(false);
    expect(await couponToken.hasRole(DEFAULT_ADMIN_ROLE, deployer.address)).to.equal(false);
    expect(await couponToken.hasRole(MINTER_ROLE, deployer.address)).to.equal(false);

    await expect(
      vault.connect(deployer).withdrawToken(usdc.address, 1, deployer.address)
    ).to.be.revertedWith("WMAC: hasnt role");
    await expect(vault.connect(deployer).setInstantFee(1)).to.be.revertedWith("WMAC: hasnt role");
    await expect(vault.connect(deployer).setGreenlistEnable(false)).to.be.revertedWith(
      "WMAC: hasnt role"
    );
    await expect(couponToken.connect(deployer).mintTo(deployer.address, 1)).to.be.revertedWith(
      "not minter."
    );
    await expect(couponToken.connect(deployer).grantRole(MINTER_ROLE, deployer.address)).to.be
      .reverted;

    const upgradeCalldata = new ethers.utils.Interface([
      "function upgradeTo(address implementation)",
    ]).encodeFunctionData("upgradeTo", [deployer.address]);
    await expect(deployer.sendTransaction({ to: vaultProxy.address, data: upgradeCalldata })).to.be
      .reverted;
    await expect(deployer.sendTransaction({ to: tokenProxy.address, data: upgradeCalldata })).to.be
      .reverted;
    const unpauseCalldata = new ethers.utils.Interface(["function unpause()"]).encodeFunctionData(
      "unpause"
    );
    await expect(deployer.sendTransaction({ to: vaultProxy.address, data: unpauseCalldata })).to.be
      .reverted;
  });

  it("lets the constrained greenlist operator rotate without restoring admin powers", async function () {
    const { deployer, kycOperator, otherHolder, accessControl } = await loadFixture(
      deployCouponEventStack
    );

    await accessControl
      .connect(kycOperator)
      .grantRole(GREENLIST_OPERATOR_ROLE, otherHolder.address);
    await accessControl
      .connect(otherHolder)
      .revokeRole(GREENLIST_OPERATOR_ROLE, kycOperator.address);

    expect(await accessControl.hasRole(GREENLIST_OPERATOR_ROLE, otherHolder.address)).to.equal(
      true
    );
    expect(await accessControl.hasRole(GREENLIST_OPERATOR_ROLE, kycOperator.address)).to.equal(
      false
    );
    expect(await accessControl.hasRole(DEFAULT_ADMIN_ROLE, otherHolder.address)).to.equal(false);
    expect(await accessControl.hasRole(VAULT_ADMIN_ROLE, otherHolder.address)).to.equal(false);

    await expect(accessControl.connect(kycOperator).grantRole(GREENLISTED_ROLE, deployer.address))
      .to.be.reverted;
    await expect(
      accessControl.connect(otherHolder).grantRole(DEFAULT_ADMIN_ROLE, otherHolder.address)
    ).to.be.reverted;
    await accessControl.connect(otherHolder).grantRole(GREENLISTED_ROLE, deployer.address);
    expect(await accessControl.hasRole(GREENLISTED_ROLE, deployer.address)).to.equal(true);
  });

  it("rolls back the burn if the reserve transfer cannot complete", async function () {
    const { holder, couponToken, usdc, vault } = await loadFixture(deployCouponEventStack);
    await couponToken.connect(holder).approve(vault.address, ONE_COUPON);
    await usdc.setBlockedSender(vault.address, true);
    const balanceBefore = await couponToken.balanceOf(holder.address);
    const supplyBefore = await couponToken.totalSupply();

    await expect(
      vault
        .connect(holder)
        ["redeemInstant(address,uint256,uint256)"](usdc.address, ONE_COUPON, ONE_COUPON)
    ).to.be.revertedWith("MockUSDC: blocked sender");

    expect(await couponToken.balanceOf(holder.address)).to.equal(balanceBefore);
    expect(await couponToken.totalSupply()).to.equal(supplyBefore);
    expect(await couponToken.allowance(holder.address, vault.address)).to.equal(ONE_COUPON);
  });

  it("exposes two immutable one-dollar feeds with no administrator", async function () {
    const { couponToken, usdc, couponFeed, usdcFeed } = await loadFixture(deployCouponEventStack);

    expect(await couponFeed.asset()).to.equal(couponToken.address);
    expect(await usdcFeed.asset()).to.equal(usdc.address);
    expect(await couponFeed.getDataInBase18()).to.equal(ethers.utils.parseEther("1"));
    expect(await usdcFeed.getDataInBase18()).to.equal(ethers.utils.parseEther("1"));
    expect(await couponFeed.feedAdminRole()).to.equal(ethers.constants.HashZero);
    expect(await usdcFeed.feedAdminRole()).to.equal(ethers.constants.HashZero);
  });
});
