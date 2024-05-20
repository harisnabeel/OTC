// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

error SettleDurationTooShort(uint duration);
error SettleDurationTooLong(uint duration);
error TokenAlreadyExist(address tokenAddress);

contract OTCMarketplace {
    using SafeERC20 for IERC20;

    // to recrive NATIVE currency
    receive() external payable {}

    // ENUM
    enum OfferType {
        BUY,
        SELL
    }

    enum TokenStatus {
        INACTIVE,
        ACTIVE,
        SETTLE
    }

    enum OfferStatus {
        NOT_CREATED,
        OPEN,
        FILLED,
        CANCELLED
    }

    enum OrderStatus {
        NOT_CREATED,
        OPEN,
        SETTLE_FILLED,
        SETTLE_CANCELLED,
        ORDER_CANCELLED
    }

    // STRUCTS
    struct Token {
        address token;
        uint48 settleTime; // when the settle time starts
        uint48 settleDuration;
        TokenStatus status; // inActive/active/settled
    }

    struct Offer {
        OfferType offerType;
        bytes32 tokenId;
        address exToken;
        uint256 amount;
        uint256 value;
        uint256 collateral;
        uint256 filledAmount;
        OfferStatus status;
        address offeredBy;
    }

    struct Order {
        uint256 offerId;
        uint256 amount;
        address seller;
        address buyer;
        OrderStatus status;
    }

    ////// STORAGE //////////

    //////// CONSTANTS ///////////

    uint public constant BASIS_POINTS = 10 ** 6; // represents 100%, e.g 1000 is 0.1%
    uint256 public constant MIN_SETTLE_DURATION = 1 days;
    ///@notice to avoid DOS
    uint256 public constant MAX_SETTLE_DURATION = 7 days;

    // MAPPINGS

    /// @notice tokenId is generated as keccak256("token/project name")
    mapping(bytes32 tokenId => Token) public tokens;

    /// @notice keeps track whether a token can be used for payment/collateralor not
    mapping(address tokenAddress => bool isWhitelisted)
        public whitelistedTokens;

    /// @notice keeps track of offers
    mapping(uint256 offerId => Offer offer) public offers;

    /// @notice keeps track of orders
    mapping(uint256 orderId => Order order) orders;

    /// @notice currently 1:1 ratio
    uint public collateralRatio = BASIS_POINTS;

    /// @notice keeps track of last created offer id
    uint public lastOfferId;

    /// @notice keeps track of last order id
    uint256 lastOrderId;

    // EVENTS
    // @todo change events naming convention
    event NewToken(bytes32 tokenId, uint256 settleDuration);

    event NewOffer(
        uint256 id,
        OfferType offerType,
        bytes32 tokenId,
        address exToken,
        uint256 amount,
        uint256 value,
        uint256 collateral,
        address doer
    );

    event UpdatedTokensWhitelist(address[] tokens, bool isAccepted);

    event CloseOffer(uint256 offerId);

    event NewOrder(
        uint256 id,
        uint256 offerId,
        uint256 amount,
        address seller,
        address buyer
    );

    /// @notice places BUY/SELL order
    /// @dev tokenId is generated from keccak256("token/project name")
    /// @param offerType buy or sell
    /// @param tokenId unique token id of token that user wants to BUY/SELL
    /// @param amount amount of tokens wants to BUY/SELL
    /// @param value buy = amount user is paying , sell = collateral to lock
    /// @param exToken (exchangeToken) buy = payment token, sell = collateral token
    // @todo put re-entrancy guard here
    function newOffer(
        OfferType offerType,
        bytes32 tokenId,
        uint256 amount, // what i'm expecting
        uint256 value, // what i'm willing to give
        address exToken // what i'm paying myself
    ) external payable {
        Token memory token = tokens[tokenId];
        require(token.status == TokenStatus.ACTIVE, "Invalid Token");
        require(whitelistedTokens[exToken], "Invalid Offer Token");
        require(amount > 0 && value > 0, "Invalid Amount or Value");
        IERC20 iexToken = IERC20(exToken);
        // collateral
        uint256 collateral = (value * collateralRatio) / BASIS_POINTS;

        // transfer offer value (offer buy) or collateral (offer sell)
        uint256 _transferAmount = offerType == OfferType.BUY
            ? value
            : collateral;

        _getAmountFromUser(iexToken, _transferAmount);

        // create new offer
        _newOffer(offerType, tokenId, exToken, amount, value, collateral);
    }

    function _getAmountFromUser(
        IERC20 _iexToken,
        uint _transferAmount
    ) internal {
        // collateral/payment currency is in ETH
        if (address(_iexToken) == address(0)) {
            require(msg.value == _transferAmount, "Insufficient msg.value");
        }
        // collateral/payment currency is some whitelisted ERC20
        else {
            _iexToken.safeTransferFrom(
                msg.sender,
                address(this),
                _transferAmount
            );
        }
    }

    function _newOffer(
        OfferType offerType,
        bytes32 tokenId,
        address exToken,
        uint256 amount,
        uint256 value,
        uint256 collateral
    ) internal {
        offers[++lastOfferId] = Offer(
            offerType,
            tokenId,
            exToken,
            amount,
            value,
            collateral,
            0,
            OfferStatus.OPEN,
            msg.sender
        );

        emit NewOffer(
            lastOfferId,
            offerType,
            tokenId,
            exToken,
            amount,
            value,
            collateral,
            msg.sender
        );
    }

    function createToken(bytes32 tokenId, uint48 settleDuration) external {
        _validateSettleDuration(settleDuration);
        _verifyTokenExistance(tokenId);

        Token storage token = tokens[tokenId];

        token.settleDuration = settleDuration;
        token.status = TokenStatus.ACTIVE;
        emit NewToken(tokenId, settleDuration);
    }

    function _validateSettleDuration(uint48 _settleDuration) internal pure {
        if (_settleDuration < MIN_SETTLE_DURATION) {
            revert SettleDurationTooShort(_settleDuration);
        } else if (_settleDuration > MAX_SETTLE_DURATION) {
            revert SettleDurationTooLong(_settleDuration);
        }
    }

    function _verifyTokenExistance(bytes32 _tokenId) internal view {
        Token memory token = tokens[_tokenId];
        if (
            token.status != TokenStatus.INACTIVE &&
            token.settleDuration != 0 &&
            token.token != address(0)
        ) {
            revert TokenAlreadyExist(token.token);
        }
    }

    // @todo put access controller whereever needed
    function setTokensWhitelist(
        address[] memory tokenAddresses,
        bool isAccepted
    ) external {
        uint arrLength = tokenAddresses.length;
        for (uint256 i = 0; i < arrLength; i++) {
            whitelistedTokens[tokenAddresses[i]] = isAccepted;
        }
        emit UpdatedTokensWhitelist(tokenAddresses, isAccepted);
    }

    // FILL OFFER STUFF

    // @todo make this nonReentrant
    function fillOffer(uint256 offerId, uint256 amount) external payable {
        Offer storage offer = offers[offerId];
        Token storage token = tokens[offer.tokenId];

        require(offer.status == OfferStatus.OPEN, "Invalid Offer Status");
        require(token.status == TokenStatus.ACTIVE, "Invalid token Status");
        require(amount > 0, "Invalid Amount");
        // @todo partial fill is not suppported, to be done
        require(offer.amount == amount, "FullMatch required");

        uint256 _transferAmount;
        address buyer;
        address seller;
        if (offer.offerType == OfferType.BUY) {
            _transferAmount = (offer.collateral * amount) / offer.amount;
            buyer = offer.offeredBy;
            seller = msg.sender;
        } else {
            _transferAmount = (offer.value * amount) / offer.amount;
            buyer = msg.sender;
            seller = offer.offeredBy;
        }
        // transfer value or collecteral
        _getAmountFromUser(IERC20(offer.exToken), _transferAmount);
        // new order
        _fillOffer(offerId, amount, buyer, seller);
    }

    function _fillOffer(
        uint256 offerId,
        uint256 amount,
        address buyer,
        address seller
    ) internal {
        Offer storage offer = offers[offerId];
        // new order
        orders[++lastOrderId] = Order(
            offerId,
            amount,
            seller,
            buyer,
            OrderStatus.OPEN
        );

        // check if offer is fullfilled
        offer.filledAmount += amount;
        offer.status = OfferStatus.FILLED;
        emit CloseOffer(offerId);

        emit NewOrder(lastOrderId, offerId, amount, seller, buyer);
    }
}
