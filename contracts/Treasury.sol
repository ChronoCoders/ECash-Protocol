// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @title Treasury
 * @dev Manages protocol assets with allocation controls and spending limits
 */
contract Treasury is Initializable, AccessControlUpgradeable, ReentrancyGuardUpgradeable {
    bytes32 public constant ALLOCATOR_ROLE = keccak256("ALLOCATOR_ROLE");
    bytes32 public constant SPENDER_ROLE = keccak256("SPENDER_ROLE");

    struct AssetInfo {
        uint256 totalBalance;
        uint256 strategicReserve;
        uint256 ecosystemFunding;
        uint256 liquidityIncentives;
        uint256 operations;
        bool isActive;
    }

    mapping(address => AssetInfo) public assets;
    address[] public assetList;
    
    uint256 public constant ALLOCATION_PRECISION = 10000; // 100.00%
    
    event AssetReceived(address indexed asset, uint256 amount, string source);
    event AssetAllocated(address indexed asset, uint256[4] allocations);
    event AssetTransferred(address indexed asset, address indexed to, uint256 amount, string purpose);

    function initialize(address admin) public initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ALLOCATOR_ROLE, admin);
        _grantRole(SPENDER_ROLE, admin);
    }

    function receiveAsset(
        address asset,
        uint256 amount,
        string memory source
    ) external onlyRole(ALLOCATOR_ROLE) nonReentrant {
        require(asset != address(0), "Invalid asset");
        require(amount > 0, "Amount must be positive");

        if (!assets[asset].isActive) {
            assets[asset].isActive = true;
            assetList.push(asset);
        }

        assets[asset].totalBalance += amount;
        IERC20Upgradeable(asset).transferFrom(msg.sender, address(this), amount);
        
        emit AssetReceived(asset, amount, source);
    }

    function allocateAsset(
        address asset,
        uint256[4] memory allocations // [strategic, ecosystem, liquidity, operations]
    ) external onlyRole(ALLOCATOR_ROLE) {
        require(assets[asset].isActive, "Asset not active");
        
        uint256 totalAllocation = allocations[0] + allocations[1] + allocations[2] + allocations[3];
        require(totalAllocation == ALLOCATION_PRECISION, "Invalid allocation");

        uint256 totalBalance = assets[asset].totalBalance;
        
        assets[asset].strategicReserve = (totalBalance * allocations[0]) / ALLOCATION_PRECISION;
        assets[asset].ecosystemFunding = (totalBalance * allocations[1]) / ALLOCATION_PRECISION;
        assets[asset].liquidityIncentives = (totalBalance * allocations[2]) / ALLOCATION_PRECISION;
        assets[asset].operations = (totalBalance * allocations[3]) / ALLOCATION_PRECISION;

        emit AssetAllocated(asset, allocations);
    }

    function transferAsset(
        address asset,
        address to,
        uint256 amount,
        string memory purpose,
        uint8 source // 0: strategic, 1: ecosystem, 2: liquidity, 3: operations
    ) external onlyRole(SPENDER_ROLE) nonReentrant {
        require(assets[asset].isActive, "Asset not active");
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be positive");

        AssetInfo storage assetInfo = assets[asset];
        
        if (source == 0) {
            require(assetInfo.strategicReserve >= amount, "Insufficient strategic reserve");
            assetInfo.strategicReserve -= amount;
        } else if (source == 1) {
            require(assetInfo.ecosystemFunding >= amount, "Insufficient ecosystem funding");
            assetInfo.ecosystemFunding -= amount;
        } else if (source == 2) {
            require(assetInfo.liquidityIncentives >= amount, "Insufficient liquidity incentives");
            assetInfo.liquidityIncentives -= amount;
        } else if (source == 3) {
            require(assetInfo.operations >= amount, "Insufficient operations fund");
            assetInfo.operations -= amount;
        } else {
            revert("Invalid source");
        }

        assetInfo.totalBalance -= amount;
        IERC20Upgradeable(asset).transfer(to, amount);
        
        emit AssetTransferred(asset, to, amount, purpose);
    }

    function getAssetInfo(address asset) external view returns (AssetInfo memory) {
        return assets[asset];
    }

    function getAssetCount() external view returns (uint256) {
        return assetList.length;
    }

    function emergencyWithdraw(
        address asset,
        address to,
        uint256 amount
    ) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        require(to != address(0), "Invalid recipient");
        IERC20Upgradeable(asset).transfer(to, amount);
    }
}
