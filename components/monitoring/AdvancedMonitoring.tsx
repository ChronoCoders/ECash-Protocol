"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { ethers } from "ethers"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell } from "recharts"
import { toast } from "react-toastify"

interface MonitoringProps {
  provider: ethers.BrowserProvider | null
  contracts: any
  isActive: boolean
}

interface SystemMetrics {
  timestamp: number
  blockNumber: number
  gasPrice: string
  networkHealth: number
  activeUsers: number
  totalTransactions: number
  rebaseCount: number
  circuitBreakerActivations: number
  oracleFailures: number
  treasuryValue: string
  protocolHealth: 'healthy' | 'warning' | 'critical'
}

interface AlertConfig {
  id: string
  name: string
  condition: string
  threshold: number
  enabled: boolean
  lastTriggered?: number
  triggerCount: number
}

interface PerformanceMetrics {
  avgBlockTime: number
  avgGasUsed: number
  maxGasUsed: number
  rebaseExecutionTime: number
  oracleResponseTime: number
  frontendResponseTime: number
}

interface SecurityEvent {
  id: string
  timestamp: number
  type: 'unauthorized_access' | 'oracle_manipulation' | 'large_rebase' | 'circuit_breaker' | 'emergency_pause'
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  txHash?: string
  blockNumber?: number
  resolved: boolean
}

const MONITORING_CONFIG = {
  COLLECTION_INTERVAL: 10000, // 10 seconds
  RETENTION_PERIOD: 24 * 60 * 60 * 1000, // 24 hours
  MAX_METRICS_POINTS: 500,
  MAX_EVENTS: 100,
  ALERT_COOLDOWN: 5 * 60 * 1000, // 5 minutes
} as const

const ALERT_COLORS = {
  healthy: "#10B981",
  warning: "#F59E0B", 
  critical: "#EF4444"
} as const

