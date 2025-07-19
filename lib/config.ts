// Enhanced configuration management for the E-Cash Protocol Dashboard
import { ethers } from "ethers"

// Network configuration with comprehensive validation
export interface NetworkConfig {
  name: string
  symbol: string
  explorer: string
  rpcUrl: string
  testnet: boolean
  chainId: number
  faucetUrl?: string
  gasPrice?: {
    standard: number
    fast: number
    instant: number
  }
  blockTime: number // in seconds
  confirmations: number
}

// Contract addresses with validation
export interface ContractAddresses {
  ecashToken: string
  oracleAggregator: string
  stabilizationController: string
  governance: string
  treasury: string
  testHelper: string
  chainlinkOracle?: string
  securityConfig?: string
}

// Feature flags with proper typing
export interface FeatureFlags {
  stressTesting: boolean
  scenarioTesting: boolean
  realTimeMonitoring: boolean
  debugMode: boolean
  multiNetwork: boolean
  advancedCharts: boolean
  emergencyControls: boolean
  analyticsTracking: boolean
}

// Dashboard configuration
export interface DashboardConfig {
  refreshInterval: number
  maxChartDataPoints: number
  defaultGasLimit: number
  autoRefresh: boolean
  theme: 'light' | 'dark' | 'auto'
  notifications: boolean
}

// Security configuration
export interface SecurityConfig {
  maxRebaseFrequency: number
  circuitBreakerThreshold: number
  oracleTimeout: number
  emergencyContacts: string[]
  allowedOrigins: string[]
}

// Main configuration class
class ConfigManager {
  private static instance: ConfigManager
  private _chainId: number
  private _networks: Record<number, NetworkConfig>
  private _contracts: Record<number, ContractAddresses>
  private _features: FeatureFlags
  private _dashboard: DashboardConfig
  private _security: SecurityConfig

