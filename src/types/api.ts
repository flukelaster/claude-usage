/**
 * API response types — derived from server function return values using
 * `Awaited<ReturnType<…>>`. Client code should import types from here
 * instead of reaching into `~/server/…` directly.
 */

import type { getOverviewAll } from '~/server/functions/get-overview'
import type { getProjects, getProjectDetail } from '~/server/functions/get-projects'
import type { getSessions, getSessionDetail } from '~/server/functions/get-sessions'
import type { getForecast } from '~/server/functions/get-forecast'
import type { getActivityAll } from '~/server/functions/get-activity'
import type { getCacheStatsAll } from '~/server/functions/get-cache-stats'
import type { getModelStatsAll } from '~/server/functions/get-model-stats'
import type { getDailyUsageAll } from '~/server/functions/get-daily-usage'
import type { getEfficiencyAll } from '~/server/functions/get-efficiency'
import type { getWhatIfAll } from '~/server/functions/get-what-if'
import type { homedir } from '~/server/functions/get-settings'
import type { syncLogs } from '~/server/functions/sync-logs'

export type OverviewData = Awaited<ReturnType<typeof getOverviewAll>>
export type OverviewKpi = OverviewData['kpi']
export type DailyCost = OverviewData['dailyCost'][number]
export type TopProject = OverviewData['topProjects'][number]
export type RecentSession = OverviewData['recentSessions'][number]

export type ProjectsData = Awaited<ReturnType<typeof getProjects>>
export type ProjectSummary = ProjectsData[number]
export type ProjectDetail = Awaited<ReturnType<typeof getProjectDetail>>

export type SessionsData = Awaited<ReturnType<typeof getSessions>>
export type SessionSummary = SessionsData[number]
export type SessionDetail = Awaited<ReturnType<typeof getSessionDetail>>

export type ForecastData = Awaited<ReturnType<typeof getForecast>>
export type ForecastChartPoint = ForecastData['chartData'][number]

export type ActivityData = Awaited<ReturnType<typeof getActivityAll>>
export type HeatmapCell = ActivityData['heatmapData'][number]

export type CacheData = Awaited<ReturnType<typeof getCacheStatsAll>>
export type ModelCacheStat = CacheData['modelCacheStats'][number]
export type ProjectCacheStat = CacheData['projectCache'][number]

export type ModelStatsData = Awaited<ReturnType<typeof getModelStatsAll>>
export type ModelStat = ModelStatsData['modelStats'][number]

export type DailyUsageData = Awaited<ReturnType<typeof getDailyUsageAll>>
export type DailyUsageRow = DailyUsageData['daily'][number]

export type EfficiencyData = Awaited<ReturnType<typeof getEfficiencyAll>>
export type WhatIfData = Awaited<ReturnType<typeof getWhatIfAll>>
export type SettingsData = Awaited<ReturnType<typeof homedir>>
export type SyncResult = Awaited<ReturnType<typeof syncLogs>>
