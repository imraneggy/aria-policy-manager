/**
 * shortcuts.ts — Keyboard shortcut registry.
 *
 * Shortcuts:
 *   Ctrl+1 → Policy Advisor
 *   Ctrl+2 → Policy Generator
 *   Ctrl+3 → Security Settings
 *   Ctrl+K → Focus search (when sidebar policy search is visible)
 *   Escape → Clear focus
 */

type ShortcutHandler = () => void;

interface Shortcut {
  key: string;
  ctrl?: boolean;
  description: string;
  handler: ShortcutHandler;
}

const shortcuts: Shortcut[] = [];

export function registerShortcut(shortcut: Shortcut): () => void {
  shortcuts.push(shortcut);
  return () => {
    const idx = shortcuts.indexOf(shortcut);
    if (idx >= 0) shortcuts.splice(idx, 1);
  };
}

export function handleGlobalKeydown(e: KeyboardEvent): void {
  // Don't trigger shortcuts when typing in inputs
  const target = e.target as HTMLElement;
  if (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable
  ) {
    // Allow Escape to blur inputs
    if (e.key === "Escape") {
      target.blur();
    }
    return;
  }

  for (const s of shortcuts) {
    const ctrlMatch = s.ctrl ? (e.ctrlKey || e.metaKey) : true;
    if (e.key === s.key && ctrlMatch) {
      e.preventDefault();
      s.handler();
      return;
    }
  }
}

export function getRegisteredShortcuts(): { key: string; description: string }[] {
  return shortcuts.map((s) => ({
    key: s.ctrl ? `Ctrl+${s.key}` : s.key,
    description: s.description,
  }));
}
