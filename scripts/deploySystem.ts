import { ethers } from "hardhat";
import { _deploy } from "./utils/deployHelper";
import { MockErc20, OTCMarketplace } from "../typechain-types";

export async function deploySystem() {
  const otcMarketplace: OTCMarketplace = await _deploy("OTCMarketplace", []);

  // deploying mock Mock USDT
  const usdt: MockErc20 = await _deploy("MockErc20", ["USDT", "USDT", 6]);

  // whitelisting payment/collateral tokens. ETH and USDT
    
  return [otcMarketplace];
}
