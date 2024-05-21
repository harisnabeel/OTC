# How to use this repo

## Clone

`git clone https://github.com/harisnabeel/OTC.git `

## Install

`yarn install `

## Run tests

`yarn test `

## Deploy on local host

`yarn deploy `

# Current state

1 - Allows creation of BUY/SELL offers for tokens that are yet to lauch. => `createNewOffer()0`

2 - Allows Users to fill existing BUY/SELL offers => `fulfillOffer()`

3 - Allows Seller to settle when Settle phase starts => `settleFilled()`

4 - Allows buyer to seize Sellers collateral in case Seller do not releases tokens during settle phase => ` settleCancelled`

## Future Work

1 - Allow to cancel offers

2 - Allows partial filling
