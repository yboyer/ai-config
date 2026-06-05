import type { Model } from '@earendil-works/pi-ai'
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent'

const STATUS_KEY = 'routing'

type RouteLevel = 'low' | 'medium' | 'high'

type RouteTarget = Pick<Model<''>, 'provider' | 'id'>

const ROUTER_SYSTEM_PROMPT = `You are a routing classifier for a coding assistant.

Task: classify each incoming user prompt into exactly one routing level based on complexity, scope, and reasoning depth.

Return JSON only, with no markdown, no prose, no code fences, and no extra keys:
{"prediction":"low"}
or
{"prediction":"medium"}
or
{"prediction":"high"}

Routing levels:
- low: simple request, basic question, straightforward tool-style action, short lookup, simple transformation, or anything that needs little to no reasoning.
- medium: limited coding task, small implementation, localized bug fix, or narrow technical request that needs some reasoning but stays contained.
- high: complex request, audit, deep reasoning, multi-step planning, architecture, debugging with uncertainty, multi-file work, refactor, migration, or anything broad / ambiguous.

Rules:
- Prefer medium when uncertain.
- Any request likely touching multiple files or requiring coordination across components must be high.
- Small code generation or single-file implementation is usually medium.
- Simple questions, tool invocations only, command explanations, summaries, or mechanical edits are usually low.
- User prompt may be in any language. Classify intent, not language.

Output exactly one JSON object with one key named "prediction".`

type PredictionResponse = {
  prediction: RouteLevel
}

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

async function predictRouteLevel(
  ctx: ExtensionContext,
  prompt: string,
  baseUrl: string,
  model: RouteTarget['id'],
  hasImages: boolean,
  signal: AbortSignal | undefined
): Promise<RouteLevel | null> {
  try {
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer lm-studio',
      },
      body: JSON.stringify({
        model,
        max_tokens: 32,
        messages: [
          { role: 'system', content: ROUTER_SYSTEM_PROMPT },
          {
            role: 'user',
            content: JSON.stringify({
              prompt,
              hasImages,
            }),
          },
        ],
      }),
      signal,
    })

    if (!response.ok) {
      const errorText = await response.text()
      ctx.ui.notify(
        `Router API error: ${response.status} ${response.statusText} - ${errorText}`,
        'error'
      )
      return null
    }

    const payload = (await response.json()) as ChatCompletionResponse

    ctx.ui.notify(`Router response: ${JSON.stringify(payload)}`, 'info')

    const parsed = JSON.parse(payload.choices?.[0]?.message?.content ?? '') as PredictionResponse

    return parsed.prediction
  } catch (err) {
    ctx.ui.notify(`Failed to predict route level: ${err}`, 'error')
    return null
  }
}

async function setTargetModel(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  target: RouteTarget,
  level: RouteLevel
): Promise<void> {
  const current = ctx.model
  if (current?.provider === target.provider && current.id === target.id) {
    if (ctx.hasUI) {
      ctx.ui.setWidget(STATUS_KEY, [`routing:${level} -> ${target.provider}/${target.id}`])
    }
    return
  }

  const model = ctx.modelRegistry.find(target.provider, target.id)
  if (!model) {
    if (ctx.hasUI) {
      ctx.ui.notify(`Routing target missing: ${target.provider}/${target.id}`, 'warning')
      ctx.ui.notify(
        `Available models: ${ctx.modelRegistry
          .getAll()
          .filter(m => m.provider === target.provider)
          .map(m => `${m.provider}/${m.id}`)
          .join(', ')}`,
        'warning'
      )
    }
    return
  }

  const success = await pi.setModel(model)

  if (ctx.hasUI) {
    if (!success) {
      ctx.ui.notify(`Routing target unavailable: ${target.provider}/${target.id}`, 'warning')
    } else {
      ctx.ui.setWidget(STATUS_KEY, [`routing:${level} -> ${target.provider}/${target.id}`])
    }
  }
}

export default async function (pi: ExtensionAPI) {
  const baseUrl = 'http://127.0.0.1:1234'
  const lowTarget: RouteTarget = { provider: 'lmstudio', id: 'qwen3-0.6b' }
  const mediumTarget: RouteTarget = { provider: 'github-copilot', id: 'claude-haiku-4.5' }
  const highTarget: RouteTarget = { provider: 'github-copilot', id: 'gpt-5.4' }

  function getTargetModel(level: RouteLevel): RouteTarget {
    if (level === 'low') return lowTarget
    if (level === 'medium') return mediumTarget
    return highTarget
  }

  pi.on('session_start', async (_event, ctx) => {
    if (!ctx.hasUI) return

    ctx.ui.setWidget(STATUS_KEY, [
      `routing auto | low=${lowTarget.provider}/${lowTarget.id} | medium=${mediumTarget.provider}/${mediumTarget.id} | high=${highTarget.provider}/${highTarget.id}`,
    ])
  })

  pi.on('before_agent_start', async (event, ctx) => {
    const prompt = event.prompt.trim()
    if (!prompt) return

    const level = await predictRouteLevel(
      ctx,
      prompt,
      baseUrl,
      lowTarget.id,
      !!event.images?.length,
      ctx.signal
    )

    if (!level) {
      if (ctx.hasUI) {
        ctx.ui.notify('Failed to predict route level, using default model', 'warning')
      }
      return
    }

    await setTargetModel(pi, ctx, getTargetModel(level), level)
  })
}
