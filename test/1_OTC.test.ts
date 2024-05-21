import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer, keccak256 } from "ethers";
import { MockErc20, OTCMarketplace } from "../typechain-types";
import { deploySystem } from "../scripts/deploySystem";
import {
  createOffer,
  createToken,
  deployMockERC20,
  distributeTokens,
  fillOffer,
  getkeccak256,
} from "./helpers/helper";
import {
  BUY_OFFER,
  NALIKES_TOKEN_NAME,
  ONE_WEEK,
  OfferStatus,
  OrderStatus,
  SELL_OFFER,
  TOKEN_NAME_2,
  TOKEN_NAME_3,
} from "./helpers/constants";

let admin: Signer, alice: Signer, bob: Signer;
let otcMarketplace: OTCMarketplace;
let usdt: MockErc20,
  nalikesToken: MockErc20,
  mockToken2: MockErc20,
  mockToken3: MockErc20;

describe("OTC", function () {
  before("Test", async function () {
    [admin, alice, bob] = await ethers.getSigners();
    [otcMarketplace, usdt] = await deploySystem();
    // distributing tokens
    await distributeTokens(
      usdt,
      [await alice.getAddress(), await bob.getAddress()],
      ethers.parseUnits("1000000", 6),
      admin
    );

    // deploying Tokens
    nalikesToken = await deployMockERC20(
      NALIKES_TOKEN_NAME,
      NALIKES_TOKEN_NAME,
      18
    );
    mockToken2 = await deployMockERC20(TOKEN_NAME_2, TOKEN_NAME_2, 18);
    mockToken3 = await deployMockERC20(TOKEN_NAME_3, TOKEN_NAME_3, 18);

    await distributeTokens(
      nalikesToken,
      [await alice.getAddress()],
      ethers.parseEther("10000000"),
      admin
    );

    await distributeTokens(
      mockToken2,
      [await alice.getAddress(), await bob.getAddress()],
      ethers.parseEther("10000000"),
      admin
    );

    await distributeTokens(
      mockToken3,
      [await alice.getAddress(), await bob.getAddress()],
      ethers.parseEther("10000000"),
      admin
    );
  });
  describe("Sell tests With ERC20", function () {
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

    it("Should be able to create a SELL offer against ERC20", async function () {
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

    it("Should be able to fill a SELL offer", async function () {
      const offerBefore = await otcMarketplace.offers(
        await otcMarketplace.lastOfferId()
      );
      expect(offerBefore.status).to.be.equal(OfferStatus.OPEN);

      console.log("before fil;;;;;;;;;");
      // fill offer
      await fillOffer(otcMarketplace, 1, offerBefore.amount, bob);

      const offerAfterFill = await otcMarketplace.offers(
        await otcMarketplace.lastOfferId()
      );

      expect(offerAfterFill.status).to.be.equal(OfferStatus.FILLED);
      expect(offerAfterFill.filledAmount).to.be.equal(offerBefore.amount);
    });

    it("Should not allow to fill already filled order", async function () {
      const offerId = await otcMarketplace.lastOfferId();
      const offer = await otcMarketplace.offers(offerId);

      expect(offer.status).to.be.equal(OfferStatus.FILLED);

      await expect(
        fillOffer(otcMarketplace, offerId, offer.amount, bob)
      ).to.be.revertedWith("Invalid Offer Status");
    });

    it("Should not allow to Settle before Settle phase starts", async function () {
      const orderId = await otcMarketplace.lastOrderId();
      const order = await otcMarketplace.orders(orderId);

      expect(order.status).to.be.equal(OrderStatus.OPEN);

      // now trying to fill
      await expect(otcMarketplace.settleFilled(orderId)).to.be.revertedWith(
        "Invalid Status"
      );
    });

    it("Should be able to settle the order", async function () {
      // starting the token settle phase first
      await otcMarketplace.startTokenSettlePhase(
        getkeccak256(NALIKES_TOKEN_NAME),
        await nalikesToken.getAddress()
      );

      const orderBefore = await otcMarketplace.orders(
        await otcMarketplace.lastOrderId()
      );

      expect(orderBefore.status).to.be.equal(OrderStatus.OPEN);

      // now settling
      await nalikesToken
        .connect(alice)
        .approve(await otcMarketplace.getAddress(), ethers.parseEther("1000"));
      await otcMarketplace.connect(alice).settleFilled(1);

      // after settling
      const orderAfter = await otcMarketplace.orders(
        await otcMarketplace.lastOrderId()
      );
      expect(orderAfter.status).to.be.equal(OrderStatus.SETTLE_FILLED);
    });

    it("Buyer should be able to seize collateral when funds not released after Settle phase", async function () {
      const amount = ethers.parseEther("500");
      const value = ethers.parseUnits("1000", 6);
      // creating , deploying and distributing the token
      const tokenName = "TEST_TOKEN";
      await createToken(otcMarketplace, "TEST_TOKEN", ONE_WEEK);
      const testToken = await deployMockERC20(tokenName, tokenName, 18);
      await distributeTokens(
        testToken,
        [await alice.getAddress()],
        ethers.parseEther("50000"),
        admin
      );

      await createOffer(
        otcMarketplace,
        SELL_OFFER,
        getkeccak256(tokenName),
        amount,
        value,
        await usdt.getAddress(),
        alice
      );
      const lastOfferId = await otcMarketplace.lastOfferId();
      const offer = await otcMarketplace.offers(lastOfferId);
      // now filling the offer
      await fillOffer(otcMarketplace, lastOfferId, offer.amount, bob);

      // now entering into settle phase
      await otcMarketplace.startTokenSettlePhase(
        getkeccak256(tokenName),
        await testToken.getAddress()
      );

      // now fast forward one week to pass the settle phase so that buyer can seize the collateral
      await time.increase(ONE_WEEK);
      const lastOrderId = await otcMarketplace.lastOrderId();
      const orderBefore = await otcMarketplace.orders(lastOrderId);

      expect(orderBefore.status).to.be.equal(OrderStatus.OPEN);

      // seizing the collateral of seller
      await otcMarketplace.settleCancelled(await otcMarketplace.lastOrderId());

      const orderAfter = await otcMarketplace.orders(lastOrderId);

      expect(orderAfter.status).to.be.equal(OrderStatus.SETTLE_CANCELLED);
    });
  });
  describe("Buy tests with ERC20", function () {
    it("Should create a token for pre market", async function () {
      expect(
        (await otcMarketplace.tokens(getkeccak256(TOKEN_NAME_2))).settleDuration
      ).to.be.equal(ethers.ZeroAddress);

      await createToken(otcMarketplace, TOKEN_NAME_2, ONE_WEEK);

      expect(
        (await otcMarketplace.tokens(getkeccak256(TOKEN_NAME_2))).settleDuration
      ).to.be.equal(ONE_WEEK);
    });

    it("Should be able to create a BUY offer", async function () {
      const amount = ethers.parseEther("500");
      const value = ethers.parseUnits("1000", 6);

      await createOffer(
        otcMarketplace,
        BUY_OFFER,
        getkeccak256(TOKEN_NAME_2),
        amount,
        value,
        await usdt.getAddress(),
        alice
      );

      const lastOfferId = await otcMarketplace.lastOfferId();
      const offer = await otcMarketplace.offers(lastOfferId);
      console.log(offer, "this os offer");

      expect(offer.offerType).to.be.equal(BUY_OFFER);
      expect(offer.tokenId).to.be.equal(getkeccak256(TOKEN_NAME_2));
      expect(offer.exToken).to.be.equal(await usdt.getAddress());
      expect(offer.amount).to.be.equal(amount);
      expect(offer.value).to.be.equal(value);
    });

    it("Should be able to fill a BUY offer", async function () {
      const lastOfferId = await otcMarketplace.lastOfferId();
      const offerBefore = await otcMarketplace.offers(lastOfferId);
      expect(offerBefore.status).to.be.equal(OfferStatus.OPEN);

      // fill offer
      await fillOffer(otcMarketplace, lastOfferId, offerBefore.amount, bob);

      const offerAfterFill = await otcMarketplace.offers(
        await otcMarketplace.lastOfferId()
      );

      expect(offerAfterFill.status).to.be.equal(OfferStatus.FILLED);
      expect(offerAfterFill.filledAmount).to.be.equal(offerBefore.amount);
    });

    it("Should not allow to fill already filled order", async function () {
      const offerId = await otcMarketplace.lastOfferId();
      const offer = await otcMarketplace.offers(offerId);

      expect(offer.status).to.be.equal(OfferStatus.FILLED);

      await expect(
        fillOffer(otcMarketplace, offerId, offer.amount, bob)
      ).to.be.revertedWith("Invalid Offer Status");
    });

    it("Should not allow to Settle before Settle phase starts", async function () {
      const orderId = await otcMarketplace.lastOrderId();
      const order = await otcMarketplace.orders(orderId);

      expect(order.status).to.be.equal(OrderStatus.OPEN);

      // now trying to fill
      await expect(otcMarketplace.settleFilled(orderId)).to.be.revertedWith(
        "Invalid Status"
      );
    });

    it("Should be able to settle the order", async function () {
      // starting the token settle phase first
      await otcMarketplace.startTokenSettlePhase(
        getkeccak256(TOKEN_NAME_2),
        await mockToken2.getAddress()
      );
      const orderBefore = await otcMarketplace.orders(
        await otcMarketplace.lastOrderId()
      );

      expect(orderBefore.status).to.be.equal(OrderStatus.OPEN);

      // now settling
      await mockToken2
        .connect(bob)
        .approve(await otcMarketplace.getAddress(), ethers.parseEther("1000"));
      await otcMarketplace
        .connect(bob)
        .settleFilled(await otcMarketplace.lastOrderId());

      // after settling
      const orderAfter = await otcMarketplace.orders(
        await otcMarketplace.lastOrderId()
      );
      expect(orderAfter.status).to.be.equal(OrderStatus.SETTLE_FILLED);
    });

    it("Buyer should be able to seize collateral when funds not released after Settle phase", async function () {
      const amount = ethers.parseEther("500");
      const value = ethers.parseUnits("1000", 6);
      // creating , deploying and distributing the token
      const tokenName = "TEST_TOKEN_3";
      await createToken(otcMarketplace, "TEST_TOKEN_3", ONE_WEEK);
      const testToken = await deployMockERC20(tokenName, tokenName, 18);
      await distributeTokens(
        testToken,
        [await alice.getAddress()],
        ethers.parseEther("50000"),
        admin
      );

      await createOffer(
        otcMarketplace,
        BUY_OFFER,
        getkeccak256(tokenName),
        amount,
        value,
        await usdt.getAddress(),
        alice
      );
      const lastOfferId = await otcMarketplace.lastOfferId();
      const offer = await otcMarketplace.offers(lastOfferId);
      // now filling the offer
      await fillOffer(otcMarketplace, lastOfferId, offer.amount, bob);

      // now entering into settle phase
      await otcMarketplace.startTokenSettlePhase(
        getkeccak256(tokenName),
        await testToken.getAddress()
      );

      // now fast forward one week to pass the settle phase so that buyer can seize the collateral
      await time.increase(ONE_WEEK);
      const lastOrderId = await otcMarketplace.lastOrderId();
      const orderBefore = await otcMarketplace.orders(lastOrderId);

      expect(orderBefore.status).to.be.equal(OrderStatus.OPEN);

      // seizing the collateral of seller
      await otcMarketplace.settleCancelled(await otcMarketplace.lastOrderId());

      const orderAfter = await otcMarketplace.orders(lastOrderId);

      expect(orderAfter.status).to.be.equal(OrderStatus.SETTLE_CANCELLED);
    });
  });
  describe("Sell with ETH", function () {
    it("Should create a token for pre market", async function () {
      expect(
        (await otcMarketplace.tokens(getkeccak256(TOKEN_NAME_3))).settleDuration
      ).to.be.equal(ethers.ZeroAddress);

      await createToken(otcMarketplace, TOKEN_NAME_3, ONE_WEEK);

      expect(
        (await otcMarketplace.tokens(getkeccak256(TOKEN_NAME_3))).settleDuration
      ).to.be.equal(ONE_WEEK);
    });

    it("Should be able to create a SELL offer against ETH", async function () {
      const amount = ethers.parseEther("50000");
      const value = ethers.parseEther("1");

      await createOffer(
        otcMarketplace,
        SELL_OFFER,
        getkeccak256(TOKEN_NAME_3),
        amount,
        value,
        ethers.ZeroAddress,
        alice
      );

      const lastOfferId = await otcMarketplace.lastOfferId();
      const offer = await otcMarketplace.offers(lastOfferId);

      expect(offer.offerType).to.be.equal(SELL_OFFER);
      expect(offer.tokenId).to.be.equal(getkeccak256(TOKEN_NAME_3));
      expect(offer.exToken).to.be.equal(ethers.ZeroAddress);
      expect(offer.amount).to.be.equal(amount);
      expect(offer.value).to.be.equal(value);
    });

    it("Should be able to fill a SELL offer", async function () {
      const offerBefore = await otcMarketplace.offers(
        await otcMarketplace.lastOfferId()
      );
      expect(offerBefore.status).to.be.equal(OfferStatus.OPEN);

      // fill offer
      await fillOffer(
        otcMarketplace,
        await otcMarketplace.lastOfferId(),
        offerBefore.value,
        bob
      );

      const offerAfterFill = await otcMarketplace.offers(
        await otcMarketplace.lastOfferId()
      );

      expect(offerAfterFill.status).to.be.equal(OfferStatus.FILLED);
      expect(offerAfterFill.filledAmount).to.be.equal(offerBefore.amount);
    });

    it("Should not allow to fill already filled order", async function () {
      const offerId = await otcMarketplace.lastOfferId();
      const offer = await otcMarketplace.offers(offerId);

      expect(offer.status).to.be.equal(OfferStatus.FILLED);

      await expect(
        fillOffer(otcMarketplace, offerId, offer.value, bob)
      ).to.be.revertedWith("Invalid Offer Status");
    });

    it("Should not allow to Settle before Settle phase starts", async function () {
      const orderId = await otcMarketplace.lastOrderId();
      const order = await otcMarketplace.orders(orderId);

      expect(order.status).to.be.equal(OrderStatus.OPEN);

      // now trying to fill
      await expect(otcMarketplace.settleFilled(orderId)).to.be.revertedWith(
        "Invalid Status"
      );
    });

    it("Should be able to settle the order", async function () {
      const lastOrderId = await otcMarketplace.lastOrderId();
      // starting the token settle phase first
      await otcMarketplace.startTokenSettlePhase(
        getkeccak256(TOKEN_NAME_3),
        await mockToken3.getAddress()
      );

      const orderBefore = await otcMarketplace.orders(lastOrderId);

      expect(orderBefore.status).to.be.equal(OrderStatus.OPEN);

      // now settling
      await mockToken3
        .connect(alice)
        .approve(
          await otcMarketplace.getAddress(),
          ethers.parseEther("5000000")
        );
      await otcMarketplace.connect(alice).settleFilled(lastOrderId);

      // after settling
      const orderAfter = await otcMarketplace.orders(
        await otcMarketplace.lastOrderId()
      );
      expect(orderAfter.status).to.be.equal(OrderStatus.SETTLE_FILLED);
    });

    it("Buyer should be able to seize collateral when funds not released after Settle phase", async function () {
      const amount = ethers.parseEther("500");
      const value = ethers.parseUnits("1000", 6);
      // creating , deploying and distributing the token
      const tokenName = "TEST_TOKEN_009";
      await createToken(otcMarketplace, "TEST_TOKEN_009", ONE_WEEK);
      const testToken = await deployMockERC20(tokenName, tokenName, 18);
      await distributeTokens(
        testToken,
        [await alice.getAddress()],
        ethers.parseEther("50000"),
        admin
      );

      await createOffer(
        otcMarketplace,
        SELL_OFFER,
        getkeccak256(tokenName),
        amount,
        value,
        ethers.ZeroAddress,
        alice
      );
      const lastOfferId = await otcMarketplace.lastOfferId();
      const offer = await otcMarketplace.offers(lastOfferId);
      // now filling the offer
      await fillOffer(otcMarketplace, lastOfferId, offer.value, bob);

      // now entering into settle phase
      await otcMarketplace.startTokenSettlePhase(
        getkeccak256(tokenName),
        await testToken.getAddress()
      );

      // now fast forward one week to pass the settle phase so that buyer can seize the collateral
      await time.increase(ONE_WEEK);
      const lastOrderId = await otcMarketplace.lastOrderId();
      const orderBefore = await otcMarketplace.orders(lastOrderId);

      expect(orderBefore.status).to.be.equal(OrderStatus.OPEN);

      // seizing the collateral of seller
      await otcMarketplace.settleCancelled(await otcMarketplace.lastOrderId());

      const orderAfter = await otcMarketplace.orders(lastOrderId);

      expect(orderAfter.status).to.be.equal(OrderStatus.SETTLE_CANCELLED);
    });
  });
});
