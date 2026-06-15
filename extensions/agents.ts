import type { Dirent } from 'node:fs'
import { existsSync, readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import type {
  BuildSystemPromptOptions,
  ExtensionAPI,
  SessionEntry,
} from '@earendil-works/pi-coding-agent'
import { formatSkillsForPrompt, parseFrontmatter } from '@earendil-works/pi-coding-agent'

const AGENT_SESSION_TYPE = 'agent-session'
const AGENTS_DIR = path.join(__dirname, '..', 'agents')
const AGENT_FILE_EXTENSIONS = ['.agent.md', '.md'] as const

type AgentDefinition = {
  commandName: string
  displayName: string
  description?: string
  argumentHint?: string
  sourcePath: string
  systemPrompt: string
}

type AgentSessionData = Pick<
  AgentDefinition,
  'commandName' | 'displayName' | 'sourcePath' | 'systemPrompt'
>

function systemPromptOptionsToText(systemPromptOptions: BuildSystemPromptOptions): string {
  const lines: string[] = ['']

  const tools = systemPromptOptions.selectedTools || ['read', 'bash', 'edit', 'write']

  const hasBash = tools.includes('bash')
  const hasGrep = tools.includes('grep')
  const hasFind = tools.includes('find')
  const hasLs = tools.includes('ls')
  const hasRead = tools.includes('read')

  lines.push('Available tools:')
  if (!systemPromptOptions.toolSnippets) {
    lines.push('(none)')
  } else {
    for (const [name, description] of Object.entries(systemPromptOptions.toolSnippets)) {
      lines.push(`- ${name}: ${description}`)
    }
  }

  lines.push('')
  lines.push(
    'In addition to the tools above, you may have access to other custom tools depending on the project.'
  )
  lines.push('')

  lines.push('Guidelines:')
  if (hasBash && !hasGrep && !hasFind && !hasLs) {
    lines.push('- Use bash for file operations like ls, rg, find')
  }
  if (systemPromptOptions.promptGuidelines) {
    for (const guideline of systemPromptOptions.promptGuidelines) {
      if (guideline.trim()) {
        lines.push(`- ${guideline.trim()}`)
      }
    }
  }

  const contextFiles = systemPromptOptions.contextFiles ?? []
  if (contextFiles.length > 0) {
    lines.push('<project_context>')
    lines.push('Project-specific instructions and guidelines:')
    for (const { path: filePath, content } of contextFiles) {
      lines.push(`<project_instructions path="${filePath}">`)
      lines.push(content)
      lines.push('</project_instructions>')
    }
    lines.push('</project_context>')
  }

  if (hasRead && systemPromptOptions.skills && systemPromptOptions.skills.length > 0) {
    lines.push(formatSkillsForPrompt(systemPromptOptions.skills))
  }

  lines.push(`Current date: ${new Date().toISOString().split('T')[0]}`)
  lines.push(`Current working directory: ${process.cwd()}`)

  return lines.join('\n')
}

function getAgentSessionData(entries: SessionEntry[]): AgentSessionData | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]

    if (entry.type !== 'custom' || entry.customType !== AGENT_SESSION_TYPE) {
      continue
    }

    const data = entry.data as AgentSessionData | undefined
    if (
      !data ||
      typeof data.commandName !== 'string' ||
      !data.commandName.trim() ||
      typeof data.displayName !== 'string' ||
      !data.displayName.trim() ||
      typeof data.systemPrompt !== 'string' ||
      !data.systemPrompt.trim()
    ) {
      return undefined
    }

    return {
      commandName: data.commandName,
      displayName: data.displayName,
      sourcePath: typeof data.sourcePath === 'string' ? data.sourcePath : AGENTS_DIR,
      systemPrompt: data.systemPrompt,
    }
  }

  return undefined
}

function isAgentFile(entry: Dirent): boolean {
  if (!entry.isFile() && !entry.isSymbolicLink()) {
    return false
  }

  return AGENT_FILE_EXTENSIONS.some(extension => entry.name.endsWith(extension))
}

