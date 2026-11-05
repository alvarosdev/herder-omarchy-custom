# Omarchy for Herdr

A layout for the [Herdr](https://herdr.dev) app that looks like the [Omarchy](https://github.com/basecamp/omarchy) desktop: flat, square, bordered tiles floating over a wallpaper. A thin top bar shows your spaces, live AI usage for the agents on screen and the window buttons. The sidebar lists spaces and agents with their status, resizes, and folds into an icon rail. A side panel browses files and Git changes, commits, pushes and switches branches. The palette, Settings and a mod manager match the look, and every Omarchy color theme comes with it.

![Omarchy](preview.png)

The repo is laid out like a Herdr home: `layouts/`, `mods/`, `themes/`, `backgrounds/` and `keys.json`. [`RECIPE.md`](RECIPE.md) is the brief an agent can rebuild it from. See [`DEVELOPMENT.md`](DEVELOPMENT.md) for the code map and verification commands.

To install, ask your agent: "Read `~/.config/herdr-app/AGENTS.md`, then add the layout from github.com/shafiqimtiaz/herdr-omarchy." Then switch to it with `ctrl-shift-l`.
