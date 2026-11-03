import { randomScrambleForEvent } from 'cubing/scramble'

const queues = new Map<string, Promise<string>>()

async function generate(event: string): Promise<string> {
  const alg = await randomScrambleForEvent(event)
  return alg.toString()
}

/** Returns a scramble for the event and starts generating the next one in the background. */
export function nextScramble(event: string): Promise<string> {
  const ready = queues.get(event) ?? generate(event)
  const upcoming = generate(event)
  upcoming.catch(() => queues.delete(event))
  queues.set(event, upcoming)
  return ready
}
