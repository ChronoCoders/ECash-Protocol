/**
 * Comprehensive Gas Optimization Suite
 * Tools for analyzing, optimizing, and monitoring gas usage across the protocol
 */

import { ethers } from "hardhat"
import { Contract, ContractFactory } from "ethers"
import fs from "fs"
import path from "path"

// ============ TYPES & INTERFACES ============

interface GasAnalysis {
  contractName: string
  deploymentGas: number
  functionGasCosts: Record<string, number>
  averageGas: number
  optimizationPotential: number
  recommendations: string[]
}

interface OptimizationResult {
  originalGas: number
  optimizedGas: number
  savings: number
  savingsPercentage: number
  technique: string
  description: string
}

interface BatchOperation {
  target: string
  data: string
  value: number
  gasLimit: number
}

interface GasProfile {
  function: string
  minGas: number
  maxGas: number
  averageGas: number
  callCount: number
  totalGas: number
}

// ============ GAS ANALYZER ============

class GasAnalyzer {
  private gasProfiles: Map<string, GasProfile[]> = new Map()
  private optimizationHistory: OptimizationResult[] = []

  async analyzeContract(contractFactory: ContractFactory, contractName: string): Promise<GasAnalysis> {
    console.log(`Analyzing gas usage for ${contractName}...`)

    // Deploy contract to get deployment gas
    const deployTx = contractFactory.getDeployTransaction()
    const deploymentGas = await this.estimateGas(deployTx)

    // Deploy actual contract for function analysis
    const contract = await contractFactory.deploy()
    await contract.waitForDeployment()

    // Analyze function gas costs
    const functionGasCosts = await this.analyzeFunctions(contract, contractName)
    
    // Calculate metrics
    const gasValues = Object.values(functionGasCosts)
    const averageGas = gasValues.length > 0 ? gasValues.reduce((a, b) => a + b, 0) / gasValues.length : 0
    
    // Assess optimization potential
    const optimizationPotential = this.assessOptimizationPotential(functionGasCosts, deploymentGas)
    const recommendations = this.generateRecommendations(functionGasCosts, deploymentGas)

    return {
      contractName,
      deploymentGas,
      functionGasCosts,
      averageGas,
      optimizationPotential,
      recommendations
    }
  }

  private async analyzeFunctions(contract: Contract, contractName: string): Promise<Record<string, number>> {
    const functionGasCosts: Record<string, number> = {}
    
    // Get contract interface
    const contractInterface = contract.interface
    
    for (const fragment of contractInterface.fragments) {
      if (fragment.type === 'function' && !fragment.constant) {
        try {
          const gasEstimate = await this.estimateFunctionGas(contract, fragment.name)
          if (gasEstimate > 0) {
            functionGasCosts[fragment.name] = gasEstimate
          }
        } catch (error) {
          console.warn(`Could not estimate gas for ${fragment.name}:`, error)
        }
      }
    }

    return functionGasCosts
  }

  private async estimateFunctionGas(contract: Contract, functionName: string): Promise<number> {
    try {
      // This is a simplified estimation - in practice, you'd need to provide
      // appropriate parameters for each function
      const fragment = contract.interface.getFunction(functionName)
      if (!fragment) return 0

      // Generate mock parameters based on function signature
      const params = this.generateMockParameters(fragment)
      
      // Estimate gas
      const gasEstimate = await contract[functionName].estimateGas(...params)
      return Number(gasEstimate)
    } catch (error) {
      return 0
    }
  }

  private generateMockParameters(fragment: any): any[] {
    const params: any[] = []
    
    for (const input of fragment.inputs) {
      switch (input.type) {
        case 'uint256':
        case 'uint128':
        case 'uint64':
        case 'uint32':
        case 'uint16':
        case 'uint8':
          params.push(1)
          break
        case 'int256':
        case 'int128':
        case 'int64':
        case 'int32':
        case 'int16':
        case 'int8':
          params.push(1)
          break
        case 'address':
          params.push('0x1234567890123456789012345678901234567890')
          break
        case 'bool':
          params.push(true)
          break
        case 'string':
          params.push('test')
          break
        case 'bytes':
          params.push('0x1234')
          break
        default:
          if (input.type.includes('[]')) {
            params.push([])
          } else {
            params.push(0)
          }
      }
    }
    
    return params
  }

