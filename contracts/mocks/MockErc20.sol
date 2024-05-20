// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockErc20 is ERC20, Ownable {
    uint8 private _decimals;

    constructor(
        string memory _name,
        string memory _symbol,
        uint8 _tokensDecimals
    ) ERC20(_name, _symbol) Ownable(msg.sender) {
        _decimals = _tokensDecimals;
        _mint(msg.sender, 100 * 10 ** 6 * 10 ** _tokensDecimals);
    }

    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }
}
