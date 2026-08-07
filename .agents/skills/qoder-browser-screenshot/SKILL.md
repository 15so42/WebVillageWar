---
name: qoder-browser-screenshot
description: >-
  Troubleshoot Qoder built-in browser (browser-use MCP) screenshot failures.
  Use when take_screenshot times out or fails while other browser-use tools
  (take_snapshot, evaluate_script, navigate_page, click) still work, or when
  capturing game/webpage screenshots through the Qoder browser returns
  "Tool execution timeout after 15000ms". Root cause is the Qoder sidebar
  being closed: the built-in browser tab goes hidden (visibilityState=hidden),
  Chromium pauses the compositor, and CDP Page.captureScreenshot hangs until
  timeout. Fix: open the Qoder sidebar so the built-in browser is visible.
---

# Qoder Browser Screenshot Troubleshooting

## Symptoms

- `take_screenshot` (browser-use MCP) fails with
  `Tool 'take_screenshot' execution timeout after 15000ms`.
- Other browser tools work fine: `take_snapshot`, `evaluate_script`,
  `navigate_page`, `click`, `list_pages`, `list_console_messages`.
- Failure is independent of page content: even `about:blank` times out.
- In `qoder.log` the call shows `duration` around 15.3s (server side hangs
  until the client timeout), while working calls take 0.3–3s.

## Root Cause

The browser-use MCP server controls the **Qoder built-in browser**, which
lives inside the Qoder **sidebar panel** — not the user's system browser
(Edge/Chrome).

When the sidebar is closed:

1. The built-in browser tab becomes a background tab →
   `document.visibilityState === "hidden"`.
2. Chromium pauses the compositor for hidden tabs (no frames produced).
3. `take_screenshot` → CDP `Page.captureScreenshot` waits for a capturable
   frame → hangs → 15s timeout.
4. DOM-based tools (snapshot/evaluate/click) don't need the compositor →
   keep working, which makes the failure look like a broken screenshot tool.

Activating system windows (Edge, IDE window) does NOT help — the browser is
inside the sidebar, not a separate OS window.

## Diagnosis

Run this through `evaluate_script` on the target page:

```js
() => ({ visibilityState: document.visibilityState, hidden: document.hidden })
```

- `"hidden"` → sidebar/browser not visible → this is the failure mode.
- `"visible"` → screenshot should work; look elsewhere (page crash, huge
  page, MCP server restart).

Confirm with logs (Windows):

```powershell
Select-String -Path "$env:APPDATA\QoderCN\SharedClientCache\logs\qoder.log" -Pattern "take_screenshot" | Select-Object -Last 10
```

## Fix

**Open the Qoder sidebar** so the built-in browser panel is visible.
Re-check `visibilityState` — it flips to `"visible"` immediately, and
`take_screenshot` starts working again (no browser restart needed).

## Workflow

1. Screenshot fails → run the `evaluate_script` visibility check first.
2. If `hidden`:
   - Ask the user to open the Qoder sidebar (or note it must stay open).
   - Re-verify `visibilityState === "visible"`.
   - Retry `take_screenshot`.
3. If `visible` but still failing:
   - Test on `about:blank` to rule out page content.
   - Check `qoder.log` for the call duration and MCP server health.
   - Consider restarting the MCP server / Qoder.

## Fallback: Screenshot Without the Sidebar

If the sidebar can't stay open, capture pixels in-page instead of using
`take_screenshot`:

- Many Three.js projects expose debug handles (e.g. this project exposes
  `window.__VILLAGE_WAR_DEBUG__.game` with `renderer/scene/camera`).
- In one synchronous `evaluate_script` call: render one frame, then
  immediately `canvas.toDataURL('image/png')` and return the base64.
- Caveat: `preserveDrawingBuffer: false` clears the buffer after present;
  the render+toDataURL must happen inside the same synchronous task.
- Base64 round-trips fine through `evaluate_script` JSON responses; save the
  decoded PNG from the returned data.

## Notes

- Do NOT waste time activating OS windows or searching for
  `--remote-debugging-port` — the built-in browser is an Electron/Qoder
  embedded WebContents without an external debug port.
- `visibilityState` is the single most useful check; it takes one
  `evaluate_script` call to confirm or rule out this root cause.
