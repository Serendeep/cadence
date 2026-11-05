export interface PuzzleEvent {
  id: string
  name: string
  short: string
  /** Events whose scramble can be shown on the 3x3 net and tracked on a smart cube */
  is3x3: boolean
}

export const EVENTS: PuzzleEvent[] = [
  { id: '333', name: '3x3x3', short: '3x3', is3x3: true },
  { id: '222', name: '2x2x2', short: '2x2', is3x3: false },
  { id: '444', name: '4x4x4', short: '4x4', is3x3: false },
  { id: '555', name: '5x5x5', short: '5x5', is3x3: false },
  { id: '666', name: '6x6x6', short: '6x6', is3x3: false },
  { id: '777', name: '7x7x7', short: '7x7', is3x3: false },
  { id: '333oh', name: '3x3x3 One-Handed', short: 'OH', is3x3: true },
  { id: '333bf', name: '3x3x3 Blindfolded', short: '3BLD', is3x3: true },
  { id: '333fm', name: '3x3x3 Fewest Moves', short: 'FMC', is3x3: true },
  { id: 'pyram', name: 'Pyraminx', short: 'Pyra', is3x3: false },
  { id: 'skewb', name: 'Skewb', short: 'Skewb', is3x3: false },
  { id: 'minx', name: 'Megaminx', short: 'Mega', is3x3: false },
  { id: 'sq1', name: 'Square-1', short: 'Sq-1', is3x3: false },
  { id: 'clock', name: 'Clock', short: 'Clock', is3x3: false },
  { id: '444bf', name: '4x4x4 Blindfolded', short: '4BLD', is3x3: false },
  { id: '555bf', name: '5x5x5 Blindfolded', short: '5BLD', is3x3: false },
]

/** WCA blindfolded events have no inspection. */
export const isBlind = (id: string): boolean => id.endsWith('bf')

export const eventById = (id: string): PuzzleEvent => EVENTS.find((e) => e.id === id) ?? EVENTS[0]

// cubing.js puzzle ids for the 3D view; events missing here have no 3D model
const TWISTY_PUZZLE: Record<string, string> = {
  '222': '2x2x2', '333': '3x3x3', '333oh': '3x3x3', '333bf': '3x3x3', '333fm': '3x3x3', '444': '4x4x4', '555': '5x5x5',
  '666': '6x6x6', '777': '7x7x7', pyram: 'pyraminx', skewb: 'skewb', minx: 'megaminx', sq1: 'square1', clock: 'clock',
  '444bf': '4x4x4', '555bf': '5x5x5',
}

export const twistySupports = (event: string): boolean => event in TWISTY_PUZZLE
export const twistyPuzzle = (event: string): string => TWISTY_PUZZLE[event] ?? '3x3x3'
