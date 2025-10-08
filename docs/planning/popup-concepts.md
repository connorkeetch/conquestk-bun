# Pop-up Concepts for Key Game Events

These concepts explore tone, copy, and visual behaviour for celebratory or commiserative pop-ups across the Risk-inspired game experience. They lean slightly cheeky without undercutting competitive intensity.

## 1. You Are Eliminated

### Working Title
**"So Close…" Modal**

### Narrative Hook
A playful acknowledgement of the player's effort paired with a gentle nudge to rejoin the fray. The modal should feel like a short, witty obituary for the player's campaign.

### Suggested Copy Variations
- **Hero line:** "Your empire has crumbled. Time to plot the comeback."  
  **Subtext:** "Spectate the chaos or queue up a rematch—your rivals are already bragging."
- **Hero line:** "Bankrupt of armies, rich in stories."  
  **Subtext:** "Share your war tales in chat while we line up your next invasion." 
- **Hero line:** "Defeat, but make it dramatic."  
  **Subtext:** "Highlight reel saved. Ready to avenge that betrayal?"

### Visual Treatment
- **Layout:** Centered modal with a torn parchment backdrop hinting at a fallen battle report.
- **Imagery:** Stylised flag lowering animation or an animated candle snuffing out.
- **Accent colors:** Warm ambers fading into cool blues to transition from battle heat to calm reflection.
- **Buttons:** Primary CTA "Play Again" (solid accent), secondary "Stay and Spectate" (ghost), tertiary text link "Share Battle Recap".

### Delight Moments
- Confetti animation that briefly flares in reverse (sucking inward) before disappearing.
- Tooltip offering a random strategic tip sourced from post-game analytics.

## 2. Another Player Is Eliminated

### Working Title
**"Farewell Flyout" Toast**

### Narrative Hook
A small banner that slides in near the leaderboard to celebrate the elimination with a wink, without stealing focus from ongoing gameplay.

### Suggested Copy Variations
- "⚔️  **K.O.!** {PlayerName} just exited stage left."
- "{PlayerName} has logged off… permanently (this match)."
- "Three players remain. {PlayerName}'s armies turned to dust."

### Visual Treatment
- **Layout:** Slim toast (max 280px wide) sliding from the side closest to the eliminated player's seat in the UI.
- **Imagery:** Minimal—use a monochrome icon (faded banner, cracked shield) to keep attention on the board.
- **Accent colors:** Match the eliminated player's color but desaturated to 40% opacity, paired with neutral background.
- **Dismissal:** Auto-dismiss after 4 seconds with gentle fade; hover pauses the timer.

### Delight Moments
- Optional "Send Farewell" button that drops a quick emote in global chat.
- Progress ring subtly updates to show "Players Remaining" count.

## 3. Rank Change (Gain or Loss)

### Working Title
**"Rank Rumble" Celebration Card**

### Narrative Hook
Gamified recognition that either hypes up the promotion or cheekily ribs the demotion while offering quick actions (share, review stats, queue again).

### Suggested Copy Variations
**Rank Up**
- "You climbed to **Commander II**. The map just got smaller for everyone else."
- "Fresh stripes earned! Say hello to **General Bronze**."
- "Promotion unlocked. Your rivals are checking your stats right now."

**Rank Down**
- "You slid to **Lieutenant III**. Time to rewrite the battle plan."
- "Demotion noted—treat it as reconnaissance intel."
- "Rank drop detected. Queue up revenge?"

### Visual Treatment
- **Layout:** Card emerging from bottom center, scaling up with a spring animation and resting near the player's avatar module.
- **Imagery:** Dynamic badge showcasing the new rank emblem, with shimmer animation for promotions and a gentle crack animation for demotions.
- **Accent colors:** Promotions lean into vibrant greens and golds; demotions pivot to deep purples and charcoals.
- **Buttons:** "Share Victory" (for rank up) or "Review Match" (for rank down) as primary CTA. Secondary CTA "Queue Next Game" appears in both states.

### Delight Moments
- Trigger a brief sound cue (optional mute respect) using a celebratory horn for promotions or a muttered drum roll for demotions.
- Include a "Streak" meter showing momentum change: upward arrows for streaks, dotted line for recovery mode.

## Implementation Notes
- Localize copy with placeholders (`{PlayerName}`, `{RankName}`) to keep translations flexible.
- Respect reduced-motion preferences by offering alternate fade-only transitions.
- Log pop-up interactions to analytics: how often players spectate, rematch, share, or review stats.
- Ensure pop-ups never block primary gameplay inputs; modals should pause turn timers automatically while displayed.
