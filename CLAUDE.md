# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Keystorm: a zero-dependency browser typing trainer (plain HTML/CSS/JS). There is no build, package manager, linter or test suite.

## Running

- Open `index.html` directly in a browser, or serve the folder: `python3 -m http.server 8765` (also defined as the `keystorm` config in `.claude/launch.json` for the preview pane).
- The preview pane's `file://` mode renders a static snapshot that does not load the relative JS/CSS, so use the HTTP server when previewing.
- To test without typing by hand, dispatch events from the page console: `document.dispatchEvent(new KeyboardEvent('keydown', {key: 'a'}))`. Jump to a screen with `KS.go('training' | 'arcade' | 'sprint' | 'progress' | 'settings' | 'menu')`.
- Saved progress lives in `localStorage` under `keystorm.v1`; clear it with `localStorage.removeItem('keystorm.v1')` (or Settings → Reset).

## Architecture

- **No ES modules on purpose**: scripts are classic `<script>` tags so the game works from `file://`. Everything hangs off the global `window.KS` namespace, and **load order in `index.html` matters**: `fx.js` → `stats.js` → `words.js` → `main.js` → `modes/*.js`, then `KS.init()`. `main.js` defines the global `$`/`$$` helpers that the mode files use at load time.
- **Routing**: every screen is a `<section class="screen">` in `index.html`; `KS.go(id)` toggles `.active`. If `KS.modes[id]` exists, it becomes `KS.active`; `go()` calls the previous mode's `stop()` and the new mode's `start()`. Each mode file is an IIFE that returns `{ start, stop, onKey }` and registers itself on `KS.modes`.
- **Input**: one global `keydown` listener in `KS.init` (`main.js`) forwards keys to `KS.active.onKey(e)`, calling `preventDefault` on space, `'`, `/`, Backspace and Tab. Keys pressed on non-mode screens (results/settings/progress) are handled in that same listener.
- **`KS.TypingEngine`** (`main.js`) is the shared text-typing core used by Training and Sprint. It handles per-character state, stop-on-error versus free-typing with Backspace, combos, WPM/accuracy, and the round's per-key `hits`/`misses`. It also calls `KS.Stats.recordKey` for every keystroke. Word Rain (`modes/arcade.js`) does **not** use it: it has its own canvas game loop and lock-on targeting, and calls `recordKey` itself.
- **`KS.Stats`** (`stats.js`) is the single owner of persisted data. Its main parts:
  - Per-key exponential moving averages of speed and accuracy drive `keyProgress`, `isMastered`, `focusKey` and `checkUnlock` (the Training key-unlock order is `ORDER`).
  - `finishRound(r)` is the one place that awards XP, updates streaks and daily time, records personal bests (via `r.bestKey`/`r.bestValue`) and checks `ACHIEVEMENTS`.
  - Call `finishRound` exactly once per round. `KS.showResults(r)` calls it for you; Training calls it directly because it shows an inline "lesson done" panel instead of the results screen.
- **`KS.Words`** (`words.js`) generates all text. Training text is adaptive: it mixes real words built only from unlocked letters with pseudo-words weighted toward the focus key and weak keys (using `KS.Stats.keyProgress`).
- **`KS.FX`** (`fx.js`) owns the full-screen particle canvas (`#fx`, viewport coordinates), floating text, toasts, the level-up overlay and Web Audio sounds (`KS.FX.sfx.*`, generated in code, gated by `settings.sound`).
- **`KS.Keyboard(container)`** builds the on-screen keyboard with finger colours (`FINGER` map → CSS vars `--f-*`); its `next`, `press`, `lock` and `heat` methods are reused by Training, Sprint and the results heatmap.

## Conventions

- Colours and theme are CSS custom properties on `:root` in `styles.css`. The game is dark-only by design.
- Settings live in `KS.Stats.data.settings` (`sound`, `hints`, `stopOnError`, `target` WPM, `goal` minutes). New settings need a default in `defaults()` in `stats.js`; `load()` merges saved settings over the defaults, so old saves pick up new keys.
