// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

error SettleDurationTooShort(uint duration);
error SettleDurationTooLong(uint duration);
error TokenAlreadyExist(address tokenAddress);
error TokenNotCreated(bytes32 tokenId);

contract OTCMarketplace is Ownable, ReentrancyGuard {
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
    uint256 public constant MAX_SETTLE_DURATION = 7 days; //@note can be changed accordingly

    // MAPPINGS

    /// @notice tokenId is generated as keccak256("token/project name")
    mapping(bytes32 tokenId => Token token) public tokens;

    /// @notice keeps track whether a token can be used for payment/collateralor not
    mapping(address tokenAddress => bool isWhitelisted)
        public whitelistedTokens;

    /// @notice keeps track of offers
    mapping(uint256 offerId => Offer offer) public offers;

    /// @notice keeps track of orders
    mapping(uint256 orderId => Order order) public orders;

    /// @notice currently 1:1 ratio
    uint public collateralRatio = BASIS_POINTS;

    /// @notice keeps track of last created offer id
    uint public lastOfferId;

    /// @notice keeps track of last order id
    uint256 public lastOrderId;

    // EVENTS
    event NewTokenCreated(bytes32 tokenId, uint256 settleDuration);

    event NewOfferCreated(
        uint256 id,
        OfferType offerType,
        bytes32 tokenId,
        address exToken,
        uint256 amount,
        uint256 value,
        uint256 collateral,
        address doer
    );

    event TokensWhitelistUpdated(address[] tokens, bool isAccepted);

    event OfferClosed(uint256 offerId);

    event NewOrderCreated(
        uint256 id,
        uint256 offerId,
        uint256 amount,
        address seller,
        address buyer
    );

    event TokenSettlePhaseStarted(
        bytes32 tokenId,
        address tokenAddress,
        uint settleTime
    );

    event TokenSettleDurationUpdated(
        bytes32 tokenId,
        uint48 oldValue,
        uint48 newValue
    );

    event SettleFilled(uint256 orderId, uint256 totalValue, address caller);

    event SettleCancelled(uint256 orderId, uint256 totalValue, address caller);

    event CollateralRatioUpdated(uint oldValue, uint newValue);

    constructor() Ownable(msg.sender) {}

    /// @notice places BUY/SELL order
    /// @dev tokenId is generated from keccak256("token/project name")
    /// @param offerType buy or sell
    /// @param tokenId unique token id of token that user wants to BUY/SELL
    /// @param amount amount of tokens wants to BUY/SELL
    /// @param value buy = amount user is paying , sell = collateral to lock
    /// @param exToken (exchangeToken) buy = payment token, sell = collateral token
    function createNewOffer(
        OfferType offerType,
        bytes32 tokenId,
        uint256 amount,
        uint256 value,
        address exToken
    ) external payable nonReentrant {
        Token memory token = tokens[tokenId];
        require(token.status == TokenStatus.ACTIVE, "Invalid Token");
        require(whitelistedTokens[exToken], "Invalid Offer Token");
        require(amount > 0 && value > 0, "Invalid Amount or Value");
        IERC20 iexToken = IERC20(exToken);
        uint256 collateral = (value * collateralRatio) / BASIS_POINTS;

        // transfer offer value (offer buy) or collateral (offer sell)
        uint256 _transferAmount = offerType == OfferType.BUY
            ? value
            : collateral;

        _getAmountFromUser(iexToken, _transferAmount);

        _newOffer(offerType, tokenId, exToken, amount, value, collateral);
    }

    /// @notice fulfills an offer by offer id
    /// @param offerId id to offer wants to fulfill

    function fulfillOffer(uint256 offerId) external payable nonReentrant {
        Offer storage offer = offers[offerId];
        Token storage token = tokens[offer.tokenId];

        require(offer.status == OfferStatus.OPEN, "Invalid Offer Status");
        require(token.status == TokenStatus.ACTIVE, "Invalid token Status");
        uint256 _transferAmount;
        address buyer;
        address seller;
        if (offer.offerType == OfferType.BUY) {
            _transferAmount = offer.collateral;
            buyer = offer.offeredBy;
            seller = msg.sender;
        } else {
            _transferAmount = offer.value;
            buyer = msg.sender;
            seller = offer.offeredBy;
        }
        // transfer value or collecteral
        _getAmountFromUser(IERC20(offer.exToken), _transferAmount);

        _fillOffer(offerId, offer.amount, buyer, seller);
    }

    //////////////////////////////////// SETTLE STUFF ///////////////////////////////////////////////////////////////////////

    /// @notice called when Settle phase is started and seller wants to pay the Buyer and reclaim the collatereal
    function settleFilled(uint256 orderId) public payable nonReentrant {
        Order storage order = orders[orderId];
        Offer storage offer = offers[order.offerId];
        Token storage token = tokens[offer.tokenId];

        // check condition
        require(token.status == TokenStatus.SETTLE, "Invalid Status");
        require(token.token != address(0), "Token Not Set");
        require(
            block.timestamp > token.settleTime,
            "Settling Time Not Started"
        );
        require(order.seller == msg.sender, "Seller Only");
        require(order.status == OrderStatus.OPEN, "Invalid Order Status");

        uint256 value = offer.value;

        IERC20 iToken = IERC20(token.token);
        uint256 tokenAmount = order.amount;

        iToken.safeTransferFrom(order.seller, order.buyer, tokenAmount);

        // transfer liquid to seller
        uint256 totalValue = value + offer.collateral;
        if (offer.exToken == address(0)) {
            (bool success, ) = order.seller.call{value: totalValue}("");
            require(success, "Transfer Funds Fail");
        } else {
            IERC20 iexToken = IERC20(offer.exToken);
            iexToken.safeTransfer(order.seller, totalValue);
        }

        order.status = OrderStatus.SETTLE_FILLED;

        emit SettleFilled(orderId, totalValue, msg.sender);
    }

    /// @notice when settle phase is passed and order is not fulfilled by seller
    /// @dev callable by anyone
    function settleCancelled(uint256 orderId) public nonReentrant {
        Order storage order = orders[orderId];
        Offer storage offer = offers[order.offerId];
        Token storage token = tokens[offer.tokenId];

        require(token.status == TokenStatus.SETTLE, "Invalid Status");
        require(
            block.timestamp > token.settleTime + token.settleDuration,
            "Settling Time Not Ended Yet"
        );
        require(order.status == OrderStatus.OPEN, "Invalid Order Status");

        uint256 value = offer.value;

        // transfer liquid to buyer
        uint256 totalValue = value + offer.collateral;
        if (offer.exToken == address(0)) {
            (bool success, ) = order.buyer.call{value: totalValue}("");
            require(success, "Transfer Funds Fail");
        } else {
            IERC20 iexToken = IERC20(offer.exToken);
            iexToken.safeTransfer(order.buyer, totalValue);
        }

        order.status = OrderStatus.SETTLE_CANCELLED;

        emit SettleCancelled(orderId, totalValue, msg.sender);
    }

    //////////////////////////////////// INTERNALS ///////////////////////////////////////////////////////////////////////

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
            OfferStatus.OPEN,
            msg.sender
        );

        emit NewOfferCreated(
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

    function _fillOffer(
        uint256 offerId,
        uint256 amount,
        address buyer,
        address seller
    ) internal {
        Offer storage offer = offers[offerId];
        orders[++lastOrderId] = Order(
            offerId,
            amount,
            seller,
            buyer,
            OrderStatus.OPEN
        );

        offer.status = OfferStatus.FILLED;
        emit OfferClosed(offerId);

        emit NewOrderCreated(lastOrderId, offerId, amount, seller, buyer);
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

    function _verifyTokenExistance(bytes32 _tokenId) internal view {
        Token memory token = tokens[_tokenId];
        if (token.status != TokenStatus.INACTIVE && token.settleDuration != 0) {
            revert TokenAlreadyExist(token.token);
        }
    }

    function _validateSettleDuration(uint48 _settleDuration) internal pure {
        if (_settleDuration < MIN_SETTLE_DURATION) {
            revert SettleDurationTooShort(_settleDuration);
        } else if (_settleDuration > MAX_SETTLE_DURATION) {
            revert SettleDurationTooLong(_settleDuration);
        }
    }

    //////////////////////////////////// ADMIN OPERATIONS ///////////////////////////////////////////////////////////////////////
    function createToken(
        bytes32 tokenId,
        uint48 settleDuration
    ) external onlyOwner {
        _validateSettleDuration(settleDuration);
        _verifyTokenExistance(tokenId);

        Token storage token = tokens[tokenId];

        token.settleDuration = settleDuration;
        token.status = TokenStatus.ACTIVE;
        emit NewTokenCreated(tokenId, settleDuration);
    }

    /// @notice whitelists those tokens that we allow for payment
    function setTokensWhitelist(
        address[] memory tokenAddresses,
        bool isAccepted
    ) external onlyOwner {
        uint arrLength = tokenAddresses.length;
        for (uint256 i = 0; i < arrLength; i++) {
            whitelistedTokens[tokenAddresses[i]] = isAccepted;
        }
        emit TokensWhitelistUpdated(tokenAddresses, isAccepted);
    }

    /// @notice starts the settle phase.
    /// @dev sell will fulfill orders after this function call
    function startTokenSettlePhase(
        bytes32 tokenId,
        address tokenAddress
    ) external onlyOwner {
        Token storage _token = tokens[tokenId];
        require(tokenAddress != address(0), "Invalid Token Address");
        require(
            _token.status == TokenStatus.ACTIVE ||
                _token.status == TokenStatus.INACTIVE,
            "Invalid Token Status"
        );
        _token.token = tokenAddress;
        _token.status = TokenStatus.SETTLE;
        _token.settleTime = uint48(block.timestamp);

        emit TokenSettlePhaseStarted(tokenId, tokenAddress, block.timestamp);
    }

    /// @notice to control how much seller must deposit as collateral
    function updateCollateralRatio(uint newRatio) external onlyOwner {
        uint oldValue = collateralRatio;
        collateralRatio = newRatio;
        emit CollateralRatioUpdated(oldValue, newRatio);
    }

    function updateSettleDuration(
        bytes32 tokenId,
        uint48 newDuration
    ) external onlyOwner {
        _validateSettleDuration(newDuration);
        Token storage _token = tokens[tokenId];
        if (_token.status != TokenStatus.ACTIVE) {
            revert TokenNotCreated(tokenId);
        }
        uint48 oldValue = _token.settleDuration;
        _token.settleDuration = newDuration;
        emit TokenSettleDurationUpdated(tokenId, oldValue, newDuration);
    }
}
