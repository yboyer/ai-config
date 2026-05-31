/**
 * Protected Paths Extension
 *
 * Blocks `write` and `edit` tool calls when the target path matches a
 * protected pattern.
 *
 * Why use it:
 * - Prevent accidental edits to sensitive files/folders.
 * - Add guardrails for generated changes in large repositories.
 *
 * How to configure:
 * - Global: ~/.pi/agent/settings.json
 * - Project: <cwd>/.pi/settings.json (overrides global)
 *
 * Supported settings keys (first match wins):
 * 1) "protectedPaths": [".env", ".git/", "node_modules/"]
 * 2) "extensionsConfig": { "protectedPaths": [...] }
 * 3) "extensionsConfig": { "protected-paths": { "paths": [...] } }
 *
 * Fallback default when nothing is configured:
 * [".env", ".git/", "node_modules/"]
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { getAgentDir } from '@earendil-works/pi-coding-agent'

const DEFAULT_PROTECTED_PATHS = ['.env', '.git/', 'node_modules/']

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const entries = value.filter((item): item is string => typeof item === 'string')
  return entries.length > 0 ? entries : undefined
}

function readJson(filePath: string): Record<string, unknown> | undefined {
  if (!existsSync(filePath)) return undefined

  try {
    const content = readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(content)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

function extractProtectedPaths(settings: Record<string, unknown>): string[] | undefined {
  // Only allow protectedPaths as a string array at the root or in extensionsConfig
  const extensionsConfig =
    settings.extensionsConfig && typeof settings.extensionsConfig === 'object'
      ? (settings.extensionsConfig as Record<string, unknown>)
      : undefined

  // Only accept protectedPaths as a string array, never 'protected-paths' or nested keys
  return asStringArray(settings.protectedPaths) ?? asStringArray(extensionsConfig?.protectedPaths)
}

function loadProtectedPaths(cwd: string): string[] {
  const globalSettingsPath = join(getAgentDir(), 'settings.json')
  const projectSettingsPath = join(cwd, '.pi', 'settings.json')

  const globalSettings = readJson(globalSettingsPath)
  const projectSettings = readJson(projectSettingsPath)

  const globalPaths = globalSettings ? extractProtectedPaths(globalSettings) : undefined
  const projectPaths = projectSettings ? extractProtectedPaths(projectSettings) : undefined

  return projectPaths ?? globalPaths ?? DEFAULT_PROTECTED_PATHS
}

export default function (pi: ExtensionAPI) {
  let protectedPaths = DEFAULT_PROTECTED_PATHS

  pi.on('session_start', (_event, ctx) => {
    protectedPaths = loadProtectedPaths(ctx.cwd)
  })

  pi.on('tool_call', async (event, ctx) => {
    if (event.toolName !== 'write' && event.toolName !== 'edit') {
      return undefined
    }

    if (protectedPaths === DEFAULT_PROTECTED_PATHS) {
      protectedPaths = loadProtectedPaths(ctx.cwd)
    }

    const path = event.input.path as string | undefined
    if (!path) return undefined

    const isProtected = protectedPaths.some(p => path.includes(p))

    if (isProtected) {
      if (ctx.hasUI) {
        ctx.ui.notify(`Blocked write to protected path: ${path}`, 'warning')
      }
      return { block: true, reason: `Path "${path}" is protected` }
    }

    return undefined
  })
}
