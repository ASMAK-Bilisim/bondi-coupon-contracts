// SPDX-License-Identifier: AGPL-3.0-or-later
import { Contract, ContractFactory } from "ethers";
import { ethers } from "hardhat";

export const ERC1967_PROXY_FQN =
  "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol:ERC1967Proxy";

export function requireNonemptyInitializer(initializationData: string): string {
  if (!initializationData || initializationData === "0x") {
    throw new Error("ERC1967 proxy initializer data must be nonempty");
  }
  return initializationData;
}

export async function erc1967ProxyFactory(): Promise<ContractFactory> {
  return ethers.getContractFactory(ERC1967_PROXY_FQN);
}

export async function deployInitializedProxy(
  implementation: string,
  initializationData: string
): Promise<Contract> {
  requireNonemptyInitializer(initializationData);
  const Proxy = await erc1967ProxyFactory();
  const proxy = await Proxy.deploy(implementation, initializationData);
  await proxy.deployed();
  return proxy;
}
