import { callFunction } from './firebase';

export function logUsage(action: string) {
  try {
    callFunction('logUsage', { action }).catch(e => console.warn('logUsage call failed', e));
  } catch (e) { console.warn('logUsage failed', e); }
}

const loggedActions = new Set<string>();

export function logUsageOnce(action: string) {
  if (loggedActions.has(action)) return;
  loggedActions.add(action);
  logUsage(action);
}
