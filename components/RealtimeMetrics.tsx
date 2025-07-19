"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts"

interface ProtocolStatus {
  currentPrice: string
  targetPrice: string
  totalSupply: string
  deviation: string
  canRebase: boolean
  circuitBreakerActive: boolean
  lastRebaseTime: string
  rebaseCount: string
  stabilityBand: number
  oracleConfidence: string
}

interface RealtimeMetricsProps {
  protocolStatus: ProtocolStatus | null
}

interface ChartDataPoint {
  timestamp: string
  price: number
  supply: number
  deviation: number
  id: string // Add unique identifier
  confidence: number
}

interface MetricsState {
  chartData: ChartDataPoint[]
  isLoading: boolean
  error: string | null
  lastUpdate: number
  dataQuality: 'good' | 'degraded' | 'poor'
}

// Constants for better maintainability
const CHART_CONFIG = {
  MAX_DATA_POINTS: 50,
  UPDATE_THRESHOLD: 1000, // 1 second minimum between updates
  STALE_DATA_THRESHOLD: 30000, // 30 seconds
  MAX_DEVIATION_DISPLAY: 50, // Maximum deviation % to display
  PRICE_BOUNDS: { min: 0.5, max: 2.0 }, // Reasonable price bounds for display
} as const

const CHART_COLORS = {
  price: "#3B82F6",
  target: "#10B981", 
  supply: "#8B5CF6",
  deviation: "#F59E0B",
  confidence: "#EF4444"
} as const