  private constructor() {
    this._chainId = this.detectChainId()
    this._networks = this.initializeNetworks()
    this._contracts = this.initializeContracts()
    this._features = this.initializeFeatures()
    this._dashboard = this.initializeDashboard()
    this._security = this.initializeSecurity()
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager()
    }
    return ConfigManager.instance
  }

  private detectChainId(): number {
    // Priority: Environment variable > Browser detection > Default
    if (process.env.NEXT_PUBLIC_CHAIN_ID) {
      const envChainId = Number.parseInt(process.env.NEXT_PUBLIC_CHAIN_ID)
      if (!isNaN(envChainId)) return envChainId
    }

    // Default to localhost for development
    return 31337
  }

  private initializeNetworks(): Record<number, NetworkConfig> {
    return {
      // Localhost
      31337: {
        name: "Localhost",
        symbol: "ETH",
        explorer: "",
        rpcUrl: "http://localhost:8545",
        testnet: true,
        chainId: 31337,
        blockTime: 2,
        confirmations: 1,
        gasPrice: {
          standard: 20,
          fast: 25,
          instant: 30
        }
      },
      // Ethereum Mainnet
      1: {
        name: "Ethereum Mainnet",
        symbol: "ETH",
        explorer: "https://etherscan.io",
        rpcUrl: this.getRpcUrl(1),
        testnet: false,
        chainId: 1,
        blockTime: 12,
        confirmations: 12,
        gasPrice: {
          standard: 20,
          fast: 40,
          instant: 60
        }
      },
      // Sepolia Testnet
      11155111: {
        name: "Sepolia Testnet",
        symbol: "ETH",
        explorer: "https://sepolia.etherscan.io",
        rpcUrl: this.getRpcUrl(11155111),
        testnet: true,
        chainId: 11155111,
        faucetUrl: "https://sepoliafaucet.com",
        blockTime: 12,
        confirmations: 6,
        gasPrice: {
          standard: 20,
          fast: 30,
          instant: 40
        }
      },
      // Goerli Testnet (backup)
      5: {
        name: "Goerli Testnet",
        symbol: "ETH",
        explorer: "https://goerli.etherscan.io",
        rpcUrl: this.getRpcUrl(5),
        testnet: true,
        chainId: 5,
        faucetUrl: "https://goerlifaucet.com",
        blockTime: 15,
        confirmations: 6,
        gasPrice: {
          standard: 20,
          fast: 30,
          instant: 40
        }
      },
      // Polygon Mumbai
      80001: {
        name: "Polygon Mumbai",
        symbol: "MATIC",
        explorer: "https://mumbai.polygonscan.com",
        rpcUrl: this.getRpcUrl(80001),
        testnet: true,
        chainId: 80001,
        faucetUrl: "https://faucet.polygon.technology",
        blockTime: 2,
        confirmations: 5,
        gasPrice: {
          standard: 30,
          fast: 35,
          instant: 40
        }
      }
    }
  }

  private getRpcUrl(chainId: number): string {
    // Environment variable override
    const envKey = `NEXT_PUBLIC_RPC_URL_${chainId}`
    if (process.env[envKey]) {
      return process.env[envKey]!
    }

    // Default RPC URLs
    const defaultRpcUrls: Record<number, string> = {
      1: "https://ethereum.publicnode.com",
      11155111: "https://ethereum-sepolia.publicnode.com",
      5: "https://ethereum-goerli.publicnode.com",
      80001: "https://rpc-mumbai.maticvigil.com",
      31337: "http://localhost:8545"
    }

    return defaultRpcUrls[chainId] || ""
  }

  private initializeContracts(): Record<number, ContractAddresses> {
    const contracts: Record<number, ContractAddresses> = {}

    // Load from environment variables
    const chainIds = [1, 11155111, 5, 80001, 31337]
    
    chainIds.forEach(chainId => {
      const envPrefix = `NEXT_PUBLIC_${chainId}_`
      
      contracts[chainId] = {
        ecashToken: process.env[`${envPrefix}ECASH_TOKEN`] || "",
        oracleAggregator: process.env[`${envPrefix}ORACLE_AGGREGATOR`] || "",
        stabilizationController: process.env[`${envPrefix}STABILIZATION_CONTROLLER`] || "",
        governance: process.env[`${envPrefix}GOVERNANCE`] || "",
        treasury: process.env[`${envPrefix}TREASURY`] || "",
        testHelper: process.env[`${envPrefix}TEST_HELPER`] || "",
        chainlinkOracle: process.env[`${envPrefix}CHAINLINK_ORACLE`] || undefined,
        securityConfig: process.env[`${envPrefix}SECURITY_CONFIG`] || undefined
      }
    })

    // Default addresses for localhost/development
    contracts[31337] = {
      ecashToken: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
      oracleAggregator: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
      stabilizationController: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
      governance: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
      treasury: "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9",
      testHelper: "0x0165878A594ca255338adfa4d48449f69242Eb8F",
      chainlinkOracle: "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853",
      securityConfig: "0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6"
    }

    return contracts
  }

  private initializeFeatures(): FeatureFlags {
    return {
      stressTesting: process.env.NEXT_PUBLIC_FEATURE_STRESS_TESTING === 'true',
      scenarioTesting: process.env.NEXT_PUBLIC_FEATURE_SCENARIO_TESTING === 'true',
      realTimeMonitoring: process.env.NEXT_PUBLIC_FEATURE_REALTIME_MONITORING !== 'false', // Default true
      debugMode: process.env.NODE_ENV === 'development',
      multiNetwork: process.env.NEXT_PUBLIC_FEATURE_MULTI_NETWORK === 'true',
      advancedCharts: process.env.NEXT_PUBLIC_FEATURE_ADVANCED_CHARTS === 'true',
      emergencyControls: process.env.NEXT_PUBLIC_FEATURE_EMERGENCY_CONTROLS === 'true',
      analyticsTracking: process.env.NEXT_PUBLIC_FEATURE_ANALYTICS === 'true'
    }
  }

  private initializeDashboard(): DashboardConfig {
    return {
      refreshInterval: Number.parseInt(process.env.NEXT_PUBLIC_REFRESH_INTERVAL || '5000'),
      maxChartDataPoints: Number.parseInt(process.env.NEXT_PUBLIC_MAX_CHART_POINTS || '50'),
      defaultGasLimit: Number.parseInt(process.env.NEXT_PUBLIC_DEFAULT_GAS_LIMIT || '500000'),
      autoRefresh: process.env.NEXT_PUBLIC_AUTO_REFRESH !== 'false', // Default true
      theme: (process.env.NEXT_PUBLIC_THEME as 'light' | 'dark' | 'auto') || 'light',
      notifications: process.env.NEXT_PUBLIC_NOTIFICATIONS !== 'false' // Default true
    }
  }

  private initializeSecurity(): SecurityConfig {
    return {
      maxRebaseFrequency: Number.parseInt(process.env.NEXT_PUBLIC_MAX_REBASE_FREQUENCY || '43200'), // 12 hours
      circuitBreakerThreshold: Number.parseInt(process.env.NEXT_PUBLIC_CIRCUIT_BREAKER_THRESHOLD || '20'), // 20%
      oracleTimeout: Number.parseInt(process.env.NEXT_PUBLIC_ORACLE_TIMEOUT || '3600'), // 1 hour
      emergencyContacts: (process.env.NEXT_PUBLIC_EMERGENCY_CONTACTS || '').split(',').filter(Boolean),
      allowedOrigins: (process.env.NEXT_PUBLIC_ALLOWED_ORIGINS || '').split(',').filter(Boolean)
    }
  }

  // Getters
  get chainId(): number {
    return this._chainId
  }

  get currentNetwork(): NetworkConfig {
    return this._networks[this._chainId] || this._networks[11155111] // Fallback to Sepolia
  }

  get contracts(): ContractAddresses {
    return this._contracts[this._chainId] || this._contracts[31337] // Fallback to localhost
  }

  get features(): FeatureFlags {
    return this._features
  }

  get dashboard(): DashboardConfig {
    return this._dashboard
  }

  get security(): SecurityConfig {
    return this._security
  }

  // Methods
  public getNetworkConfig(chainId: number): NetworkConfig | undefined {
    return this._networks[chainId]
  }

  public getContractAddresses(chainId: number): ContractAddresses | undefined {
    return this._contracts[chainId]
  }

  public isNetworkSupported(chainId: number): boolean {
    return chainId in this._networks
  }

  public isContractsDeployed(chainId?: number): boolean {
    const targetChainId = chainId || this._chainId
    const addresses = this._contracts[targetChainId]
    
    if (!addresses) return false

    // Check if required contracts are deployed (have valid addresses)
    const requiredContracts: (keyof ContractAddresses)[] = [
      'ecashToken', 
      'oracleAggregator', 
      'stabilizationController', 
      'treasury', 
      'testHelper'
    ]

    return requiredContracts.every(contract => {
      const address = addresses[contract]
      return address && ethers.isAddress(address) && address !== ethers.ZeroAddress
    })
  }

  public validateContractAddress(address: string): boolean {
    if (!address) return false
    
    try {
      return ethers.isAddress(address) && address !== ethers.ZeroAddress
    } catch {
      return false
    }
  }

  public updateChainId(newChainId: number): void {
    if (this.isNetworkSupported(newChainId)) {
      this._chainId = newChainId
    } else {
      throw new Error(`Unsupported network: ${newChainId}`)
    }
  }

  public getExplorerUrl(txHash?: string, address?: string): string {
    const explorer = this.currentNetwork.explorer
    if (!explorer) return ""

    if (txHash) {
      return `${explorer}/tx/${txHash}`
    } else if (address) {
      return `${explorer}/address/${address}`
    }
    
    return explorer
  }

  public getProviderConfig(): {
    chainId: number
    rpcUrl: string
    name: string
  } {
    const network = this.currentNetwork
    return {
      chainId: network.chainId,
      rpcUrl: network.rpcUrl,
      name: network.name
    }
  }

  public getSupportedNetworks(): NetworkConfig[] {
    return Object.values(this._networks)
  }

  public isFeatureEnabled(feature: keyof FeatureFlags): boolean {
    return this._features[feature]
  }

  // Development helpers
  public getDebugInfo(): Record<string, any> {
    if (!this._features.debugMode) {
      return { error: "Debug mode not enabled" }
    }

    return {
      chainId: this._chainId,
      network: this.currentNetwork,
      contracts: this.contracts,
      features: this._features,
      dashboard: this._dashboard,
      contractsDeployed: this.isContractsDeployed(),
      supportedNetworks: Object.keys(this._networks).map(Number)
    }
  }
}

