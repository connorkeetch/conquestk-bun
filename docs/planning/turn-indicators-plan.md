# Turn Indicators Brainstorm

## Goals
- Make it unmistakable when it is the player's turn regardless of where they are in the app (map view, chat, rules, etc.).
- Keep cues accessible: support colorblind players, screen readers, and low-vision users.
- Avoid disruptive patterns that could slow down fast-paced play or annoy players after repeated exposure.

## Layered notification strategy
Use multiple cues that scale with urgency so the turn handoff is clear without overwhelming the UI.

1. **Primary toast modal**
   - Full-width toast anchored to the top center that slides in with "It’s your turn" copy, action button ("Start Turn"), and countdown timer.
   - Color and icon match the player’s seat color; fallback to high-contrast palette.
   - Auto-dismiss once the player interacts with the board or after a few seconds, but keep a minimized reminder.
   - Provide `aria-live="assertive"` so screen readers announce the change immediately.

2. **Persistent banner strip**
   - Game Room header gains a glowing underline or background shift using the player color.
   - Include turn status text ("Your turn • 45s remaining") and quick actions ("Center on capital", "Show objectives").
   - Animate gently (pulse or shimmer) while it is the player’s turn, halt animation when it is not.

3. **Board-level focus cues**
   - Dim the map slightly and highlight interactive territories with a soft vignette when the turn starts.
   - Add a subtle sweeping highlight around the player’s troops/capital.
   - For touch users, show a floating "Tap to begin" button near the center; on desktop, a keyboard shortcut tooltip ("Press Space to start").

4. **Avatar + chat integrations**
   - Player avatar in the sidebar pulses or gains a glowing ring.
   - Chat input placeholder switches to "It’s your turn—take your move!" so players glancing at chat are reminded.
   - Optionally pin a system message in the activity log each time turn control passes.

5. **Audio & haptics (optional settings)**
   - Short celebratory chime with per-user volume toggle.
   - For mobile or desktop apps with vibration support, send a quick haptic tap.

## Edge-case considerations
- **Background tab / minimized window:** trigger browser notification (with permission) and ensure the toast persists until acknowledged.
- **Spectator mode:** convert the banner to "Waiting for <Player>" without the interactive actions.
- **Simultaneous turns / blitz modes:** display "You can act now" with overlapping player colors, and show turn order in the banner.
- **Accessibility:** provide a settings toggle to disable animations and choose a high-contrast alternative theme.
- **Latency:** confirm the backend emits turn change events reliably; debounce UI cues so they do not flicker on reconnects.

## Next steps
- Validate the visual direction with mockups (Figma) focusing on header banner and toast.
- Prototype the toast + banner combo in the Game Room using existing design tokens.
- Conduct playtests to measure reaction time and annoyance factor; iterate on animation intensity and audio defaults.
- Document configuration flags (audio, haptics, animation) in the player settings panel.