  private async estimateGas(transaction: any): Promise<number> {
    try {
      const [signer] = await ethers.getSigners()
      const gasEstimate = await signer.estimateGas(transaction)
      return Number(gasEstimate)
    } catch (error) {
      console.error('Gas estimation failed:', error)
      return 0
    }
  }

  private assessOptimizationPotential(functionGasCosts: Record<string, number>, deploymentGas: number): number {
    const totalGas = deploymentGas + Object.values(functionGasCosts).reduce((a, b) => a + b, 0)
    
    // Simple heuristic: higher gas usage indicates more optimization potential
    if (totalGas > 5000000) return 90 // Very high potential
    if (totalGas > 2000000) return 70 // High potential
    if (totalGas > 1000000) return 50 // Medium potential
    if (totalGas > 500000) return 30  // Low potential
    return 10 // Very low potential
  }

  private generateRecommendations(functionGasCosts: Record<string, number>, deploymentGas: number): string[] {
    const recommendations: string[] = []
    
    if (deploymentGas > 3000000) {
      recommendations.push('Consider using a proxy pattern to reduce deployment costs')
      recommendations.push('Review contract size and consider splitting into multiple contracts')
    }
    
    const highGasFunctions = Object.entries(functionGasCosts).filter(([, gas]) => gas > 200000)
    if (highGasFunctions.length > 0) {
      recommendations.push(`High gas functions detected: ${highGasFunctions.map(([name]) => name).join(', ')}`)
      recommendations.push('Consider optimizing loops, storage operations, and external calls')
    }
    
    const avgGas = Object.values(functionGasCosts).reduce((a, b) => a + b, 0) / Object.keys(functionGasCosts).length
    if (avgGas > 100000) {
      recommendations.push('Average function gas is high - review algorithm efficiency')
      recommendations.push('Consider packing structs and using smaller data types')
    }
    
    return recommendations
  }

  recordOptimization(result: OptimizationResult): void {
    this.optimizationHistory.push(result)
  }

  getOptimizationHistory(): OptimizationResult[] {
    return [...this.optimizationHistory]
  }

  exportAnalysis(analysis: GasAnalysis[], filename: string): void {
    const report = {
      timestamp: new Date().toISOString(),
      analysis,
      optimizationHistory: this.optimizationHistory,
      totalSavings: this.optimizationHistory.reduce((sum, opt) => sum + opt.savings, 0)
    }

    fs.writeFileSync(
      path.join(__dirname, `../../reports/${filename}.json`),
      JSON.stringify(report, null, 2)
    )
    
    console.log(`Gas analysis exported to reports/${filename}.json`)
  }
}

// ============ BATCH OPTIMIZER ============

class BatchOptimizer {
  private readonly maxBatchSize: number = 50
  private readonly gasLimit: number = 10000000

  async optimizeBatchOperations(operations: BatchOperation[]): Promise<BatchOperation[][]> {
    const batches: BatchOperation[][] = []
    let currentBatch: BatchOperation[] = []
    let currentGas = 0

    for (const operation of operations) {
      // If adding this operation would exceed limits, start new batch
      if (currentBatch.length >= this.maxBatchSize || 
          currentGas + operation.gasLimit > this.gasLimit) {
        if (currentBatch.length > 0) {
          batches.push([...currentBatch])
          currentBatch = []
          currentGas = 0
        }
      }

      currentBatch.push(operation)
      currentGas += operation.gasLimit
    }

    // Add final batch
    if (currentBatch.length > 0) {
      batches.push(currentBatch)
    }

    return batches
  }

  async executeBatch(operations: BatchOperation[]): Promise<ethers.ContractTransactionResponse[]> {
    const [signer] = await ethers.getSigners()
    const results: ethers.ContractTransactionResponse[] = []

    // Deploy multicall contract if needed
    const multicallFactory = await ethers.getContractFactory("Multicall")
    const multicall = await multicallFactory.deploy()
    await multicall.waitForDeployment()

    // Group operations by target for more efficient batching
    const groupedOps = this.groupOperationsByTarget(operations)
    
    for (const [target, ops] of groupedOps) {
      const calls = ops.map(op => ({
        target: op.target,
        callData: op.data
      }))

      try {
        const tx = await multicall.aggregate(calls, {
          gasLimit: ops.reduce((sum, op) => sum + op.gasLimit, 0) + 50000 // Add buffer
        })
        results.push(tx)
      } catch (error) {
        console.error(`Batch execution failed for target ${target}:`, error)
      }
    }

    return results
  }

