export const APP_TUTORIAL_SEEN_KEY = 'kuaiji_app_tutorial_seen'

export function isAppTutorialSeen(): boolean {
  try {
    return localStorage.getItem(APP_TUTORIAL_SEEN_KEY) === '1'
  } catch {
    return false
  }
}

export function markAppTutorialSeen(): void {
  try {
    localStorage.setItem(APP_TUTORIAL_SEEN_KEY, '1')
  } catch {
    /* ignore */
  }
}

let tutorialOpenHandler: (() => void) | null = null

export function registerAppTutorialOpenHandler(handler: (() => void) | null): void {
  tutorialOpenHandler = handler
}

export function openAppTutorial(): void {
  tutorialOpenHandler?.()
}
