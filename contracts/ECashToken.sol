// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @title ECashToken
 * @dev Rebasing ERC-20 token that maintains $1 peg through elastic supply
 * @notice Enhanced version with improved precision and safety measures
 */
contract ECashToken is 
    Initializable, 
    ERC20Upgradeable, 
    AccessControlUpgradeable, 
    PausableUpgradeable, 
    ReentrancyGuardUpgradeable 
{
    bytes32 public constant REBASER_ROLE = keccak256("REBASER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    // Enhanced constants for better precision
    uint256 private constant MAX_UINT256 = type(uint256).max;
    uint256 private constant INITIAL_FRAGMENTS_SUPPLY = 1_000_000 * 10**18;
    uint256 private constant TOTAL_GONS = MAX_UINT256 - (MAX_UINT256 % INITIAL_FRAGMENTS_SUPPLY);
    uint256 private constant MAX_SUPPLY = type(uint128).max;
    uint256 private constant MIN_SUPPLY = 1000 * 10**18; // Minimum 1000 tokens
    
    // Precision constants
    uint256 private constant PRECISION = 10**18;
    uint256 private constant MAX_REBASE_FREQUENCY = 1 hours;
    uint256 private constant MAX_REBASE_AMOUNT = 50e16; // 50% max change per rebase

    uint256 private _totalSupply;
    uint256 private _gonsPerFragment;
    mapping(address => uint256) private _gonBalances;
    mapping(address => mapping(address => uint256)) private _allowedFragments;

    // Enhanced tracking
    uint256 public rebaseCount;
    uint256 public lastRebaseTime;
    mapping(uint256 => uint256) public rebaseTimestamps;
    mapping(uint256 => int256) public rebaseAmounts;

    // Safety limits
    uint256 public maxRebaseAmountPercentage;
    uint256 public minRebaseInterval;
    bool public rebasePaused;

    event Rebase(uint256 indexed epoch, uint256 totalSupply, uint256 supplyDelta, bool positive);
    event LogRebase(uint256 indexed epoch, uint256 totalSupply);
    event RebaseParametersUpdated(string parameter, uint256 oldValue, uint256 newValue);
    event RebasePaused(bool paused);

    modifier onlyRebaser() {
        require(hasRole(REBASER_ROLE, msg.sender), "Not authorized to rebase");
        _;
    }

    modifier rebaseNotPaused() {
        require(!rebasePaused, "Rebase is paused");
        _;
    }

    modifier validRebaseAmount(int256 supplyDelta) {
        if (supplyDelta != 0) {
            uint256 currentSupply = _totalSupply;
            uint256 maxChange = (currentSupply * maxRebaseAmountPercentage) / PRECISION;
            uint256 absChange = supplyDelta < 0 ? uint256(-supplyDelta) : uint256(supplyDelta);
            require(absChange <= maxChange, "Rebase amount too large");
        }
        _;
    }

    modifier rebaseFrequencyCheck() {
        require(
            block.timestamp >= lastRebaseTime + minRebaseInterval,
            "Rebase too frequent"
        );
        _;
    }

    function initialize(
        string memory name,
        string memory symbol,
        address admin
    ) public initializer {
        require(admin != address(0), "Invalid admin address");
        require(bytes(name).length > 0, "Invalid name");
        require(bytes(symbol).length > 0, "Invalid symbol");

        __ERC20_init(name, symbol);
        __AccessControl_init();
        __Pausable_init();
        __ReentrancyGuard_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REBASER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);

        _totalSupply = INITIAL_FRAGMENTS_SUPPLY;
        _gonBalances[admin] = TOTAL_GONS;
        _gonsPerFragment = TOTAL_GONS / _totalSupply;

        // Set default parameters
        maxRebaseAmountPercentage = MAX_REBASE_AMOUNT;
        minRebaseInterval = MAX_REBASE_FREQUENCY;

        emit Transfer(address(0), admin, _totalSupply);
    }

    /**
     * @dev Enhanced rebase function with comprehensive safety checks
     */
    function rebase(int256 supplyDelta) 
        external 
        onlyRebaser 
        whenNotPaused 
        nonReentrant
        rebaseNotPaused
        validRebaseAmount(supplyDelta)
        rebaseFrequencyCheck
        returns (uint256) 
    {
        rebaseCount++;
        lastRebaseTime = block.timestamp;
        
        if (supplyDelta == 0) {
            emit LogRebase(rebaseCount, _totalSupply);
            _recordRebase(0);
            return _totalSupply;
        }

        uint256 newTotalSupply = _calculateNewSupply(supplyDelta);
        
        // Validate new supply bounds
        require(newTotalSupply >= MIN_SUPPLY, "Supply below minimum");
        require(newTotalSupply <= MAX_SUPPLY, "Supply above maximum");

        uint256 oldSupply = _totalSupply;
        _totalSupply = newTotalSupply;
        
        // Recalculate with enhanced precision
        _gonsPerFragment = TOTAL_GONS / _totalSupply;

        // Record rebase data
        _recordRebase(supplyDelta);

        emit Rebase(
            rebaseCount, 
            _totalSupply, 
            uint256(supplyDelta > 0 ? supplyDelta : -supplyDelta), 
            supplyDelta > 0
        );
        emit LogRebase(rebaseCount, _totalSupply);

        return _totalSupply;
    }

    /**
     * @dev Calculate new supply with enhanced precision
     */
    function _calculateNewSupply(int256 supplyDelta) internal view returns (uint256) {
        uint256 currentSupply = _totalSupply;
        
        if (supplyDelta < 0) {
            uint256 deltaAbs = uint256(-supplyDelta);
            if (deltaAbs >= currentSupply) {
                return MIN_SUPPLY; // Floor at minimum supply
            }
            return currentSupply - deltaAbs;
        } else {
            uint256 deltaAbs = uint256(supplyDelta);
            uint256 newSupply = currentSupply + deltaAbs;
            if (newSupply < currentSupply) { // Overflow check
                return MAX_SUPPLY;
            }
            return newSupply > MAX_SUPPLY ? MAX_SUPPLY : newSupply;
        }
    }

    /**
     * @dev Record rebase for historical tracking
     */
    function _recordRebase(int256 supplyDelta) internal {
        rebaseTimestamps[rebaseCount] = block.timestamp;
        rebaseAmounts[rebaseCount] = supplyDelta;
    }

    /**
     * @dev Get total supply
     */
    function totalSupply() public view override returns (uint256) {
        return _totalSupply;
    }

    /**
     * @dev Get balance with overflow protection
     */
    function balanceOf(address account) public view override returns (uint256) {
        if (_gonsPerFragment == 0) return 0;
        return _gonBalances[account] / _gonsPerFragment;
    }

    /**
     * @dev Get scaled balance (internal representation)
     */
    function scaledBalanceOf(address account) external view returns (uint256) {
        return _gonBalances[account];
    }

    /**
     * @dev Enhanced transfer with additional validation
     */
    function transfer(address to, uint256 amount) 
        public 
        override 
        whenNotPaused 
        nonReentrant
        returns (bool) 
    {
        require(to != address(0), "Transfer to zero address");
        require(to != address(this), "Transfer to contract");
        require(amount > 0, "Transfer amount must be positive");
        
        address owner = msg.sender;
        uint256 gonAmount = _calculateGonAmount(amount);
        
        require(_gonBalances[owner] >= gonAmount, "Insufficient balance");
        
        _gonBalances[owner] -= gonAmount;
        _gonBalances[to] += gonAmount;
        
        emit Transfer(owner, to, amount);
        return true;
    }

    /**
     * @dev Enhanced transferFrom with additional validation
     */
    function transferFrom(address from, address to, uint256 amount) 
        public 
        override 
        whenNotPaused 
        nonReentrant
        returns (bool) 
    {
        require(from != address(0), "Transfer from zero address");
        require(to != address(0), "Transfer to zero address");
        require(to != address(this), "Transfer to contract");
        require(amount > 0, "Transfer amount must be positive");
        
        uint256 gonAmount = _calculateGonAmount(amount);
        
        require(_gonBalances[from] >= gonAmount, "Insufficient balance");
        
        // Handle allowance
        uint256 currentAllowance = _allowedFragments[from][msg.sender];
        if (currentAllowance != type(uint256).max) {
            require(currentAllowance >= amount, "Insufficient allowance");
            _allowedFragments[from][msg.sender] = currentAllowance - amount;
        }

        _gonBalances[from] -= gonAmount;
        _gonBalances[to] += gonAmount;
        
        emit Transfer(from, to, amount);
        return true;
    }

    /**
     * @dev Calculate gon amount with overflow protection
     */
    function _calculateGonAmount(uint256 amount) internal view returns (uint256) {
        if (_gonsPerFragment == 0 || amount == 0) return 0;
        
        // Check for overflow
        if (amount > type(uint256).max / _gonsPerFragment) {
            revert("Amount too large");
        }
        
        return amount * _gonsPerFragment;
    }

    /**
     * @dev Standard approve function
     */
    function approve(address spender, uint256 amount) public override returns (bool) {
        require(spender != address(0), "Approve to zero address");
        
        _allowedFragments[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    /**
     * @dev Get allowance
     */
    function allowance(address owner, address spender) public view override returns (uint256) {
        return _allowedFragments[owner][spender];
    }

    /**
     * @dev Update rebase parameters (admin only)
     */
    function updateMaxRebaseAmountPercentage(uint256 _maxRebaseAmountPercentage) 
        external 
        onlyRole(DEFAULT_ADMIN_ROLE) 
    {
        require(_maxRebaseAmountPercentage >= 1e16, "Too low"); // Min 1%
        require(_maxRebaseAmountPercentage <= 100e16, "Too high"); // Max 100%
        
        uint256 oldValue = maxRebaseAmountPercentage;
        maxRebaseAmountPercentage = _maxRebaseAmountPercentage;
        emit RebaseParametersUpdated("maxRebaseAmountPercentage", oldValue, _maxRebaseAmountPercentage);
    }

    function updateMinRebaseInterval(uint256 _minRebaseInterval) 
        external 
        onlyRole(DEFAULT_ADMIN_ROLE) 
    {
        require(_minRebaseInterval >= 5 minutes, "Too frequent");
        require(_minRebaseInterval <= 1 days, "Too infrequent");
        
        uint256 oldValue = minRebaseInterval;
        minRebaseInterval = _minRebaseInterval;
        emit RebaseParametersUpdated("minRebaseInterval", oldValue, _minRebaseInterval);
    }

    /**
     * @dev Pause/unpause rebases
     */
    function setRebasePaused(bool _paused) external onlyRole(PAUSER_ROLE) {
        rebasePaused = _paused;
        emit RebasePaused(_paused);
    }

    /**
     * @dev Pause contract
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @dev Unpause contract
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @dev Get rebase information
     */
    function getRebaseInfo(uint256 epoch) external view returns (
        uint256 timestamp,
        int256 amount,
        uint256 newSupply
    ) {
        require(epoch <= rebaseCount, "Invalid epoch");
        timestamp = rebaseTimestamps[epoch];
        amount = rebaseAmounts[epoch];
        // Calculate supply at that time (approximation)
        newSupply = epoch == rebaseCount ? _totalSupply : 0;
    }

    /**
     * @dev Get current gons per fragment ratio
     */
    function gonsPerFragment() external view returns (uint256) {
        return _gonsPerFragment;
    }

    /**
     * @dev Check if account can transfer amount
     */
    function canTransfer(address account, uint256 amount) external view returns (bool) {
        if (_gonsPerFragment == 0) return false;
        uint256 gonAmount = _calculateGonAmount(amount);
        return _gonBalances[account] >= gonAmount;
    }

    /**
     * @dev Get detailed token info
     */
    function getTokenInfo() external view returns (
        uint256 supply,
        uint256 gonsPerFrag,
        uint256 rebaseCounter,
        uint256 lastRebase,
        bool isPaused,
        bool rebaseIsPaused
    ) {
        supply = _totalSupply;
        gonsPerFrag = _gonsPerFragment;
        rebaseCounter = rebaseCount;
        lastRebase = lastRebaseTime;
        isPaused = paused();
        rebaseIsPaused = rebasePaused;
    }
}