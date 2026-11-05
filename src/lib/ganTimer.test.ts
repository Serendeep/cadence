import { expect, test } from 'vitest'
import { parseGanTimer } from './ganTimer'

const view = (bytes: number[]) => new DataView(new Uint8Array(bytes).buffer)

// captured from a GAN-728AC1 through the diagnostics log
const STOPPED_19_619 = [254, 8, 1, 4, 0, 19, 107, 2, 216, 121]
const IDLE = [254, 8, 1, 5, 0, 0, 0, 0, 194, 12]
const FINISHED = [254, 4, 1, 7, 217, 94]

test('reads the final time from a real stop packet, whatever its checksum', () => {
  expect(parseGanTimer(view(STOPPED_19_619))).toEqual({ status: 'stopped', time: 19619 })
  expect(parseGanTimer(view([254, 8, 1, 4, 1, 2, 3, 0, 0, 0]))).toEqual({ status: 'stopped', time: 62003 })
})

test('maps the hand and reset states', () => {
  expect(parseGanTimer(view(IDLE))?.status).toBe('idle')
  expect(parseGanTimer(view([254, 4, 1, 6, 0, 0]))?.status).toBe('both')
  expect(parseGanTimer(view([254, 4, 1, 1, 0, 0]))?.status).toBe('ready')
  expect(parseGanTimer(view([254, 4, 1, 3, 0, 0]))?.status).toBe('running')
})

test('skips the finished state so it cannot overwrite the stop time', () => {
  expect(parseGanTimer(view(FINISHED))).toBeNull()
})

test('rejects packets with the wrong header or length', () => {
  expect(parseGanTimer(view([0, 4, 1, 3, 0, 0]))).toBeNull()
  expect(parseGanTimer(view([254, 9, 1, 4, 0, 19, 107, 2, 216, 121]))).toBeNull()
  expect(parseGanTimer(view([254, 2]))).toBeNull()
})
