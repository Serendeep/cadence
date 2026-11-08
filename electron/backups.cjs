const fs = require('node:fs')
const path = require('node:path')

const KEEP = 7
const NAME = /^cadence-backup-\d{4}-\d{2}-\d{2}\.json$/
// far above any real history; stops a runaway renderer filling the disk
const MAX_CHARS = 512 * 1024 * 1024

/** The backup files to delete so only the newest `keep` remain; names sort by their date. */
function toPrune(names, keep = KEEP) {
  return names.filter((n) => NAME.test(n)).sort().reverse().slice(keep)
}

function isBackup(json) {
  if (typeof json !== 'string' || json.length > MAX_CHARS) return false
  try {
    const data = JSON.parse(json)
    return data?.app === 'better-cstimer' && Array.isArray(data.sessions) && Array.isArray(data.solves)
  } catch {
    return false
  }
}

function localDay(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Writes today's backup into `dir` and drops the oldest past seven. Returns false for a payload that is not a backup. */
function saveBackup(dir, json) {
  if (!isBackup(json)) return false
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `cadence-backup-${localDay()}.json`)
  // write then rename, so a crash mid-write never leaves a broken file in place of a good one
  fs.writeFileSync(`${file}.tmp`, json)
  fs.renameSync(`${file}.tmp`, file)
  for (const name of toPrune(fs.readdirSync(dir))) fs.rmSync(path.join(dir, name), { force: true })
  return true
}

module.exports = { toPrune, isBackup, saveBackup }
