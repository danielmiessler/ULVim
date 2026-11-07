# Installing ULVim

This file is written for the agent doing the install. The person asked for ULVim; you set it up, prove it works, and tell them what you did. Don't hand them steps you can run yourself, and ask before you delete or move anything of theirs.

## Done looks like

- `nvim` (and `v`, `$EDITOR`, git's editor) is the upstream Neovim release pinned in `neovim.json`, installed under `~/.local/opt/neovim` and reached through `~/.local/bin/nvim`. `shell/ulvim.zsh` puts `~/.local/bin` at the front of PATH, so in a new shell that `nvim` wins over any other one (Homebrew's, say).
- `~/.config/nvim` is a link to the clone, so plain `nvim` runs ULVim. `~/.config/ulvim` is a second link to the same clone, used as a test sandbox (`NVIM_APPNAME=ulvim`).
- `~/.zshrc` sources `shell/ulvim.zsh` once and defines none of its names itself. New shells have:

| Name | Does |
|---|---|
| `v` | `nvim` |
| `vconf` | the config folder in oil |
| `vf` · `vo` (`vs`) · `vk` | edit the plugin list · options · keymaps |
| `vc` · `vd` · `vp` | cd to `lua/ulvim` · `lua` · `lua/ulvim/plugins` |
| `nlp` | cd to the folder holding the installed plugins |
| `fzp`, Ctrl-Space at the prompt | the ranked file finder (`:UlFind`) |

The layer also sets `EDITOR`, `VISUAL` and `MANPAGER` to Neovim.

## Install

Needs macOS on Apple silicon with `git`, `zsh`, `bun`, Homebrew, the tree-sitter CLI 0.26 or newer (`brew install tree-sitter-cli`), and the Xcode Command Line Tools (the C compiler tree-sitter uses to build parsers; `xcode-select --install`). `fd` is optional (`brew install fd`): the file finder's indexer uses it for folders that are not git repos when it is installed, and walks them itself when it is not. The clone can live anywhere; the links point at it, so it has to stay where you put it.

```sh
git clone https://github.com/danielmiessler/ULVim.git ~/ULVim
cd ~/ULVim
bun scripts/install.ts
```

It prints one JSON line listing every step, and exits 0 only when all of them are ok. Rerunning it is safe: a step already done is left alone. `bun scripts/install.ts --check` reports the same steps and changes nothing. If the machine already has a Neovim setup, run the check first and tell the person what is in the way before you install.

## When a step is not ok

Every step that is not ok carries a `next` field with the fix. Apply it, then rerun the install.

| Step | Why it stops | What you do |
|---|---|---|
| `tree-sitter` | the CLI is missing or older than 0.26 (older ones fail every parser build silently) | `brew install tree-sitter-cli`, or `brew upgrade tree-sitter-cli` |
| `neovim` | the download or its checksum failed | read the JSON from `bun scripts/nvim-install.ts`. A `sha256 mismatch` means stop and tell the person; never edit the pin to make it pass |
| `link ~/.config/nvim` · `link ~/.config/ulvim` | an existing config, or a link to somewhere else, is in the way | the installer never replaces it. Ask the person, then move it aside (`mv ~/.config/nvim ~/.config/nvim.bak`) and rerun. Old plugin data in `~/.local/share/nvim` stays; ask before deleting it |
| `zshrc source line` | `~/.zshrc` also defines some of the layer's names, so whichever comes later wins | delete just those definitions from `~/.zshrc`; leave everything else in the file alone |
| `~/.local/bin on PATH` | an interactive zsh does not have `~/.local/bin` on PATH, or the `nvim` it runs is not the pinned one (a Homebrew or system `nvim` wins). `shell/ulvim.zsh` puts `~/.local/bin` first, so this fails when the source line never runs or a later line in `~/.zshrc` changes PATH again | follow `next`: make the ULVim source line the last PATH change in `~/.zshrc` (move later PATH lines above it, and leave the rest of the file alone), or ask before removing the other nvim (`brew uninstall neovim`); then open a new shell and rerun. Don't add a PATH line of your own |

## Prove it

The checks run ULVim as `NVIM_APPNAME=ulvim` (the `~/.config/ulvim` link), which keeps its plugins in `~/.local/share/ulvim`, apart from the `~/.local/share/nvim` that plain `nvim` uses. So the first launch for the checks must use the same name. It installs the plugins pinned in `nvim-pack-lock.json` and starts building the tree-sitter parsers in the background; the loop below keeps starting it, 20 seconds at a time, until a start prints nothing, which means every parser is built.

```sh
bun scripts/install.ts --check     # every step ok
zsh -ic 'alias vf; whence -w fzp'  # the shell layer is live
NVIM_APPNAME=ulvim nvim --headless +qa   # first start for the checks: installs the plugins
until [ -z "$(NVIM_APPNAME=ulvim nvim --headless -c 'sleep 20' +qa 2>&1)" ]; do :; done   # waits for the parsers
NVIM_APPNAME=ulvim nvim --headless +qa 2>&1 | wc -c   # prints 0: a start with nothing on stderr
bun tests/run.ts                   # the public checks in CHECKS.md
```

Plain `nvim`, the one the person uses, installs its own copy of the plugins and parsers the same way on its first launch; run `nvim --headless +qa` once (and the same loop without `NVIM_APPNAME=ulvim`) if you want that done before you hand over. If a check fails, name it and say why rather than calling the install broken. `bun tests/run.ts --unattended` skips only the checks whose script declares it needs a live terminal.

## Roll back

1. `rm ~/.config/nvim ~/.config/ulvim` (they are links; this removes nothing in the clone).
2. Delete the two ULVim lines at the end of `~/.zshrc`: the `# ULVim shell layer` comment and the `source` line after it. That also takes `~/.local/bin` back off the front of PATH.
3. Move any config you set aside back: `mv ~/.config/nvim.bak ~/.config/nvim`.
4. Optional, after asking, because some of it is the person's own history. Everything else ULVim created:

| Path | What it is |
|---|---|
| `~/.local/bin/nvim`, `~/.local/opt/neovim` | the pinned Neovim |
| `~/.neovim_undo` | persistent undo history for every file edited |
| `~/.nvimfolds` | saved folds and views |
| `~/.local/share/nvim`, `~/.local/state/nvim`, `~/.cache/nvim` | plain `nvim`'s plugins and parsers, its edit history (shada, the open history, swap files) and the file-finder index |
| `~/.local/share/ulvim`, `~/.local/state/ulvim`, `~/.cache/ulvim` | the same for `NVIM_APPNAME=ulvim`, the checks' copy |
| the clone | the distribution itself |

If Neovim was on the machine before ULVim, the `nvim` folders may hold its data too; ask before deleting them.

## A personal layer

ULVim is meant to be used as it ships; don't add one unless the person asks. If they do, keep their changes out of the distribution's files so pulling updates never conflicts. ULVim loads each of these only when it exists:

- `lua/user/`: their Lua layer. `lua/user/init.lua` is required during plugin setup (the key hints and the start screen read it) and may return a table with `clues` (extra key hints), `dashboard_keys` (extra start-screen keys) and `setup()` (keymaps, commands and plugin overrides), which runs last, after everything else. A layer that fails to load is reported and skipped.
- `shell/user.zsh`: their shell additions, sourced at the end of `shell/ulvim.zsh`, so it can add names or replace any of them.
- `search-roots.local.json`: their own search roots for the file finder; when present it is used instead of `search-roots.json`.
