# Working on Omarchy

Each folder under `mods/` is a self-contained Herdr mod. `main.js` is its entry point. Keep helper imports within that folder so the mod can be installed independently. Herdr runs the UI with `gpui-kit`, `gpui-base`, and `herdr`; Node APIs are available only in tests.

## Where to make changes

| Change | File |
| --- | --- |
| Layout, tile sizes, spacing | `layouts/omarchy.json` |
| Theme colors | `themes/*.json` |
| Theme wallpapers | `backgrounds/omarchy/<theme>/` |
| Wallpaper follows theme, next-wallpaper key | `mods/omarchy-bar/main.js` |
| Theme picker | `mods/omarchy-themes/main.js` |
| Commit graph table, header, Manygit list | `mods/omarchy-git-graph/graph.js` |
| Git commands, parsing, menus, dialogs | `mods/omarchy-git-graph/git.js` |
| Settings state, persistence, machine actions | `mods/omarchy-settings/main.js` |
| Layout, theme, appearance, font pickers | `mods/omarchy-settings/look.js` |
| Settings buttons, rows, toggles, steppers | `mods/omarchy-settings/controls.js` |
| Usage endpoints, credentials, agent/provider routing | `mods/omarchy-ai-usage/providers.js` |
| Usage countdowns and quota-window timing | `mods/omarchy-ai-usage/time.js` |
| Usage display, refresh scheduling, cached results | `mods/omarchy-ai-usage/main.js` |
| Mod installation, updates, removal | `mods/omarchy-mod-manager/core.js` |
| Mod Manager text contrast and colors | `mods/omarchy-mod-manager/palette.js` |
| Mod Manager navigation and display | `mods/omarchy-mod-manager/main.js` |

## Check changes

From the repo root, run `npm test`. Tests use Node's built-in runner with no installation step. Provider tests use fake login files and HTTP responses.

From the repo root, check each changed mod, for example:

```sh
herdr-app check mods/omarchy-settings
herdr-app check mods/omarchy-ai-usage
herdr-app check mods/omarchy-mod-manager
```

`check` loads the entry point, helper imports, and initial UI. It does not exercise later clicks or asynchronous states. When changing UI behavior, also exercise the affected picker, panel, or dialog in Herdr. Repo edits and installed copies under `~/.config/herdr-app` are separate unless explicitly linked.
