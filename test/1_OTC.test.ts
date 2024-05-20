import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer, keccak256 } from "ethers";
import { MockErc20, OTCMarketplace } from "../typechain-types";
import { deploySystem } from "../scripts/deploySystem";
import {
  createOffer,
  createToken,
  distributeTokens,
  getkeccak256,
} from "./helpers/helper";
import {
  BUY_OFFER,
  NALIKES_TOKEN_NAME,
  ONE_WEEK,
  SELL_OFFER,
} from "./helpers/constants";

let admin: Signer, alice: Signer, bob: Signer;
let otcMarketplace: OTCMarketplace;
let usdt: MockErc20;

describe("OTC", function () {
  before("Test", async function () {
    [admin, alice, bob] = await ethers.getSigners();
    [otcMarketplace, usdt] = await deploySystem();
    await distributeTokens(
      usdt,
      [await alice.getAddress(), await bob.getAddress()],
      ethers.parseUnits("1000000", 6),
      admin
    );
  });
  describe("OTC Marketplace", function () {
    it("Should create a token for pre market", async function () {
      expect(
        (await otcMarketplace.tokens(getkeccak256(NALIKES_TOKEN_NAME)))
          .settleDuration
      ).to.be.equal(ethers.ZeroAddress);

      await createToken(otcMarketplace, NALIKES_TOKEN_NAME, ONE_WEEK);

      expect(
        (await otcMarketplace.tokens(getkeccak256(NALIKES_TOKEN_NAME)))
          .settleDuration
      ).to.be.equal(ONE_WEEK);
    });

    it("Should be able to create a SELL offer", async function () {
      expect((await otcMarketplace.offers(1)).offeredBy).to.be.equal(
        ethers.ZeroAddress
      );

      const amount = ethers.parseEther("500");
      const value = ethers.parseUnits("1000", 6);

      await createOffer(
        otcMarketplace,
        SELL_OFFER,
        getkeccak256(NALIKES_TOKEN_NAME),
        amount,
        value,
        await usdt.getAddress(),
        alice
      );

      const offer = await otcMarketplace.offers(1);

      expect(offer.offerType).to.be.equal(SELL_OFFER);
      expect(offer.tokenId).to.be.equal(getkeccak256(NALIKES_TOKEN_NAME));
      expect(offer.exToken).to.be.equal(await usdt.getAddress());
      expect(offer.amount).to.be.equal(amount);
      expect(offer.value).to.be.equal(value);
    });
  });
});
