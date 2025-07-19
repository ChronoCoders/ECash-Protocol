// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @title SecurityConfig
 * @dev Centralized security configuration and emergency controls for the E-Cash protocol
 * @notice This contract manages protocol-wide security parameters and emergency procedures
 */
contract SecurityConfig is Initializable, AccessControlUpgradeable, PausableUpgradeable {
    bytes32 public constant SECURITY_ADMIN_ROLE = keccak256("SECURITY_ADMIN_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");
    bytes32 public constant PARAMETER_ADMIN_ROLE = keccak256("PARAMETER_ADMIN_ROLE");

    // Protocol contracts
    mapping(string => address) public protocolContracts;
    mapping(address => bool) public authorizedContracts;
    
    // Security parameters
    struct SecurityParams {
        uint256 maxRebaseFrequency;
        uint256 maxRebaseAmount;
        uint256 circuitBreakerThreshold;
        uint256 emergencyPauseDelay;
        uint256 oracleTimeout;
        uint256 minOracleConfidence;
        bool emergencyMode;
        uint256 emergencyModeActivatedAt;
    }

    SecurityParams public securityParams;

    // Emergency contacts and procedures
    mapping(address => bool) public emergencyResponders;
    address[] public emergencyContacts;
    
    // Incident tracking
    struct Incident {
        uint256 timestamp;
        string incidentType;
        string description;
        address reporter;
        bool resolved;
        uint256 resolvedAt;
    }

    mapping(uint256 => Incident) public incidents;
    uint256 public incidentCount;

    // Events
    event SecurityParameterUpdated(string parameter, uint256 oldValue, uint256 newValue);
    event EmergencyModeActivated(string reason, address activatedBy);
    event EmergencyModeDeactivated(address deactivatedBy);
    event IncidentReported(uint256 indexed incidentId, string incidentType, address reporter);
    event IncidentResolved(uint256 indexed incidentId, address resolver);
    event EmergencyResponderAdded(address responder);
    event EmergencyResponderRemoved(address responder);
    event ContractAuthorized(address contractAddress, string name);
    event ContractDeauthorized(address contractAddress);

    modifier onlyEmergencyResponder() {
        require(emergencyResponders[msg.sender] || hasRole(EMERGENCY_ROLE, msg.sender), "Not authorized for emergency actions");
        _;
    }

    modifier onlyInEmergency() {
        require(securityParams.emergencyMode, "Not in emergency mode");
        _;
    }

    modifier notInEmergency() {
        require(!securityParams.emergencyMode, "Emergency mode active");
        _;
    }

    function initialize(address admin) public initializer {
        require(admin != address(0), "Invalid admin address");

        __AccessControl_init();
        __Pausable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(SECURITY_ADMIN_ROLE, admin);
        _grantRole(EMERGENCY_ROLE, admin);
        _grantRole(PARAMETER_ADMIN_ROLE, admin);

        // Set default security parameters
        securityParams = SecurityParams({
            maxRebaseFrequency: 12 hours,
            maxRebaseAmount: 10e16, // 10%
            circuitBreakerThreshold: 20e16, // 20%
            emergencyPauseDelay: 0, // Immediate pause capability
            oracleTimeout: 1 hours,
            minOracleConfidence: 50, // 50%
            emergencyMode: false,
            emergencyModeActivatedAt: 0
        });

        emergencyResponders[admin] = true;
        emergencyContacts.push(admin);
    }

    /**
     * @dev Register protocol contracts
     */
    function registerProtocolContract(string memory name, address contractAddress) 
        external 
        onlyRole(SECURITY_ADMIN_ROLE) 
    {
        require(contractAddress != address(0), "Invalid contract address");
        require(bytes(name).length > 0, "Invalid contract name");
        
        protocolContracts[name] = contractAddress;
        authorizedContracts[contractAddress] = true;
        
        emit ContractAuthorized(contractAddress, name);
    }

    /**
     * @dev Deauthorize a contract
     */
    function deauthorizeContract(address contractAddress) 
        external 
        onlyRole(SECURITY_ADMIN_ROLE) 
    {
        require(authorizedContracts[contractAddress], "Contract not authorized");
        
        authorizedContracts[contractAddress] = false;
        emit ContractDeauthorized(contractAddress);
    }

    /**
     * @dev Add emergency responder
     */
    function addEmergencyResponder(address responder) 
        external 
        onlyRole(SECURITY_ADMIN_ROLE) 
    {
        require(responder != address(0), "Invalid responder address");
        require(!emergencyResponders[responder], "Already a responder");
        
        emergencyResponders[responder] = true;
        emergencyContacts.push(responder);
        
        emit EmergencyResponderAdded(responder);
    }

    /**
     * @dev Remove emergency responder
     */
    function removeEmergencyResponder(address responder) 
        external 
        onlyRole(SECURITY_ADMIN_ROLE) 
    {
        require(emergencyResponders[responder], "Not a responder");
        require(emergencyContacts.length > 1, "Cannot remove last responder");
        
        emergencyResponders[responder] = false;
        
        // Remove from contacts array
        for (uint i = 0; i < emergencyContacts.length; i++) {
            if (emergencyContacts[i] == responder) {
                emergencyContacts[i] = emergencyContacts[emergencyContacts.length - 1];
                emergencyContacts.pop();
                break;
            }
        }
        
        emit EmergencyResponderRemoved(responder);
    }

    /**
     * @dev Activate emergency mode
     */
    function activateEmergencyMode(string memory reason) 
        external 
        onlyEmergencyResponder 
        notInEmergency 
    {
        require(bytes(reason).length > 0, "Reason required");
        
        securityParams.emergencyMode = true;
        securityParams.emergencyModeActivatedAt = block.timestamp;
        
        // Report as incident
        _reportIncident("EMERGENCY_MODE_ACTIVATED", reason, msg.sender);
        
        emit EmergencyModeActivated(reason, msg.sender);
    }

    /**
     * @dev Deactivate emergency mode
     */
    function deactivateEmergencyMode() 
        external 
        onlyRole(EMERGENCY_ROLE) 
        onlyInEmergency 
    {
        securityParams.emergencyMode = false;
        securityParams.emergencyModeActivatedAt = 0;
        
        emit EmergencyModeDeactivated(msg.sender);
    }

    /**
     * @dev Report a security incident
     */
    function reportIncident(
        string memory incidentType,
        string memory description
    ) external returns (uint256 incidentId) {
        return _reportIncident(incidentType, description, msg.sender);
    }

    /**
     * @dev Internal incident reporting
     */
    function _reportIncident(
        string memory incidentType,
        string memory description,
        address reporter
    ) internal returns (uint256 incidentId) {
        require(bytes(incidentType).length > 0, "Incident type required");
        require(bytes(description).length > 0, "Description required");
        
        incidentCount++;
        incidentId = incidentCount;
        
        incidents[incidentId] = Incident({
            timestamp: block.timestamp,
            incidentType: incidentType,
            description: description,
            reporter: reporter,
            resolved: false,
            resolvedAt: 0
        });
        
        emit IncidentReported(incidentId, incidentType, reporter);
        
        return incidentId;
    }

    /**
     * @dev Resolve an incident
     */
    function resolveIncident(uint256 incidentId) 
        external 
        onlyRole(SECURITY_ADMIN_ROLE) 
    {
        require(incidentId <= incidentCount && incidentId > 0, "Invalid incident ID");
        require(!incidents[incidentId].resolved, "Incident already resolved");
        
        incidents[incidentId].resolved = true;
        incidents[incidentId].resolvedAt = block.timestamp;
        
        emit IncidentResolved(incidentId, msg.sender);
    }

    /**
     * @dev Update security parameters
     */
    function updateMaxRebaseFrequency(uint256 frequency) 
        external 
        onlyRole(PARAMETER_ADMIN_ROLE) 
    {
        require(frequency >= 1 hours && frequency <= 7 days, "Invalid frequency");
        uint256 oldValue = securityParams.maxRebaseFrequency;
        securityParams.maxRebaseFrequency = frequency;
        emit SecurityParameterUpdated("maxRebaseFrequency", oldValue, frequency);
    }

    function updateMaxRebaseAmount(uint256 amount) 
        external 
        onlyRole(PARAMETER_ADMIN_ROLE) 
    {
        require(amount >= 1e16 && amount <= 50e16, "Invalid amount range"); // 1% to 50%
        uint256 oldValue = securityParams.maxRebaseAmount;
        securityParams.maxRebaseAmount = amount;
        emit SecurityParameterUpdated("maxRebaseAmount", oldValue, amount);
    }

    function updateCircuitBreakerThreshold(uint256 threshold) 
        external 
        onlyRole(PARAMETER_ADMIN_ROLE) 
    {
        require(threshold >= 5e16 && threshold <= 50e16, "Invalid threshold range"); // 5% to 50%
        uint256 oldValue = securityParams.circuitBreakerThreshold;
        securityParams.circuitBreakerThreshold = threshold;
        emit SecurityParameterUpdated("circuitBreakerThreshold", oldValue, threshold);
    }

    function updateOracleTimeout(uint256 timeout) 
        external 
        onlyRole(PARAMETER_ADMIN_ROLE) 
    {
        require(timeout >= 5 minutes && timeout <= 4 hours, "Invalid timeout range");
        uint256 oldValue = securityParams.oracleTimeout;
        securityParams.oracleTimeout = timeout;
        emit SecurityParameterUpdated("oracleTimeout", oldValue, timeout);
    }

    function updateMinOracleConfidence(uint256 confidence) 
        external 
        onlyRole(PARAMETER_ADMIN_ROLE) 
    {
        require(confidence >= 30 && confidence <= 100, "Invalid confidence range");
        uint256 oldValue = securityParams.minOracleConfidence;
        securityParams.minOracleConfidence = confidence;
        emit SecurityParameterUpdated("minOracleConfidence", oldValue, confidence);
    }

    /**
     * @dev Get all security parameters
     */
    function getSecurityParams() external view returns (SecurityParams memory) {
        return securityParams;
    }

    /**
     * @dev Get incident details
     */
    function getIncident(uint256 incidentId) external view returns (Incident memory) {
        require(incidentId <= incidentCount && incidentId > 0, "Invalid incident ID");
        return incidents[incidentId];
    }

    /**
     * @dev Get all emergency contacts
     */
    function getEmergencyContacts() external view returns (address[] memory) {
        return emergencyContacts;
    }

    /**
     * @dev Check if contract is authorized
     */
    function isAuthorizedContract(address contractAddress) external view returns (bool) {
        return authorizedContracts[contractAddress];
    }

    /**
     * @dev Get protocol contract address
     */
    function getProtocolContract(string memory name) external view returns (address) {
        return protocolContracts[name];
    }

    /**
     * @dev Emergency pause (immediate effect)
     */
    function emergencyPause() external onlyEmergencyResponder {
        _reportIncident("EMERGENCY_PAUSE", "Emergency pause activated", msg.sender);
        _pause();
    }

    /**
     * @dev Emergency unpause
     */
    function emergencyUnpause() external onlyRole(EMERGENCY_ROLE) {
        _unpause();
    }

    /**
     * @dev Check system health status
     */
    function getSystemHealthStatus() external view returns (
        bool isHealthy,
        bool emergencyModeActive,
        uint256 activeIncidents,
        uint256 lastIncidentTime,
        address[] memory emergencyContactList
    ) {
        isHealthy = !securityParams.emergencyMode && !paused();
        emergencyModeActive = securityParams.emergencyMode;
        emergencyContactList = emergencyContacts;

        // Count active incidents
        for (uint i = 1; i <= incidentCount; i++) {
            if (!incidents[i].resolved) {
                activeIncidents++;
                if (incidents[i].timestamp > lastIncidentTime) {
                    lastIncidentTime = incidents[i].timestamp;
                }
            }
        }
    }
}