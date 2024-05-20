import { ethers } from "hardhat";
import { MockErc20, OTCMarketplace } from "../../typechain-types";
import { BigNumberish, BytesLike, Signer } from "ethers";

export async function createToken(
  otcMarketplace: OTCMarketplace,
  tokenName: string,
  settleDuration: BigNumberish
) {
  let tx = await otcMarketplace.createToken(
    getkeccak256(tokenName),
    settleDuration
  );
  await tx.wait();
}

export async function createOffer(
  otcMarketplace: OTCMarketplace,
  offerType: BigNumberish,
  tokenId: BytesLike,
  amount: BigNumberish,
  value: BigNumberish,
  exToken: string,
  signer: Signer
) {
  if (exToken !== ethers.ZeroAddress) {
    await approveTokens(
      exToken,
      await otcMarketplace.getAddress(),
      value,
      signer
    );
  }
  let tx = await otcMarketplace
    .connect(signer)
    .newOffer(offerType, tokenId, amount, value, exToken, {
      value: exToken === ethers.ZeroAddress ? value : 0,
    });
  await tx.wait();
}

export function getkeccak256(tokenName: string): BytesLike {
  return ethers.keccak256(ethers.toUtf8Bytes(tokenName));
}

async function approveTokens(
  token: string,
  to: string,
  amount: BigNumberish,
  signer: Signer
) {
  const tokenInstance = await ethers.getContractAt("MockErc20", token);
  await tokenInstance.connect(signer).approve(to, amount);
}

export async function distributeTokens(
  token: MockErc20,
  receivers: string[],
  amount: BigNumberish,
  signer: Signer
) {
  for (const receiver of receivers) {
    await token.connect(signer).transfer(receiver, amount);
  }
}