export default function AdvancedMonitoring({ provider, contracts, isActive }: MonitoringProps) {
  const [metrics, setMetrics] = useState<SystemMetrics[]>([])
  const [alerts, setAlerts] = useState<AlertConfig[]>([])
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([])
  const [performance, setPerformance] = useState<PerformanceMetrics | null>(null)
  const [isCollecting, setIsCollecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'performance' | 'security' | 'alerts'>('overview')

  // Refs for cleanup and state management
  const collectionIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastCollectionRef = useRef<number>(0)
  const alertCooldownsRef = useRef<Record<string, number>>({})

  // Initialize default alerts
  useEffect(() => {
    const defaultAlerts: AlertConfig[] = [
      {
        id: 'high_gas_price',
        name: 'High Gas Price',
        condition: 'gasPrice > threshold',
        threshold: 100, // Gwei
        enabled: true,
        triggerCount: 0
      },
      {
        id: 'circuit_breaker_active',
        name: 'Circuit Breaker Activated',
        condition: 'circuitBreakerActive == true',
        threshold: 1,
        enabled: true,
        triggerCount: 0
      },
      {
        id: 'oracle_failure',
        name: 'Oracle Failure',
        condition: 'oracleFailures > threshold',
        threshold: 0,
        enabled: true,
        triggerCount: 0
      },
      {
        id: 'low_network_health',
        name: 'Low Network Health',
        condition: 'networkHealth < threshold',
        threshold: 50,
        enabled: true,
        triggerCount: 0
      },
      {
        id: 'large_rebase',
        name: 'Large Rebase',
        condition: 'rebaseAmount > threshold',
        threshold: 10, // 10% rebase
        enabled: true,
        triggerCount: 0
      }
    ]
    
    setAlerts(defaultAlerts)
  }, [])

  // Comprehensive metrics collection
  const collectMetrics = useCallback(async (): Promise<SystemMetrics | null> => {
    if (!provider || !contracts.testHelper) return null

    try {
      const startTime = performance.now()
      
      // Collect basic network metrics
      const [
        block,
        feeData,
        protocolStatus
      ] = await Promise.all([
        provider.getBlock('latest'),
        provider.getFeeData(),
        contracts.testHelper.getProtocolStatus().catch(() => null)
      ])

      if (!block) throw new Error("Failed to get latest block")

      // Collect protocol-specific metrics
      let rebaseCount = 0
      let circuitBreakerActive = false
      let oracleConfidence = 0

      if (protocolStatus) {
        rebaseCount = Number(protocolStatus[7] || 0)
        circuitBreakerActive = Boolean(protocolStatus[5])
        oracleConfidence = Number(protocolStatus[9] || 0)
      }

      // Calculate network health score
      const networkHealth = calculateNetworkHealth({
        gasPrice: feeData.gasPrice || BigInt(0),
        blockTime: block.timestamp,
        oracleConfidence
      })

      // Estimate treasury value (mock calculation)
      const treasuryValue = estimateTreasuryValue()

      // Determine protocol health
      const protocolHealth = determineProtocolHealth({
        circuitBreakerActive,
        networkHealth,
        oracleConfidence
      })

      const collectionTime = performance.now() - startTime

      const newMetrics: SystemMetrics = {
        timestamp: Date.now(),
        blockNumber: block.number,
        gasPrice: ethers.formatUnits(feeData.gasPrice || BigInt(0), 'gwei'),
        networkHealth,
        activeUsers: estimateActiveUsers(), // Mock calculation
        totalTransactions: block.number, // Simplified
        rebaseCount,
        circuitBreakerActivations: circuitBreakerActive ? 1 : 0,
        oracleFailures: oracleConfidence < 50 ? 1 : 0,
        treasuryValue,
        protocolHealth
      }

      // Update performance metrics
      setPerformance(prev => ({
        avgBlockTime: calculateAvgBlockTime(block.timestamp),
        avgGasUsed: calculateAvgGasUsed(),
        maxGasUsed: 500000, // Mock
        rebaseExecutionTime: estimateRebaseTime(),
        oracleResponseTime: estimateOracleResponseTime(),
        frontendResponseTime: collectionTime
      }))

      return newMetrics

    } catch (error: any) {
      console.error('Metrics collection failed:', error)
      setError(`Metrics collection failed: ${error.message}`)
      return null
    }
  }, [provider, contracts])

  // Network health calculation
  const calculateNetworkHealth = useCallback((data: {
    gasPrice: bigint
    blockTime: number
    oracleConfidence: number
  }): number => {
    let score = 100

    // Gas price impact (higher gas = lower health)
    const gasPriceGwei = Number(ethers.formatUnits(data.gasPrice, 'gwei'))
    if (gasPriceGwei > 100) score -= 30
    else if (gasPriceGwei > 50) score -= 15
    else if (gasPriceGwei > 20) score -= 5

    // Oracle confidence impact
    if (data.oracleConfidence < 70) score -= 20
    else if (data.oracleConfidence < 85) score -= 10

    // Block time impact (mock calculation)
    const expectedBlockTime = 12 // seconds
    const currentTime = Math.floor(Date.now() / 1000)
    const timeSinceBlock = currentTime - data.blockTime
    if (timeSinceBlock > expectedBlockTime * 2) score -= 15

    return Math.max(0, Math.min(100, score))
  }, [])

  // Protocol health determination
  const determineProtocolHealth = useCallback((data: {
    circuitBreakerActive: boolean
    networkHealth: number
    oracleConfidence: number
  }): 'healthy' | 'warning' | 'critical' => {
    if (data.circuitBreakerActive) return 'critical'
    if (data.networkHealth < 50 || data.oracleConfidence < 50) return 'critical'
    if (data.networkHealth < 70 || data.oracleConfidence < 70) return 'warning'
    return 'healthy'
  }, [])

  // Alert checking and triggering
  const checkAlerts = useCallback((newMetrics: SystemMetrics) => {
    const currentTime = Date.now()

    alerts.forEach(alert => {
      if (!alert.enabled) return

      // Check cooldown
      const lastTriggered = alertCooldownsRef.current[alert.id] || 0
      if (currentTime - lastTriggered < MONITORING_CONFIG.ALERT_COOLDOWN) return

      let shouldTrigger = false

      switch (alert.id) {
        case 'high_gas_price':
          shouldTrigger = parseFloat(newMetrics.gasPrice) > alert.threshold
          break
        case 'circuit_breaker_active':
          shouldTrigger = newMetrics.circuitBreakerActivations > 0
          break
        case 'oracle_failure':
          shouldTrigger = newMetrics.oracleFailures > alert.threshold
          break
        case 'low_network_health':
          shouldTrigger = newMetrics.networkHealth < alert.threshold
          break
        default:
          break
      }

      if (shouldTrigger) {
        triggerAlert(alert, newMetrics)
        alertCooldownsRef.current[alert.id] = currentTime
      }
    })
  }, [alerts])

  // Alert triggering
  const triggerAlert = useCallback((alert: AlertConfig, metrics: SystemMetrics) => {
    const alertMessage = `${alert.name}: Threshold exceeded`
    
    // Update alert trigger count
    setAlerts(prev => prev.map(a => 
      a.id === alert.id 
        ? { ...a, triggerCount: a.triggerCount + 1, lastTriggered: Date.now() }
        : a
    ))

    // Create security event for critical alerts
    if (['circuit_breaker_active', 'oracle_failure'].includes(alert.id)) {
      const securityEvent: SecurityEvent = {
        id: `${alert.id}_${Date.now()}`,
        timestamp: Date.now(),
        type: alert.id === 'circuit_breaker_active' ? 'circuit_breaker' : 'oracle_manipulation',
        severity: 'high',
        description: alertMessage,
        blockNumber: metrics.blockNumber,
        resolved: false
      }

      setSecurityEvents(prev => [securityEvent, ...prev.slice(0, MONITORING_CONFIG.MAX_EVENTS - 1)])
    }

    // Show toast notification
    const toastType = alert.id === 'circuit_breaker_active' ? 'error' : 'warning'
    toast[toastType](alertMessage)

  }, [])

  // Mock estimation functions (would be replaced with real calculations)
  const estimateTreasuryValue = useCallback((): string => {
    return (Math.random() * 1000000 + 500000).toFixed(2) // Random between 500k-1.5M
  }, [])

  const estimateActiveUsers = useCallback((): number => {
    return Math.floor(Math.random() * 1000 + 100) // Random between 100-1100
  }, [])

  const calculateAvgBlockTime = useCallback((currentBlockTime: number): number => {
    return 12 + (Math.random() - 0.5) * 2 // Around 12 seconds ± 1
  }, [])

  const calculateAvgGasUsed = useCallback((): number => {
    return Math.floor(Math.random() * 200000 + 100000) // 100k-300k gas
  }, [])

  const estimateRebaseTime = useCallback((): number => {
    return Math.random() * 5000 + 1000 // 1-6 seconds
  }, [])

  const estimateOracleResponseTime = useCallback((): number => {
    return Math.random() * 500 + 100 // 100-600ms
  }, [])

  // Main collection loop
  useEffect(() => {
    if (!isActive || !provider || !contracts.testHelper) {
      setIsCollecting(false)
      return
    }

    setIsCollecting(true)
    setError(null)

    const collect = async () => {
      const currentTime = Date.now()
      
      // Prevent too frequent collections
      if (currentTime - lastCollectionRef.current < MONITORING_CONFIG.COLLECTION_INTERVAL) {
        return
      }

      const newMetrics = await collectMetrics()
      if (newMetrics) {
        setMetrics(prev => {
          const updated = [newMetrics, ...prev.slice(0, MONITORING_CONFIG.MAX_METRICS_POINTS - 1)]
          
          // Clean old data
          const cutoff = currentTime - MONITORING_CONFIG.RETENTION_PERIOD
          return updated.filter(m => m.timestamp > cutoff)
        })

        checkAlerts(newMetrics)
        lastCollectionRef.current = currentTime
      }
    }

    // Initial collection
    collect()

    // Set up interval
    collectionIntervalRef.current = setInterval(collect, MONITORING_CONFIG.COLLECTION_INTERVAL)

    return () => {
      if (collectionIntervalRef.current) {
        clearInterval(collectionIntervalRef.current)
      }
      setIsCollecting(false)
    }
  }, [isActive, provider, contracts, collectMetrics, checkAlerts])

  // Memoized chart data
  const chartData = useMemo(() => {
    return metrics.slice(0, 50).reverse().map(m => ({
      time: new Date(m.timestamp).toLocaleTimeString(),
      gasPrice: parseFloat(m.gasPrice),
      networkHealth: m.networkHealth,
      activeUsers: m.activeUsers,
      treasuryValue: parseFloat(m.treasuryValue)
    }))
  }, [metrics])

  // Alert management functions
  const toggleAlert = useCallback((alertId: string) => {
    setAlerts(prev => prev.map(alert => 
      alert.id === alertId ? { ...alert, enabled: !alert.enabled } : alert
    ))
  }, [])

  const updateAlertThreshold = useCallback((alertId: string, threshold: number) => {
    setAlerts(prev => prev.map(alert => 
      alert.id === alertId ? { ...alert, threshold } : alert
    ))
  }, [])

  const resolveSecurityEvent = useCallback((eventId: string) => {
    setSecurityEvents(prev => prev.map(event => 
      event.id === eventId ? { ...event, resolved: true } : event
    ))
  }, [])

  if (!isActive) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Advanced Monitoring</h2>
        <div className="text-center py-8 text-gray-500">
          <div className="mb-4">Monitoring is inactive</div>
          <div className="text-sm">Connect wallet and deploy contracts to start monitoring</div>
        </div>
      </div>
    )
  }

  const latestMetrics = metrics[0]

  return (
    <div className="bg-white rounded-lg shadow p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Advanced Monitoring</h2>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${isCollecting ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></div>
            <span className="text-sm text-gray-600">
              {isCollecting ? 'Collecting' : 'Inactive'}
            </span>
          </div>
          {latestMetrics && (
            <div className="text-sm text-gray-500">
              Last update: {new Date(latestMetrics.timestamp).toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center mr-3">
              <span className="text-white text-sm">!</span>
            </div>
            <div>
              <h4 className="text-red-900 font-medium">Monitoring Error</h4>
              <p className="text-red-700 text-sm">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-500 hover:text-red-700"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* System Health Overview */}
      {latestMetrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className={`p-4 rounded-lg ${
            latestMetrics.protocolHealth === 'healthy' ? 'bg-green-50 border border-green-200' :
            latestMetrics.protocolHealth === 'warning' ? 'bg-yellow-50 border border-yellow-200' :
            'bg-red-50 border border-red-200'
          }`}>
            <h4 className="text-sm font-medium text-gray-900 mb-2">Protocol Health</h4>
            <div className={`text-2xl font-bold ${
              latestMetrics.protocolHealth === 'healthy' ? 'text-green-600' :
              latestMetrics.protocolHealth === 'warning' ? 'text-yellow-600' :
              'text-red-600'
            }`}>
              {latestMetrics.protocolHealth.toUpperCase()}
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
            <h4 className="text-sm font-medium text-gray-900 mb-2">Network Health</h4>
            <div className="text-2xl font-bold text-blue-600">
              {latestMetrics.networkHealth}%
            </div>
          </div>

          <div className="bg-purple-50 border border-purple-200 p-4 rounded-lg">
            <h4 className="text-sm font-medium text-gray-900 mb-2">Gas Price</h4>
            <div className="text-2xl font-bold text-purple-600">
              {parseFloat(latestMetrics.gasPrice).toFixed(1)} Gwei
            </div>
          </div>

          <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-lg">
            <h4 className="text-sm font-medium text-gray-900 mb-2">Active Users</h4>
            <div className="text-2xl font-bold text-indigo-600">
              {latestMetrics.activeUsers.toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex space-x-8">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'performance', label: 'Performance' },
            { id: 'security', label: 'Security' },
            { id: 'alerts', label: 'Alerts' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Real-time Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Network Health Chart */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Network Health Trend</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Line 
                      type="monotone" 
                      dataKey="networkHealth" 
                      stroke="#3B82F6" 
                      strokeWidth={2}
                      dot={{ fill: '#3B82F6', strokeWidth: 2, r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Gas Price Chart */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Gas Price Trend</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Area 
                      type="monotone" 
                      dataKey="gasPrice" 
                      stroke="#8B5CF6" 
                      fill="#8B5CF6" 
                      fillOpacity={0.3}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Treasury and User Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Treasury Value */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Treasury Value</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value) => [`${Number(value).toLocaleString()}`, 'Treasury Value']} />
                    <Area 
                      type="monotone" 
                      dataKey="treasuryValue" 
                      stroke="#10B981" 
                      fill="#10B981" 
                      fillOpacity={0.3}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Active Users */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Active Users</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData.slice(-10)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="activeUsers" fill="#F59E0B" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'performance' && performance && (
        <div className="space-y-6">
          {/* Performance Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="text-sm font-medium text-gray-900 mb-2">Avg Block Time</h4>
              <div className="text-2xl font-bold text-blue-600">
                {performance.avgBlockTime.toFixed(1)}s
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="text-sm font-medium text-gray-900 mb-2">Avg Gas Used</h4>
              <div className="text-2xl font-bold text-purple-600">
                {performance.avgGasUsed.toLocaleString()}
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="text-sm font-medium text-gray-900 mb-2">Rebase Execution</h4>
              <div className="text-2xl font-bold text-green-600">
                {(performance.rebaseExecutionTime / 1000).toFixed(2)}s
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="text-sm font-medium text-gray-900 mb-2">Oracle Response</h4>
              <div className="text-2xl font-bold text-yellow-600">
                {performance.oracleResponseTime.toFixed(0)}ms
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="text-sm font-medium text-gray-900 mb-2">Frontend Response</h4>
              <div className="text-2xl font-bold text-indigo-600">
                {performance.frontendResponseTime.toFixed(0)}ms
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="text-sm font-medium text-gray-900 mb-2">Max Gas Used</h4>
              <div className="text-2xl font-bold text-red-600">
                {performance.maxGasUsed.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Performance Analysis */}
          <div className="bg-gray-50 p-6 rounded-lg">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Performance Analysis</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-700">Block Time Performance</span>
                <div className={`px-3 py-1 rounded-full text-sm ${
                  performance.avgBlockTime <= 13 ? 'bg-green-100 text-green-800' :
                  performance.avgBlockTime <= 15 ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {performance.avgBlockTime <= 13 ? 'Excellent' :
                   performance.avgBlockTime <= 15 ? 'Good' : 'Poor'}
                </div>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-gray-700">Gas Efficiency</span>
                <div className={`px-3 py-1 rounded-full text-sm ${
                  performance.avgGasUsed <= 150000 ? 'bg-green-100 text-green-800' :
                  performance.avgGasUsed <= 250000 ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {performance.avgGasUsed <= 150000 ? 'Efficient' :
                   performance.avgGasUsed <= 250000 ? 'Moderate' : 'High Usage'}
                </div>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-gray-700">Oracle Latency</span>
                <div className={`px-3 py-1 rounded-full text-sm ${
                  performance.oracleResponseTime <= 200 ? 'bg-green-100 text-green-800' :
                  performance.oracleResponseTime <= 500 ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {performance.oracleResponseTime <= 200 ? 'Fast' :
                   performance.oracleResponseTime <= 500 ? 'Normal' : 'Slow'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'security' && (
        <div className="space-y-6">
          {/* Security Events */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Security Events</h3>
            <div className="space-y-3">
              {securityEvents.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <div className="mb-2">No security events detected</div>
                  <div className="text-sm">System is operating normally</div>
                </div>
              ) : (
                securityEvents.map(event => (
                  <div
                    key={event.id}
                    className={`border rounded-lg p-4 ${
                      event.resolved ? 'border-gray-200 bg-gray-50' :
                      event.severity === 'critical' ? 'border-red-200 bg-red-50' :
                      event.severity === 'high' ? 'border-orange-200 bg-orange-50' :
                      event.severity === 'medium' ? 'border-yellow-200 bg-yellow-50' :
                      'border-blue-200 bg-blue-50'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            event.severity === 'critical' ? 'bg-red-100 text-red-800' :
                            event.severity === 'high' ? 'bg-orange-100 text-orange-800' :
                            event.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-blue-100 text-blue-800'
                          }`}>
                            {event.severity.toUpperCase()}
                          </span>
                          <span className="text-sm font-medium text-gray-900">
                            {event.type.replace(/_/g, ' ').toUpperCase()}
                          </span>
                          {event.resolved && (
                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              RESOLVED
                            </span>
                          )}
                        </div>
                        <p className="text-gray-700 mt-1">{event.description}</p>
                        <div className="text-xs text-gray-500 mt-2">
                          {new Date(event.timestamp).toLocaleString()}
                          {event.blockNumber && ` • Block #${event.blockNumber}`}
                        </div>
                      </div>
                      {!event.resolved && (
                        <button
                          onClick={() => resolveSecurityEvent(event.id)}
                          className="text-sm text-blue-600 hover:text-blue-800"
                        >
                          Mark Resolved
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Security Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
              <h4 className="text-sm font-medium text-gray-900 mb-2">Resolved Events</h4>
              <div className="text-2xl font-bold text-green-600">
                {securityEvents.filter(e => e.resolved).length}
              </div>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
              <h4 className="text-sm font-medium text-gray-900 mb-2">Open Events</h4>
              <div className="text-2xl font-bold text-yellow-600">
                {securityEvents.filter(e => !e.resolved).length}
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
              <h4 className="text-sm font-medium text-gray-900 mb-2">Critical Events</h4>
              <div className="text-2xl font-bold text-red-600">
                {securityEvents.filter(e => e.severity === 'critical' && !e.resolved).length}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'alerts' && (
        <div className="space-y-6">
          {/* Alert Configuration */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Alert Configuration</h3>
            <div className="space-y-4">
              {alerts.map(alert => (
                <div key={alert.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => toggleAlert(alert.id)}
                          className={`w-10 h-6 rounded-full transition-colors ${
                            alert.enabled ? 'bg-blue-600' : 'bg-gray-300'
                          }`}
                        >
                          <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                            alert.enabled ? 'translate-x-5' : 'translate-x-1'
                          }`}></div>
                        </button>
                        <h4 className="font-medium text-gray-900">{alert.name}</h4>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{alert.condition}</p>
                      <div className="text-xs text-gray-500 mt-2">
                        Triggered {alert.triggerCount} times
                        {alert.lastTriggered && (
                          <span> • Last: {new Date(alert.lastTriggered).toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                    <div className="ml-4">
                      <input
                        type="number"
                        value={alert.threshold}
                        onChange={(e) => updateAlertThreshold(alert.id, parseFloat(e.target.value))}
                        className="w-20 px-2 py-1 text-sm border border-gray-300 rounded"
                        disabled={!alert.enabled}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Alert Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Alert Frequency */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="text-lg font-medium text-gray-900 mb-4">Alert Frequency</h4>
              <div className="space-y-2">
                {alerts.map(alert => (
                  <div key={alert.id} className="flex justify-between">
                    <span className="text-sm text-gray-600">{alert.name}</span>
                    <span className="text-sm font-medium">{alert.triggerCount}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Alert Status */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="text-lg font-medium text-gray-900 mb-4">Alert Status</h4>
              <div className="flex justify-center">
                <PieChart width={200} height={200}>
                  <Pie
                    data={[
                      { name: 'Enabled', value: alerts.filter(a => a.enabled).length },
                      { name: 'Disabled', value: alerts.filter(a => !a.enabled).length }
                    ]}
                    cx={100}
                    cy={100}
                    innerRadius={40}
                    outerRadius={80}
                    dataKey="value"
                  >
                    <Cell fill="#10B981" />
                    <Cell fill="#6B7280" />
                  </Pie>
                  <Tooltip />
                </PieChart>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}