function getCommandName(fileName: string): string {
  for (const extension of AGENT_FILE_EXTENSIONS) {
    if (fileName.endsWith(extension)) {
      return fileName.slice(0, -extension.length)
    }
  }

  return fileName.replace(/\.md$/, '')
}

function requiresArgument(argumentHint?: string): boolean {
  return typeof argumentHint === 'string' && argumentHint.includes('<')
}

function formatUsage(commandName: string, argumentHint?: string): string {
  return argumentHint ? `/${commandName} ${argumentHint}` : `/${commandName} [prompt]`
}

async function loadAgentDefinitions(): Promise<AgentDefinition[]> {
  if (!existsSync(AGENTS_DIR)) {
    return []
  }

  const entries = readdirSync(AGENTS_DIR, { withFileTypes: true })
    .filter(isAgentFile)
    .sort((a, b) => a.name.localeCompare(b.name))

  const agents = await Promise.all(
    entries.map(async entry => {
      const sourcePath = path.join(AGENTS_DIR, entry.name)
      const rawContent = await readFile(sourcePath, 'utf-8')
      const { frontmatter, body } = parseFrontmatter<Record<string, string>>(rawContent)
      const systemPrompt = body.trim()
      const commandName = getCommandName(entry.name)
      const displayName = frontmatter.name?.trim() || commandName

      if (!systemPrompt) {
        throw new Error(`Prompt vide: ${sourcePath}`)
      }

      return {
        commandName,
        displayName,
        description: frontmatter.description?.trim(),
        argumentHint: frontmatter['argument-hint']?.trim(),
        sourcePath,
        systemPrompt,
      } satisfies AgentDefinition
    })
  )

  return agents
}

export default async function (pi: ExtensionAPI) {
  const agentDefinitions = await loadAgentDefinitions()
  let agentSessionData: AgentSessionData | undefined

  for (const agent of agentDefinitions) {
    pi.registerCommand(agent.commandName, {
      description: agent.description,
      async handler(args, ctx) {
        if (!ctx.hasUI) {
          return
        }

        const userPrompt = args.trim()
        if (!userPrompt && requiresArgument(agent.argumentHint)) {
          ctx.ui.notify(
            `Please provide input. Usage: ${formatUsage(agent.commandName, agent.argumentHint)}`,
            'info'
          )
          return
        }

        const shouldStartNewSession = await ctx.ui.confirm(
          `New /${agent.commandName} session?`,
          `Create a new ${agent.displayName} session?`
        )

        if (!shouldStartNewSession) {
          ctx.ui.notify('Cancelled', 'info')
          return
        }

        const result = await ctx.newSession({
          parentSession: ctx.sessionManager.getSessionFile(),
          async setup(sessionManager) {
            sessionManager.appendCustomEntry(AGENT_SESSION_TYPE, {
              commandName: agent.commandName,
              displayName: agent.displayName,
              sourcePath: agent.sourcePath,
              systemPrompt: agent.systemPrompt,
            } satisfies AgentSessionData)
          },
          async withSession(replacementCtx) {
            if (userPrompt) {
              replacementCtx.sendUserMessage(userPrompt)
            }
          },
        })

        if (result.cancelled) {
          ctx.ui.notify('Session creation cancelled', 'info')
        }
      },
    })
  }

  pi.on('session_start', async (_event, ctx) => {
    agentSessionData = getAgentSessionData(ctx.sessionManager.getEntries())
    if (!agentSessionData) {
      return undefined
    }

    ctx.ui.notify(
      `${agentSessionData.displayName} session detected. System prompt loaded from ${agentSessionData.sourcePath}.`,
      'info'
    )
  })

  pi.on('before_agent_start', async event => {
    if (!agentSessionData) {
      return undefined
    }

    return {
      systemPrompt: `${agentSessionData.systemPrompt}\n\n${systemPromptOptionsToText(event.systemPromptOptions)}`,
    }
  })
}