export default function RealtimeMetrics({ protocolStatus }: RealtimeMetricsProps) {
  const [state, setState] = useState<MetricsState>({
    chartData: [],
    isLoading: false,
    error: null,
    lastUpdate: 0,
    dataQuality: 'good'
  })

  // Refs for preventing memory leaks and managing state
  const lastProcessedStatus = useRef<string>('')
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const chartContainerRef = useRef<HTMLDivElement>(null)

  // Memoized data validation function
  const validateProtocolStatus = useCallback((status: ProtocolStatus | null): boolean => {
    if (!status) return false

    try {
      const price = Number.parseFloat(status.currentPrice)
      const supply = Number.parseFloat(status.totalSupply)
      const deviation = Number.parseFloat(status.deviation)
      const confidence = Number.parseFloat(status.oracleConfidence)

      // Validate numeric bounds
      if (isNaN(price) || isNaN(supply) || isNaN(deviation) || isNaN(confidence)) {
        return false
      }

      if (price <= 0 || supply <= 0) {
        return false
      }

      if (price < CHART_CONFIG.PRICE_BOUNDS.min || price > CHART_CONFIG.PRICE_BOUNDS.max) {
        console.warn(`Price ${price} outside reasonable bounds`)
        return false
      }

      if (Math.abs(deviation) > CHART_CONFIG.MAX_DEVIATION_DISPLAY) {
        console.warn(`Deviation ${deviation} exceeds display threshold`)
        return false
      }

      return true
    } catch (error) {
      console.error('Error validating protocol status:', error)
      return false
    }
  }, [])

  // Enhanced data processing with validation and deduplication
  const processProtocolData = useCallback((status: ProtocolStatus): ChartDataPoint | null => {
    if (!validateProtocolStatus(status)) {
      return null
    }

    try {
      const currentTime = Date.now()
      const timestamp = new Date().toLocaleTimeString()
      
      // Create unique identifier for deduplication
      const statusHash = JSON.stringify({
        price: status.currentPrice,
        supply: status.totalSupply,
        deviation: status.deviation,
        confidence: status.oracleConfidence
      })

      // Skip if data hasn't changed
      if (statusHash === lastProcessedStatus.current) {
        return null
      }

      lastProcessedStatus.current = statusHash

      const newDataPoint: ChartDataPoint = {
        id: `${currentTime}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp,
        price: Number.parseFloat(status.currentPrice),
        supply: Number.parseFloat(status.totalSupply) / 1000000, // Convert to millions
        deviation: Number.parseFloat(status.deviation) * 100, // Convert to percentage
        confidence: Number.parseFloat(status.oracleConfidence),
      }

      return newDataPoint
    } catch (error) {
      console.error('Error processing protocol data:', error)
      setState(prev => ({ 
        ...prev, 
        error: 'Data processing error',
        dataQuality: 'poor'
      }))
      return null
    }
  }, [validateProtocolStatus])

  // Optimized chart data update with rate limiting
  const updateChartData = useCallback((newDataPoint: ChartDataPoint) => {
    setState(prev => {
      const currentTime = Date.now()
      
      // Rate limiting - prevent too frequent updates
      if (currentTime - prev.lastUpdate < CHART_CONFIG.UPDATE_THRESHOLD) {
        return prev
      }

      // Add new data point and maintain size limit
      const updatedData = [...prev.chartData, newDataPoint]
        .slice(-CHART_CONFIG.MAX_DATA_POINTS)

      // Assess data quality based on update frequency and data consistency
      let dataQuality: MetricsState['dataQuality'] = 'good'
      if (updatedData.length > 0) {
        const recentData = updatedData.slice(-5)
        const hasInconsistentData = recentData.some(point => 
          Math.abs(point.deviation) > 100 || 
          point.price <= 0 || 
          point.confidence < 0
        )
        
        if (hasInconsistentData) {
          dataQuality = 'poor'
        } else if (currentTime - prev.lastUpdate > CHART_CONFIG.STALE_DATA_THRESHOLD) {
          dataQuality = 'degraded'
        }
      }

      return {
        ...prev,
        chartData: updatedData,
        lastUpdate: currentTime,
        error: null,
        dataQuality
      }
    })
  }, [])

  // Effect to process new protocol status with debouncing
  useEffect(() => {
    if (!protocolStatus) {
      setState(prev => ({ ...prev, isLoading: false }))
      return
    }

    setState(prev => ({ ...prev, isLoading: true }))

    // Clear existing timeout
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current)
    }

    // Debounce updates to prevent excessive re-renders
    updateTimeoutRef.current = setTimeout(() => {
      const newDataPoint = processProtocolData(protocolStatus)
      
      if (newDataPoint) {
        updateChartData(newDataPoint)
      }
      
      setState(prev => ({ ...prev, isLoading: false }))
    }, 100)

    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current)
      }
    }
  }, [protocolStatus, processProtocolData, updateChartData])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current)
      }
    }
  }, [])

  // Memoized chart configurations for performance
  const chartConfigs = useMemo(() => ({
    price: {
      domain: [CHART_CONFIG.PRICE_BOUNDS.min, CHART_CONFIG.PRICE_BOUNDS.max],
      formatter: (value: number) => `$${value.toFixed(4)}`
    },
    supply: {
      formatter: (value: number) => `${value.toFixed(2)}M`
    },
    deviation: {
      domain: [-CHART_CONFIG.MAX_DEVIATION_DISPLAY, CHART_CONFIG.MAX_DEVIATION_DISPLAY],
      formatter: (value: number) => `${value.toFixed(2)}%`
    },
    confidence: {
      domain: [0, 100],
      formatter: (value: number) => `${value.toFixed(0)}%`
    }
  }), [])

  // Enhanced error display component
  const ErrorDisplay = ({ error }: { error: string }) => (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 m-4">
      <div className="flex items-center">
        <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center mr-3">
          <span className="text-white text-sm">!</span>
        </div>
        <div>
          <h4 className="text-red-900 font-medium">Chart Error</h4>
          <p className="text-red-700 text-sm">{error}</p>
        </div>
        <button
          onClick={() => setState(prev => ({ ...prev, error: null }))}
          className="ml-auto text-red-500 hover:text-red-700"
        >
          ✕
        </button>
      </div>
    </div>
  )

  // Loading state component
  const LoadingDisplay = () => (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      <span className="ml-2 text-gray-600">Loading protocol data...</span>
    </div>
  )

  // Data quality indicator
  const DataQualityIndicator = () => {
    const getQualityColor = () => {
      switch (state.dataQuality) {
        case 'good': return 'text-green-600 bg-green-100'
        case 'degraded': return 'text-yellow-600 bg-yellow-100'
        case 'poor': return 'text-red-600 bg-red-100'
        default: return 'text-gray-600 bg-gray-100'
      }
    }

    const getQualityText = () => {
      switch (state.dataQuality) {
        case 'good': return 'Good'
        case 'degraded': return 'Degraded'
        case 'poor': return 'Poor'
        default: return 'Unknown'
      }
    }

    return (
      <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${getQualityColor()}`}>
        <span className="w-2 h-2 rounded-full bg-current mr-1"></span>
        Data Quality: {getQualityText()}
      </div>
    )
  }

  // Enhanced custom tooltip for charts
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null

    return (
      <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
        <p className="font-medium text-gray-900">{`Time: ${label}`}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} style={{ color: entry.color }} className="text-sm">
            {`${entry.name}: ${entry.value}`}
          </p>
        ))}
      </div>
    )
  }

  if (!protocolStatus) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Real-time Metrics</h2>
        <div className="text-center py-8 text-gray-500">
          <div className="mb-4">No protocol data available</div>
          <div className="text-sm">Connect wallet and deploy contracts to view metrics</div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow p-6" ref={chartContainerRef}>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Real-time Metrics</h2>
        <div className="flex items-center space-x-4">
          <DataQualityIndicator />
          {state.isLoading && (
            <div className="flex items-center text-sm text-gray-500">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500 mr-2"></div>
              Updating...
            </div>
          )}
          <div className="text-sm text-gray-500">
            Points: {state.chartData.length}/{CHART_CONFIG.MAX_DATA_POINTS}
          </div>
        </div>
      </div>

      {state.error && <ErrorDisplay error={state.error} />}

      {state.isLoading && state.chartData.length === 0 ? (
        <LoadingDisplay />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Price Tracking Chart */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Price Tracking</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={state.chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis 
                    dataKey="timestamp" 
                    tick={{ fontSize: 12 }} 
                    interval="preserveStartEnd"
                    stroke="#6b7280"
                  />
                  <YAxis 
                    domain={chartConfigs.price.domain}
                    tick={{ fontSize: 12 }} 
                    tickFormatter={chartConfigs.price.formatter}
                    stroke="#6b7280"
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="price"
                    stroke={CHART_COLORS.price}
                    strokeWidth={2}
                    dot={{ fill: CHART_COLORS.price, strokeWidth: 2, r: 3 }}
                    connectNulls={false}
                  />
                  {/* Target price line */}
                  <Line
                    type="monotone"
                    dataKey={() => 1.0}
                    stroke={CHART_COLORS.target}
                    strokeDasharray="5 5"
                    strokeWidth={1}
                    dot={false}
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 text-sm text-gray-600 flex items-center justify-between">
              <div>
                <span className="inline-block w-3 h-3 rounded mr-2" style={{ backgroundColor: CHART_COLORS.price }}></span>
                Current Price
                <span className="inline-block w-3 h-3 rounded mr-2 ml-4" style={{ backgroundColor: CHART_COLORS.target }}></span>
                Target Price ($1.00)
              </div>
              <div className="text-xs">
                Latest: {state.chartData.length > 0 ? chartConfigs.price.formatter(state.chartData[state.chartData.length - 1]?.price || 0) : 'N/A'}
              </div>
            </div>
          </div>

          {/* Supply Changes Chart */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Supply Changes</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={state.chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis 
                    dataKey="timestamp" 
                    tick={{ fontSize: 12 }} 
                    interval="preserveStartEnd"
                    stroke="#6b7280"
                  />
                  <YAxis 
                    tick={{ fontSize: 12 }} 
                    tickFormatter={chartConfigs.supply.formatter}
                    stroke="#6b7280"
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area 
                    type="monotone" 
                    dataKey="supply" 
                    stroke={CHART_COLORS.supply} 
                    fill={CHART_COLORS.supply} 
                    fillOpacity={0.3}
                    connectNulls={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 text-sm text-gray-600 flex items-center justify-between">
              <div>
                <span className="inline-block w-3 h-3 rounded mr-2" style={{ backgroundColor: CHART_COLORS.supply }}></span>
                Total Supply (Millions)
              </div>
              <div className="text-xs">
                Latest: {state.chartData.length > 0 ? chartConfigs.supply.formatter(state.chartData[state.chartData.length - 1]?.supply || 0) : 'N/A'}
              </div>
            </div>
          </div>

          {/* Deviation Chart */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Price Deviation</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={state.chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis 
                    dataKey="timestamp" 
                    tick={{ fontSize: 12 }} 
                    interval="preserveStartEnd"
                    stroke="#6b7280"
                  />
                  <YAxis 
                    domain={chartConfigs.deviation.domain}
                    tick={{ fontSize: 12 }} 
                    tickFormatter={chartConfigs.deviation.formatter}
                    stroke="#6b7280"
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="deviation"
                    stroke={CHART_COLORS.deviation}
                    strokeWidth={2}
                    dot={{ fill: CHART_COLORS.deviation, strokeWidth: 2, r: 3 }}
                    connectNulls={false}
                  />
                  {/* Stability band lines */}
                  {[1, -1, 5, -5, 10, -10].map((value, index) => (
                    <Line
                      key={index}
                      type="monotone"
                      dataKey={() => value}
                      stroke={Math.abs(value) === 1 ? CHART_COLORS.target : Math.abs(value) === 5 ? CHART_COLORS.deviation : CHART_COLORS.confidence}
                      strokeDasharray="2 2"
                      strokeWidth={1}
                      dot={false}
                      connectNulls={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 text-sm text-gray-600">
              <div className="flex items-center justify-between">
                <div>
                  <span className="inline-block w-3 h-3 rounded mr-2" style={{ backgroundColor: CHART_COLORS.deviation }}></span>
                  Price Deviation
                </div>
                <div className="text-xs">
                  Latest: {state.chartData.length > 0 ? chartConfigs.deviation.formatter(state.chartData[state.chartData.length - 1]?.deviation || 0) : 'N/A'}
                </div>
              </div>
              <div className="mt-1 text-xs">
                <span className="text-green-600">±1%</span> |
                <span className="text-yellow-600 ml-1">±5%</span> |
                <span className="text-red-600 ml-1">±10%</span> Stability Bands
              </div>
            </div>
          </div>

          {/* Oracle Confidence Chart */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Oracle Confidence</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={state.chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis 
                    dataKey="timestamp" 
                    tick={{ fontSize: 12 }} 
                    interval="preserveStartEnd"
                    stroke="#6b7280"
                  />
                  <YAxis 
                    domain={chartConfigs.confidence.domain}
                    tick={{ fontSize: 12 }} 
                    tickFormatter={chartConfigs.confidence.formatter}
                    stroke="#6b7280"
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area 
                    type="monotone" 
                    dataKey="confidence" 
                    stroke={CHART_COLORS.confidence} 
                    fill={CHART_COLORS.confidence} 
                    fillOpacity={0.3}
                    connectNulls={false}
                  />
                  {/* Confidence threshold lines */}
                  <Line
                    type="monotone"
                    dataKey={() => 80}
                    stroke={CHART_COLORS.target}
                    strokeDasharray="3 3"
                    strokeWidth={1}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey={() => 50}
                    stroke={CHART_COLORS.deviation}
                    strokeDasharray="3 3"
                    strokeWidth={1}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 text-sm text-gray-600 flex items-center justify-between">
              <div>
                <span className="inline-block w-3 h-3 rounded mr-2" style={{ backgroundColor: CHART_COLORS.confidence }}></span>
                Oracle Confidence
              </div>
              <div className="text-xs">
                Latest: {state.chartData.length > 0 ? chartConfigs.confidence.formatter(state.chartData[state.chartData.length - 1]?.confidence || 0) : 'N/A'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Market Metrics Summary */}
      {protocolStatus && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-blue-50 p-4 rounded-lg">
            <h4 className="text-sm font-medium text-blue-900 mb-2">Market Cap</h4>
            <div className="text-2xl font-bold text-blue-700">
              $
              {(
                Number.parseFloat(protocolStatus.currentPrice) * Number.parseFloat(protocolStatus.totalSupply)
              ).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </div>

          <div className="bg-green-50 p-4 rounded-lg">
            <h4 className="text-sm font-medium text-green-900 mb-2">Rebase Count</h4>
            <div className="text-2xl font-bold text-green-700">
              {protocolStatus.rebaseCount}
            </div>
          </div>

          <div className="bg-yellow-50 p-4 rounded-lg">
            <h4 className="text-sm font-medium text-yellow-900 mb-2">Oracle Confidence</h4>
            <div className={`text-2xl font-bold ${
              Number.parseInt(protocolStatus.oracleConfidence) >= 80
                ? "text-green-600"
                : Number.parseInt(protocolStatus.oracleConfidence) >= 50
                  ? "text-yellow-600"
                  : "text-red-600"
            }`}>
              {protocolStatus.oracleConfidence}%
            </div>
          </div>

          <div className="bg-purple-50 p-4 rounded-lg">
            <h4 className="text-sm font-medium text-purple-900 mb-2">System Health</h4>
            <div className={`text-lg font-bold ${
              protocolStatus.circuitBreakerActive
                ? "text-red-600"
                : Number.parseFloat(protocolStatus.deviation) > 0.1
                  ? "text-yellow-600"
                  : "text-green-600"
            }`}>
              {protocolStatus.circuitBreakerActive
                ? "Critical"
                : Number.parseFloat(protocolStatus.deviation) > 0.1
                  ? "Warning"
                  : "Healthy"}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}