// Create singleton instance
const configManager = ConfigManager.getInstance()

// Export legacy config object for backward compatibility
export const config = {
  get chainId() { return configManager.chainId },
  get contracts() { return configManager.contracts },
  get features() { return configManager.features },
  get dashboard() { return configManager.dashboard },
  get security() { return configManager.security }
}

// Export utility functions
export const getNetworkInfo = (chainId: number): NetworkConfig => {
  const network = configManager.getNetworkConfig(chainId)
  if (!network) {
    throw new Error(`Network ${chainId} not supported`)
  }
  return network
}

export const isContractsDeployed = (chainId?: number): boolean => {
  return configManager.isContractsDeployed(chainId)
}

export const switchNetwork = async (chainId: number): Promise<boolean> => {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("No Web3 provider found")
  }

  if (!configManager.isNetworkSupported(chainId)) {
    throw new Error(`Network ${chainId} not supported`)
  }

  try {
    const network = configManager.getNetworkConfig(chainId)!
    const chainIdHex = `0x${chainId.toString(16)}`

    // Try to switch to the network
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainIdHex }],
    })

    configManager.updateChainId(chainId)
    return true
  } catch (switchError: any) {
    // If the network hasn't been added, add it
    if (switchError.code === 4902) {
      const network = configManager.getNetworkConfig(chainId)!
      
      try {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: `0x${chainId.toString(16)}`,
            chainName: network.name,
            rpcUrls: [network.rpcUrl],
            blockExplorerUrls: network.explorer ? [network.explorer] : undefined,
            nativeCurrency: {
              name: network.symbol,
              symbol: network.symbol,
              decimals: 18
            }
          }]
        })

        configManager.updateChainId(chainId)
        return true
      } catch (addError) {
        console.error('Failed to add network:', addError)
        throw addError
      }
    } else {
      console.error('Failed to switch network:', switchError)
      throw switchError
    }
  }
}

export const validateEnvironment = (): { isValid: boolean; errors: string[] } => {
  const errors: string[] = []

  // Check required environment variables
  if (!process.env.NEXT_PUBLIC_CHAIN_ID) {
    errors.push("NEXT_PUBLIC_CHAIN_ID is required")
  }

  // Check contract addresses for current network
  const chainId = configManager.chainId
  if (!configManager.isContractsDeployed(chainId)) {
    errors.push(`Contract addresses not configured for chain ${chainId}`)
  }

  // Check RPC URL
  const network = configManager.currentNetwork
  if (!network.rpcUrl) {
    errors.push(`RPC URL not configured for chain ${chainId}`)
  }

  return {
    isValid: errors.length === 0,
    errors
  }
}

// Export the config manager for advanced usage
export { configManager }

// Export types
export type {
  NetworkConfig,
  ContractAddresses,
  FeatureFlags,
  DashboardConfig,
  SecurityConfig
}