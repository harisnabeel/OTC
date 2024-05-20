import { ethers } from "hardhat";
import { _deploy } from "./utils/deployHelper";
import { MockErc20, OTCMarketplace } from "../typechain-types";

export async function deploySystem(): Promise<[OTCMarketplace, MockErc20]> {
  const otcMarketplace: OTCMarketplace = await _deploy("OTCMarketplace", []);

  // deploying mock Mock USDT
  const usdt: MockErc20 = await _deploy("MockErc20", ["USDT", "USDT", 6]);

  // whitelisting payment/collateral tokens. ETH and USDT
  // address(0) is used for NATIVE Currency e.g ETH
  await otcMarketplace.setTokensWhitelist(
    [ethers.ZeroAddress, await usdt.getAddress()],
    true
  );

  return [otcMarketplace, usdt];
}
