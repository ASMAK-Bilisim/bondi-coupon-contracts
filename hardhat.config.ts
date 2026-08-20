import "@nomiclabs/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";

import { subtask } from "hardhat/config";
import { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } from "hardhat/builtin-tasks/task-names";
import type { HardhatUserConfig } from "hardhat/config";

subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(
  async ({ solcVersion }: { solcVersion: string }, _hre, runSuper) => {
    if (solcVersion === "0.8.9") {
      return {
        compilerPath: require.resolve("solc-0.8.9/soljson.js"),
        isSolcJs: true,
        version: "0.8.9",
        longVersion: "0.8.9+commit.e5eed63a",
      };
    }

    if (solcVersion === "0.8.23") {
      return {
        compilerPath: require.resolve("solc/soljson.js"),
        isSolcJs: true,
        version: "0.8.23",
        longVersion: "0.8.23+commit.f704f362",
      };
    }

    return runSuper();
  }
);

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.9",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          evmVersion: "london",
        },
      },
      {
        version: "0.8.23",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          evmVersion: "london",
        },
      },
    ],
  },
  mocha: {
    timeout: 60_000,
  },
};

export default config;
