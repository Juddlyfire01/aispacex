import { downloadText } from '../download-text'
import { postUrl, profileUrl } from './evidence'
import { labelForSchemaField, stripMarkdownLabel } from './synthesize'
import type { IntelReportSnapshot, Post, Profile } from './types'

export { downloadText }

export type ReportExportContext = {
  username: string
  profile?: Profile | null
  posts?: Post[]
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

function formatDateRange(range: { from: string; to: string } | null): string {
  if (!range) return 'n/a'
  return `${new Date(range.from).toLocaleDateString()}–${new Date(range.to).toLocaleDateString()}`
}

export function reportFilename(username: string, createdAt: string, ext: 'md' | 'json'): string {
  const slug = username.replace(/^@/, '').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase() || 'report'
  const d = new Date(createdAt).toISOString().slice(0, 10)
  return `intel-report-${slug}-${d}.${ext}`
}

function pushSection(lines: string[], title: string, body: string | null | undefined) {
  const clean = stripMarkdownLabel(body ?? '')
  if (!clean) return
  lines.push(`## ${title}`, '', clean, '')
}

function pushList(lines: string[], title: string, items: string[]) {
  if (items.length === 0) return
  lines.push(`### ${title}`, '', ...items.map((item) => `- ${item}`), '')
}

export function reportToMarkdown(snapshot: IntelReportSnapshot, ctx: ReportExportContext): string {
  const { username, profile, posts = [] } = ctx
  const handle = username.replace(/^@/, '')
  const a = snapshot.analytics
  const n = snapshot.narrative
  const f = a.fundamentals
  const e = a.engagement
  const c = a.composition
  const lines: string[] = []

  lines.push(`# Intelligence report — @${handle}`)
  lines.push('')
  if (profile) {
    lines.push(`**${profile.displayName}** · [x.com/${handle}](${profileUrl(handle)})`)
    if (profile.bio) lines.push('', profile.bio)
    lines.push('')
  }
  lines.push(`_Generated: ${new Date(snapshot.createdAt).toISOString()} · Model: ${snapshot.model} · Report id: ${snapshot.id}_`)
  lines.push(`_Posts analyzed: ${snapshot.meta.postCount} · Span: ${formatDateRange(snapshot.meta.dateRange)}_`)
  if (snapshot.meta.tokenCost > 0) {
    const tokenDetail =
      snapshot.meta.promptTokens != null && snapshot.meta.completionTokens != null
        ? ` (${snapshot.meta.promptTokens.toLocaleString()} in · ${snapshot.meta.completionTokens.toLocaleString()} out)`
        : ''
    lines.push(`_Tokens: ${snapshot.meta.tokenCost.toLocaleString()}${tokenDetail}_`)
  }
  if ((snapshot.meta.includedReportIds?.length ?? 0) > 0) {
    lines.push(`_Built on ${snapshot.meta.includedReportIds!.length} prior report(s)_`)
  }
  lines.push('')

  const change = snapshot.changeSummary
  if (change) {
    lines.push('## What changed since last report', '')
    const ownAdded = change.volumeAddedOwn ?? change.volumeAdded
    const inboundAdded = change.volumeAddedInbound ?? 0
    const volumeLabel = inboundAdded > 0 && ownAdded !== change.volumeAdded
      ? `+${ownAdded} authored · +${inboundAdded} mentions gathered`
      : inboundAdded > 0 && ownAdded === 0
        ? `+${inboundAdded} mentions gathered`
        : `+${change.volumeAdded} authored`
    lines.push(volumeLabel)
    if (change.narrative) {
      lines.push('', stripMarkdownLabel(change.narrative))
    }
    const shifts = change.metricShifts.filter((m) => Math.abs(m.deltaPct) >= 1)
    if (shifts.length > 0) {
      lines.push('', ...shifts.map((m) => `- ${labelForSchemaField(m.metric)}: ${m.deltaPct > 0 ? '+' : ''}${m.deltaPct}%`))
    }
    if (change.emergingTopics.length > 0) {
      lines.push('', `Emerging: ${change.emergingTopics.slice(0, 6).join(', ')}`)
    }
    if (change.fadingTopics.length > 0) {
      lines.push(`Fading: ${change.fadingTopics.slice(0, 6).join(', ')}`)
    }
    const drift = [...change.compositionDrift, ...change.cadenceDrift]
    if (drift.length > 0) lines.push('', drift.join(' · '))
    lines.push('')
  }

  lines.push('## Analytics snapshot', '')
  lines.push('### Fundamentals')
  lines.push(`- Account age: ${f.accountAgeDays}d (${f.lifetimeVelocity}/day lifetime)`)
  lines.push(`- Follow ratio: ${f.followerFollowingRatio}:1 (${f.followRatioLabel})`)
  lines.push(`- Listed: ${f.listed.toLocaleString()}`)
  lines.push(`- Analyzed: ${c.total} posts over ${a.cadence.spanDays}d`)
  lines.push('')
  lines.push('### Engagement')
  lines.push(`- Engagement rate: ${pct(e.engagementRate)} (likes / impressions)`)
  lines.push(`- Bookmark rate: ${pct(e.bookmarkRate)}`)
  lines.push(`- Amplification rate: ${pct(e.amplificationRate)}`)
  lines.push(`- Avg likes: ${e.likes.avg.toFixed(1)} (max ${e.likes.max.toLocaleString()})`)
  lines.push('')
  lines.push('### Composition')
  lines.push(`- ${c.byKindPct.original}% original · ${c.byKindPct.reply}% reply · ${c.byKindPct.quote}% quote · ${c.byKindPct.retweet}% retweet`)
  lines.push(`- ${c.withMediaPct}% media · ${c.withLinkPct}% links`)
  lines.push('')
  lines.push('### Cadence')
  lines.push(`- Pattern: ${a.cadence.pattern}, ${a.cadence.variance} variance`)
  lines.push(`- ${a.cadence.avgPerDay}/day${a.cadence.peakHoursUtc.length > 0 ? ` · peaks ${a.cadence.peakHoursUtc.map((h) => `${h}:00 UTC`).join(', ')}` : ''}`)
  lines.push('')

  pushList(lines, 'Top topics', a.topics.entities.slice(0, 6).map((t) => `${t.label}: ${t.count}`))
  pushList(lines, 'Information diet', a.infoDiet.domains.slice(0, 6).map((t) => `${t.label}: ${t.count}`))
  pushList(lines, 'Most mentioned', a.network.topMentioned.slice(0, 6).map((t) => `@${t.label}: ${t.count}`))
  pushList(lines, 'Most replied to', a.network.topReplied.slice(0, 6).map((t) => `@${t.label}: ${t.count}`))

  pushSection(lines, 'Executive summary', n.executiveSummary)
  pushSection(lines, 'Strategic assessment', n.strategicAssessment)

  if (n.themes.length > 0) {
    lines.push('## Themes', '')
    for (const t of n.themes) {
      lines.push(`### ${t.name}`)
      if (t.evidence) lines.push('', stripMarkdownLabel(t.evidence))
      lines.push('')
    }
  }

  const registerSummary = n.register.summary || n.register.description || ''
  const registerSections = n.register.sections
  const hasRegisterSections =
    registerSections && Object.values(registerSections).some((s) => Boolean(s?.trim()))
  if (registerSummary || n.register.devices.length > 0 || hasRegisterSections) {
    lines.push('## Register', '')
    if (registerSummary) lines.push(stripMarkdownLabel(registerSummary), '')
    const sectionEntries: [string, string | undefined][] = [
      ['Cadence', registerSections?.cadence],
      ['Diction', registerSections?.diction],
      ['Stance', registerSections?.stance],
      ['Rhetoric', registerSections?.rhetoric],
      ['Texture', registerSections?.texture],
      ['Format flex', registerSections?.formatFlex],
      ['Constraints', registerSections?.constraints],
    ]
    for (const [label, body] of sectionEntries) {
      if (!body?.trim()) continue
      lines.push(`### ${label}`, '', stripMarkdownLabel(body), '')
    }
    if (n.register.devices.length > 0) lines.push(`Devices: ${n.register.devices.join(', ')}`, '')
  }

  if (n.narrativeArcs.length > 0) {
    lines.push('## Narrative arcs', '')
    for (const arc of n.narrativeArcs) {
      lines.push(`### ${arc.arc} (${arc.trend})`)
      if (arc.evidence) lines.push('', stripMarkdownLabel(arc.evidence))
      lines.push('')
    }
  }

  pushSection(lines, 'Audience', n.audienceRead)

  if (n.notablePosts.length > 0) {
    lines.push('## Notable posts', '')
    for (const np of n.notablePosts) {
      const post = posts.find((p) => p.id === np.postId)
      const link = `[post](${postUrl(np.postId)})`
      if (post) {
        const excerpt = post.text.slice(0, 140).replace(/\n/g, ' ')
        lines.push(`- ${link}: ${excerpt}${post.text.length > 140 ? '…' : ''} — ${np.why} (${post.metrics.likes}L)`)
      } else {
        lines.push(`- ${link}: ${np.why}`)
      }
    }
    lines.push('')
  }

  pushList(lines, 'Contradictions / tensions', n.contradictions.map(stripMarkdownLabel))
  pushList(lines, 'Engagement hooks', n.engagementHooks.map(stripMarkdownLabel))
  pushList(lines, 'Analyst conclusions', n.analystConclusions.map(stripMarkdownLabel))

  const citedIds = snapshot.meta.postIdsAnalyzed
  if (citedIds.length > 0) {
    lines.push('## Cited posts', '')
    for (const id of citedIds) {
      const post = posts.find((p) => p.id === id)
      if (post) {
        const excerpt = post.text.slice(0, 120).replace(/\n/g, ' ')
        lines.push(`- [${excerpt}${post.text.length > 120 ? '…' : ''}](${postUrl(id)}) (${post.metrics.likes}L)`)
      } else {
        lines.push(`- [post ${id}](${postUrl(id)})`)
      }
    }
    lines.push('')
  }

  lines.push('---', '', '_Exported from Xintel_')
  return lines.join('\n')
}

export function reportToJson(snapshot: IntelReportSnapshot, ctx: ReportExportContext): string {
  const citedIds = new Set(snapshot.meta.postIdsAnalyzed)
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    username: ctx.username.replace(/^@/, ''),
    profile: ctx.profile ?? null,
    snapshot,
    citedPosts: (ctx.posts ?? []).filter((p) => citedIds.has(p.id)),
  }, null, 2)
}

export function downloadReport(snapshot: IntelReportSnapshot, format: 'md' | 'json', ctx: ReportExportContext): void {
  const filename = reportFilename(ctx.username, snapshot.createdAt, format)
  if (format === 'md') {
    downloadText(reportToMarkdown(snapshot, ctx), filename, 'text/markdown')
    return
  }
  downloadText(reportToJson(snapshot, ctx), filename, 'application/json')
}
