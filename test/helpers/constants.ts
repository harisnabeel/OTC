import { BigNumberish } from "ethers";

export const BUY_OFFER: BigNumberish = 0;
export const SELL_OFFER: BigNumberish = 1;
export const ONE_WEEK: BigNumberish = 86400 * 7;
export const NALIKES_TOKEN_NAME: string = "NALIKES";
export const TOKEN_NAME_2: string = "TOKEN_NAME_2";
export const TOKEN_NAME_3: string = "TOKEN_NAME_3";

export enum OfferStatus {
  NOT_CREATED,
  OPEN,
  FILLED,
  CANCELLED,
}

export enum OrderStatus {
  NOT_CREATED,
  OPEN,
  SETTLE_FILLED,
  SETTLE_CANCELLED,
  ORDER_CANCELLED,
}