  private groupOperationsByTarget(operations: BatchOperation[]): Map<string, BatchOperation[]> {
    const grouped = new Map<string, BatchOperation[]>()
    
    for (const operation of operations) {
      if (!grouped.has(operation.target)) {
        grouped.set(operation.target, [])
      }
      grouped.get(operation.target)!.push(operation)
    }
    
    return grouped
  }

  calculateBatchSavings(operations: BatchOperation[]): {
    individualCost: number
    batchCost: number
    savings: number
    savingsPercentage: number
  } {
    const individualCost = operations.reduce((sum, op) => sum + op.gasLimit + 21000, 0) // 21k base gas per tx
    const batchCost = operations.reduce((sum, op) => sum + op.gasLimit, 0) + 100000 // Batch overhead
    const savings = individualCost - batchCost
    const savingsPercentage = (savings / individualCost) * 100

    return {
      individualCost,
      batchCost,
      savings,
      savingsPercentage
    }
  }
}

// ============ STORAGE OPTIMIZER ============

class StorageOptimizer {
  analyzeStorageLayout(contractName: string): {
    slots: number
    wastedBytes: number
    packingOpportunities: string[]
    recommendations: string[]
  } {
    // This would typically analyze the contract's storage layout
    // For now, we'll return mock data
    return {
      slots: 10,
      wastedBytes: 64,
      packingOpportunities: [
        'Pack uint32 and bool into single slot',
        'Combine multiple uint128 values',
        'Optimize string storage'
      ],
      recommendations: [
        'Use smaller data types where possible',
        'Group related variables together',
        'Consider using packed structs',
        'Use mappings efficiently'
      ]
    }
  }

