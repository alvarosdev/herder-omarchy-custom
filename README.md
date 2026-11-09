# Custom Omarchy for Herdr App

A personal fork of [Omarchy for Herdr](https://github.com/shafiqimtiaz/herdr-omarchy), retaining its square panels, color themes and controls with these changes:

- A solid theme-colored background; changing themes does not restore a wallpaper.
- Terminal and interface fonts follow Herdr settings instead of being fixed by the layout.
- The sidebar groups agent sessions by repository or folder. Groups can be folded and sessions selected by title.
- A sidebar card shows Codex weekly and Claude 5-hour and weekly usage as terminal-style bars, plus the DeepSeek account balance. Click the heading to refresh; otherwise it refreshes every five minutes.

## Install

Install Herdr App first. The usage card uses the included Omarchy provider code and signed-in Codex and Claude accounts; no separate usage mod is required. Claude credentials are read from the default profile or its macOS Keychain entry. Codex uses its local ChatGPT login.

Ask an agent in Herdr to read `~/.config/herdr-app/AGENTS.md` and install the layout, mods, themes and layout-specific bindings from this repository. Existing Herdr settings and other layouts should be preserved. Select the Omarchy layout in Herdr Settings. The layout uses Herdr's built-in provider icons and inherits your chosen fonts.

DeepSeek uses `DEEPSEEK_API_KEY` or, on macOS, the Keychain item `herdr-deepseek-api-key`. Credentials and usage data are never included in this repository. The DeepSeek balance is an amount rather than a percentage. An unavailable usage reading appears as a dash; hover over the card heading for details.

## Development

The original [development guide](DEVELOPMENT.md) describes the upstream layout and modules; some wallpaper and usage details refer to upstream behavior. Check changed mods with `herdr-app check mods/<name>`. The included wallpaper assets and original modules are retained for upstream compatibility, but the custom layout does not display wallpapers.

This fork retains the upstream licenses and attribution. The custom tree and bar are derived from the upstream modules.
