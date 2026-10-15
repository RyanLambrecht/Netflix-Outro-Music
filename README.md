# Outro Music for Netflix

A small Chrome/Edge/Brave extension that, while you watch a chosen show on Netflix, mutes the episode when the credits button appears and plays a YouTube or YouTube Music track in the background. When the next episode starts, Netflix is unmuted and the music stops.

Not affiliated with or endorsed by Netflix or YouTube. This is a personal convenience tool.

## Install

1. Download and unzip or clone this repo.
2. Open `chrome://extensions` (or `edge://extensions`) and turn on **Developer mode**.
3. Click **Load unpacked** and select this folder (the one containing `manifest.json`).

## Use

1. Click the extension icon.
2. Paste a **YouTube or YouTube Music link** (video or playlist).
3. Set **Show title contains** (required, for example `steel ball run`). Matching is case-insensitive, and with an empty keyword nothing will trigger.
4. Click **Save**, then watch the show as normal.

Once an episode is at least a minute in and the "Watch Credits" or "Skip Credits" button appears (or the post-play trailer/promo does), Netflix is muted and the track starts. Every Netflix video on the page is kept muted while the music plays, including the trailer that autoplays after the last episode. It stops and Netflix unmutes when the URL changes (next episode, leaving the player) or if you scrub back before the trigger point.

Start the episode by clicking play on the Netflix page yourself. Browsers only allow autoplay after a user interaction, which is why the music plays in a hidden frame inside the Netflix tab instead of a separate tab.

## How it works

- A content script checks the page twice a second for the credits button.
- The show title is looked up through the same metadata endpoint the Netflix page uses, falling back to reading the player's title bar.
- Music plays in a hidden `youtube.com/embed` iframe. `music.youtube.com` links are converted to the regular embed player using the same video or playlist ID. Videos that disable embedding won't play.

## Things to know

- **CSP header is removed.** `rules.json` strips Netflix's `Content-Security-Policy` response header so the music iframe can load. That weakens the page's protections while the extension is installed. If you'd rather not, remove `rules.json` and the `declarativeNetRequest` entries from `manifest.json`, but the music may then be blocked.
- **It can break.** It relies on Netflix's `data-uia` attributes (`watch-credits-seamless-button`, `player-skip-credits`, `video-title`, and a few post-play elements) and an undocumented metadata endpoint. Netflix can change these at any time. If nothing triggers, inspect the credits button, update the selector in `content.js`, or open an issue.
