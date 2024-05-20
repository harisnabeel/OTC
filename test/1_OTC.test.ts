import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer } from "ethers";
import { OTCMarketplace } from "../typechain-types";
import { deploySystem } from "../scripts/deploySystem";

let admin: Signer, alice: Signer, bob: Signer;
let otcMarketplace: OTCMarketplace;

describe("OTC", function () {
  before("Test", async function () {
    [admin, alice, bob] = await ethers.getSigners();
    [otcMarketplace] = await deploySystem();
  });
  describe("OTC Marketplace", function () {
    it("", async function () {});
  });
});
