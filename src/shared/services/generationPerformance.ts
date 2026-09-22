export type GenerationTiming = { task: string; variant: string; stage: string; elapsedMs: number }
const timings: GenerationTiming[] = []
export function generationTimer(task: string, variant: string) {
  const started = performance.now()
  return (stage: string) => {
    const entry = { task, variant, stage, elapsedMs: Math.round(performance.now() - started) }
    timings.push(entry)
    if (timings.length > 500) timings.shift()
    return entry
  }
}
export function getGenerationTimings() { return timings.map((entry) => ({ ...entry })) }
export function clearGenerationTimings() { timings.length = 0 }
/** Local A/B switch; no prompts, keys or private trip data enter timings. */
export function fastGenerationEnabled() { return import.meta.env.VITE_GENERATION_VARIANT !== 'baseline' }