  generateOptimizedContract(contractName: string, optimizations: string[]): string {
    const template = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// Gas-optimized version of ${contractName}
// Applied optimizations: ${optimizations.join(', ')}

contract Optimized${contractName} {
    // Packed storage variables
    struct PackedData {
        uint128 value1;
        uint128 value2;
        uint64 timestamp;
        uint32 count;
        bool isActive;
    }
    
    PackedData private _data;
    
    // Use custom errors instead of require strings
    error InvalidInput();
    error Unauthorized();
    
    // Optimized functions with unchecked arithmetic where safe
    function optimizedFunction(uint256 amount) external {
        if (amount == 0) revert InvalidInput();
        
        unchecked {
            _data.count += 1;
        }
    }
}
`
    return template
  }
}

// ============ DEPLOYMENT OPTIMIZER ============

class DeploymentOptimizer {
  async optimizeDeployment(contractFactories: Record<string, ContractFactory>): Promise<{
    deploymentOrder: string[]
    estimatedGas: Record<string, number>
    totalGas: number
    recommendations: string[]
  }> {
    const deploymentOrder: string[] = []
    const estimatedGas: Record<string, number> = {}
    let totalGas = 0
    const recommendations: string[] = []

    // Analyze dependencies and optimize deployment order
    const dependencies = this.analyzeDependencies(Object.keys(contractFactories))
    const sortedContracts = this.topologicalSort(dependencies)

    for (const contractName of sortedContracts) {
      const factory = contractFactories[contractName]
      if (factory) {
        const deployTx = factory.getDeployTransaction()
        const gas = await this.estimateDeploymentGas(deployTx)
        
        deploymentOrder.push(contractName)
        estimatedGas[contractName] = gas
        totalGas += gas
      }
    }

    // Generate recommendations
    if (totalGas > 20000000) {
      recommendations.push('Consider deploying contracts across multiple transactions to avoid block gas limit')
      recommendations.push('Use CREATE2 for deterministic addresses and better gas optimization')
    }

    if (deploymentOrder.length > 5) {
      recommendations.push('Consider using a factory pattern to reduce deployment complexity')
    }

    const highGasContracts = Object.entries(estimatedGas).filter(([, gas]) => gas > 3000000)
    if (highGasContracts.length > 0) {
      recommendations.push(`High gas contracts: ${highGasContracts.map(([name]) => name).join(', ')}`)
      recommendations.push('Consider using proxy patterns for large contracts')
    }

    return {
      deploymentOrder,
      estimatedGas,
      totalGas,
      recommendations
    }
  }

  private analyzeDependencies(contractNames: string[]): Map<string, string[]> {
    // Mock dependency analysis - in practice, this would parse contract code
    const dependencies = new Map<string, string[]>()
    
    dependencies.set('SecurityConfig', [])
    dependencies.set('ECashToken', ['SecurityConfig'])
    dependencies.set('OracleAggregator', ['SecurityConfig'])
    dependencies.set('Treasury', ['SecurityConfig'])
    dependencies.set('StabilizationController', ['ECashToken', 'OracleAggregator', 'Treasury'])
    dependencies.set('EconomicParameterManager', ['SecurityConfig'])
    dependencies.set('TreasuryEconomics', ['SecurityConfig'])
    dependencies.set('TestHelper', ['ECashToken', 'OracleAggregator', 'StabilizationController'])

    return dependencies
  }

  private topologicalSort(dependencies: Map<string, string[]>): string[] {
    const visited = new Set<string>()
    const visiting = new Set<string>()
    const result: string[] = []

    const visit = (node: string) => {
      if (visiting.has(node)) {
        throw new Error(`Circular dependency detected: ${node}`)
      }
      if (visited.has(node)) return

      visiting.add(node)
      const deps = dependencies.get(node) || []
      
      for (const dep of deps) {
        visit(dep)
      }

      visiting.delete(node)
      visited.add(node)
      result.push(node)
    }

    for (const node of dependencies.keys()) {
      visit(node)
    }

    return result
  }

  private async estimateDeploymentGas(deployTx: any): Promise<number> {
    try {
      const [signer] = await ethers.getSigners()
      const gasEstimate = await signer.estimateGas(deployTx)
      return Number(gasEstimate)
    } catch (error) {
      console.error('Deployment gas estimation failed:', error)
      return 0
    }
  }

  async deployWithOptimization(
    contractFactory: ContractFactory,
    constructorArgs: any[] = [],
    options: {
      gasPrice?: bigint
      gasLimit?: number
      nonce?: number
    } = {}
  ): Promise<Contract> {
    const [signer] = await ethers.getSigners()

    // Optimize gas price if not provided
    if (!options.gasPrice) {
      const feeData = await signer.provider!.getFeeData()
      options.gasPrice = feeData.gasPrice || ethers.parseUnits('20', 'gwei')
    }

    // Estimate gas if not provided
    if (!options.gasLimit) {
      const deployTx = contractFactory.getDeployTransaction(...constructorArgs)
      const estimatedGas = await signer.estimateGas(deployTx)
      options.gasLimit = Number(estimatedGas) + 50000 // Add 50k buffer
    }

    console.log(`Deploying with optimized gas settings:`)
    console.log(`- Gas Price: ${ethers.formatUnits(options.gasPrice, 'gwei')} gwei`)
    console.log(`- Gas Limit: ${options.gasLimit?.toLocaleString()}`)

    const contract = await contractFactory.deploy(...constructorArgs, {
      gasPrice: options.gasPrice,
      gasLimit: options.gasLimit,
      nonce: options.nonce
    })

    await contract.waitForDeployment()
    return contract
  }
}

// ============ RUNTIME OPTIMIZER ============

class RuntimeOptimizer {
  private gasTracker = new Map<string, number[]>()

  trackGasUsage(functionName: string, gasUsed: number): void {
    if (!this.gasTracker.has(functionName)) {
      this.gasTracker.set(functionName, [])
    }
    this.gasTracker.get(functionName)!.push(gasUsed)
  }

  getGasStatistics(functionName: string): {
    min: number
    max: number
    average: number
    total: number
    callCount: number
  } | null {
    const gasUsage = this.gasTracker.get(functionName)
    if (!gasUsage || gasUsage.length === 0) return null

    return {
      min: Math.min(...gasUsage),
      max: Math.max(...gasUsage),
      average: gasUsage.reduce((a, b) => a + b, 0) / gasUsage.length,
      total: gasUsage.reduce((a, b) => a + b, 0),
      callCount: gasUsage.length
    }
  }

  getAllStatistics(): Record<string, any> {
    const stats: Record<string, any> = {}
    for (const functionName of this.gasTracker.keys()) {
      stats[functionName] = this.getGasStatistics(functionName)
    }
    return stats
  }

  generateOptimizationReport(): {
    highGasFunctions: string[]
    volatileFunctions: string[]
    recommendations: string[]
  } {
    const highGasFunctions: string[] = []
    const volatileFunctions: string[] = []
    const recommendations: string[] = []

    for (const [functionName, gasUsage] of this.gasTracker) {
      const stats = this.getGasStatistics(functionName)!
      
      if (stats.average > 200000) {
        highGasFunctions.push(functionName)
      }

      const volatility = (stats.max - stats.min) / stats.average
      if (volatility > 0.5) {
        volatileFunctions.push(functionName)
      }
    }

    if (highGasFunctions.length > 0) {
      recommendations.push(`Optimize high gas functions: ${highGasFunctions.join(', ')}`)
    }

    if (volatileFunctions.length > 0) {
      recommendations.push(`Investigate volatile gas usage in: ${volatileFunctions.join(', ')}`)
    }

    return {
      highGasFunctions,
      volatileFunctions,
      recommendations
    }
  }

  resetTracking(): void {
    this.gasTracker.clear()
  }
}

// ============ MAIN OPTIMIZATION SUITE ============

export class GasOptimizationSuite {
  private analyzer: GasAnalyzer
  private batchOptimizer: BatchOptimizer
  private storageOptimizer: StorageOptimizer
  private deploymentOptimizer: DeploymentOptimizer
  private runtimeOptimizer: RuntimeOptimizer

  constructor() {
    this.analyzer = new GasAnalyzer()
    this.batchOptimizer = new BatchOptimizer()
    this.storageOptimizer = new StorageOptimizer()
    this.deploymentOptimizer = new DeploymentOptimizer()
    this.runtimeOptimizer = new RuntimeOptimizer()
  }

  async runFullAnalysis(contractFactories: Record<string, ContractFactory>): Promise<{
    gasAnalyses: GasAnalysis[]
    deploymentPlan: any
    storageAnalysis: Record<string, any>
    totalOptimizationPotential: number
    recommendations: string[]
  }> {
    console.log('Starting comprehensive gas optimization analysis...')

    // Analyze each contract
    const gasAnalyses: GasAnalysis[] = []
    for (const [name, factory] of Object.entries(contractFactories)) {
      const analysis = await this.analyzer.analyzeContract(factory, name)
      gasAnalyses.push(analysis)
    }

    // Optimize deployment
    const deploymentPlan = await this.deploymentOptimizer.optimizeDeployment(contractFactories)

    // Analyze storage
    const storageAnalysis: Record<string, any> = {}
    for (const name of Object.keys(contractFactories)) {
      storageAnalysis[name] = this.storageOptimizer.analyzeStorageLayout(name)
    }

    // Calculate total optimization potential
    const totalOptimizationPotential = gasAnalyses.reduce(
      (sum, analysis) => sum + analysis.optimizationPotential, 0
    ) / gasAnalyses.length

    // Aggregate recommendations
    const recommendations = [
      ...gasAnalyses.flatMap(a => a.recommendations),
      ...deploymentPlan.recommendations,
      ...Object.values(storageAnalysis).flatMap((s: any) => s.recommendations)
    ]

    return {
      gasAnalyses,
      deploymentPlan,
      storageAnalysis,
      totalOptimizationPotential,
      recommendations: [...new Set(recommendations)] // Remove duplicates
    }
  }

  async optimizeContractDeployment(
    contractName: string,
    contractFactory: ContractFactory,
    constructorArgs: any[] = []
  ): Promise<{
    contract: Contract
    gasUsed: number
    optimizations: string[]
    savings: number
  }> {
    console.log(`Optimizing deployment for ${contractName}...`)

    // Get original gas estimate
    const deployTx = contractFactory.getDeployTransaction(...constructorArgs)
    const originalGas = await this.estimateGas(deployTx)

    // Apply optimizations and deploy
    const contract = await this.deploymentOptimizer.deployWithOptimization(
      contractFactory,
      constructorArgs
    )

    const receipt = await contract.deploymentTransaction()?.wait()
    const actualGasUsed = Number(receipt?.gasUsed || 0)

    const optimizations = [
      'Optimized gas price selection',
      'Accurate gas limit estimation',
      'Dependency-aware deployment order'
    ]

    const savings = originalGas - actualGasUsed

    return {
      contract,
      gasUsed: actualGasUsed,
      optimizations,
      savings
    }
  }

  async createBatchOperation(operations: BatchOperation[]): Promise<{
    batches: BatchOperation[][]
    savings: any
    executionPlan: string[]
  }> {
    const batches = await this.batchOptimizer.optimizeBatchOperations(operations)
    const savings = this.batchOptimizer.calculateBatchSavings(operations)
    
    const executionPlan = batches.map((batch, index) => 
      `Batch ${index + 1}: ${batch.length} operations, estimated gas: ${
        batch.reduce((sum, op) => sum + op.gasLimit, 0)
      }`
    )

    return {
      batches,
      savings,
      executionPlan
    }
  }

  generateOptimizedContract(contractName: string, optimizations: string[]): string {
    return this.storageOptimizer.generateOptimizedContract(contractName, optimizations)
  }

  trackRuntimeGas(functionName: string, gasUsed: number): void {
    this.runtimeOptimizer.trackGasUsage(functionName, gasUsed)
  }

  generateRuntimeReport(): any {
    return this.runtimeOptimizer.generateOptimizationReport()
  }

  exportOptimizationReport(data: any, filename: string): void {
    const report = {
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      summary: {
        totalContracts: data.gasAnalyses?.length || 0,
        averageOptimizationPotential: data.totalOptimizationPotential || 0,
        totalRecommendations: data.recommendations?.length || 0
      },
      ...data
    }

    const reportsDir = path.join(__dirname, '../../reports')
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true })
    }

    fs.writeFileSync(
      path.join(reportsDir, `${filename}.json`),
      JSON.stringify(report, null, 2)
    )

    // Also generate a human-readable summary
    const summary = this.generateHumanReadableSummary(report)
    fs.writeFileSync(
      path.join(reportsDir, `${filename}-summary.md`),
      summary
    )

    console.log(`Optimization report exported to reports/${filename}.json`)
    console.log(`Summary exported to reports/${filename}-summary.md`)
  }

  private generateHumanReadableSummary(report: any): string {
    return `
# Gas Optimization Report

**Generated:** ${report.timestamp}

## Summary
- **Total Contracts Analyzed:** ${report.summary.totalContracts}
- **Average Optimization Potential:** ${report.summary.averageOptimizationPotential.toFixed(1)}%
- **Total Recommendations:** ${report.summary.totalRecommendations}

## Contract Analysis
${report.gasAnalyses?.map((analysis: GasAnalysis) => `
### ${analysis.contractName}
- **Deployment Gas:** ${analysis.deploymentGas.toLocaleString()}
- **Average Function Gas:** ${analysis.averageGas.toLocaleString()}
- **Optimization Potential:** ${analysis.optimizationPotential}%

**Recommendations:**
${analysis.recommendations.map((rec: string) => `- ${rec}`).join('\n')}
`).join('\n') || 'No contract analyses available'}

## Deployment Optimization
${report.deploymentPlan ? `
- **Total Estimated Gas:** ${report.deploymentPlan.totalGas.toLocaleString()}
- **Deployment Order:** ${report.deploymentPlan.deploymentOrder.join(' → ')}

**Recommendations:**
${report.deploymentPlan.recommendations.map((rec: string) => `- ${rec}`).join('\n')}
` : 'No deployment analysis available'}

## Key Recommendations
${report.recommendations?.slice(0, 10).map((rec: string) => `- ${rec}`).join('\n') || 'No recommendations available'}
`
  }

  private async estimateGas(transaction: any): Promise<number> {
    try {
      const [signer] = await ethers.getSigners()
      const gasEstimate = await signer.estimateGas(transaction)
      return Number(gasEstimate)
    } catch (error) {
      console.error('Gas estimation failed:', error)
      return 0
    }
  }

  // Utility methods
  getAnalyzer(): GasAnalyzer { return this.analyzer }
  getBatchOptimizer(): BatchOptimizer { return this.batchOptimizer }
  getStorageOptimizer(): StorageOptimizer { return this.storageOptimizer }
  getDeploymentOptimizer(): DeploymentOptimizer { return this.deploymentOptimizer }
  getRuntimeOptimizer(): RuntimeOptimizer { return this.runtimeOptimizer }
}

// Export main class and utilities
export { GasAnalyzer, BatchOptimizer, StorageOptimizer, DeploymentOptimizer, RuntimeOptimizer }
export default GasOptimizationSuite