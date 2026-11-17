export function insertDictationText(base: string, transcript: string, start = base.length, end = start): { text: string; caret: number } {
  const from = Math.max(0, Math.min(base.length, Number.isFinite(start) ? Math.trunc(start) : base.length))
  const to = Math.max(from, Math.min(base.length, Number.isFinite(end) ? Math.trunc(end) : from))
  const spoken = transcript.trim()
  if (!spoken) return { text: base, caret: from }
  const prefix = base.slice(0, from)
  const suffix = base.slice(to)
  const left = prefix && !/\s$/.test(prefix) && !/^[,.;:!?)]/.test(spoken) ? ' ' : ''
  const right = suffix && !/^\s|^[,.;:!?)]/.test(suffix) ? ' ' : ''
  return { text: `${prefix}${left}${spoken}${right}${suffix}`, caret: prefix.length + left.length + spoken.length + right.length }
}
