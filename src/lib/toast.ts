import { useSyncExternalStore } from 'react'

export interface Toast {
  id: number
  message: string
  action?: { label: string; run: () => void }
}

let current: Toast | null = null
let timer = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function toast(message: string, action?: Toast['action'], ms = 5000): void {
  current = { id: Date.now(), message, action }
  window.clearTimeout(timer)
  timer = window.setTimeout(dismissToast, ms)
  emit()
}

export function dismissToast(): void {
  current = null
  emit()
}

export const useToast = () => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => current)
