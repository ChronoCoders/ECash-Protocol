"use client"

import type React from "react"

import { config } from "../lib/config"

interface FeatureFlagsProps {
  children: React.ReactNode
  feature: keyof typeof config.features
  fallback?: React.ReactNode
}

export default function FeatureFlags({ children, feature, fallback = null }: FeatureFlagsProps) {
  if (!config.features[feature]) {
    return <>{fallback}</>
  }

  return <>{children}</>
}

export function DebugInfo({ data }: { data: any }) {
  if (!config.features.debugMode) {
    return null
  }

  return (
    <div className="mt-4 p-3 bg-gray-100 rounded-lg">
      <details>
        <summary className="cursor-pointer text-sm font-medium text-gray-700">Debug Information</summary>
        <pre className="mt-2 text-xs text-gray-600 overflow-auto">{JSON.stringify(data, null, 2)}</pre>
      </details>
    </div>
  )
}
