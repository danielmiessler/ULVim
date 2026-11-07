# ULVim's shell layer. `bun scripts/install.ts` adds one line to ~/.zshrc that
# sources this file, so the editor's aliases arrive with the config.
# It reaches the config only through ~/.config/nvim (a link to the repo) and the
# :UlFind command, never an internal Lua module.

# The pinned Neovim is reached through ~/.local/bin/nvim. A fresh Mac does not have that
# folder on PATH, and a Homebrew or system nvim earlier on PATH would win, so it goes first:
# every copy already on PATH is dropped and one is put in front (sourcing twice changes nothing).
path=("$HOME/.local/bin" ${path:#$HOME/.local/bin})
export PATH

# Editor
export EDITOR="nvim"
export VISUAL="nvim"
export MANPAGER="nvim +Man!"
alias v="nvim"

# Edit the config
alias vconf="nvim ~/.config/nvim/lua/ulvim"               # the config folder, in oil
alias vf="nvim ~/.config/nvim/lua/ulvim/plugins/init.lua" # plugin list
alias vo="nvim ~/.config/nvim/lua/ulvim/options.lua"      # options
alias vs="vo"                                             # options (second name)
alias vk="nvim ~/.config/nvim/lua/ulvim/keymaps.lua"      # keymaps

# Go to the config
alias vc="cd ~/.config/nvim/lua/ulvim/"
alias vd="cd ~/.config/nvim/lua/"
alias vp="cd ~/.config/nvim/lua/ulvim/plugins/"
alias nlp="cd ~/.local/share/nvim/site/pack/core/opt"     # installed plugins (vim.pack)

# fzp: the ranked file finder (Neovim's Ctrl-Space); cancelling quits Neovim.
function fzp() { nvim +UlFind }

# Ctrl-Space at the zsh prompt runs fzp. Terminals send Ctrl-Space as ^@, and a
# zle binding fires only at the prompt, so it never types into a running program.
if [[ -o interactive ]]; then
  function _ulvim_fzp_widget() {
    BUFFER=""
    fzp </dev/tty
    zle reset-prompt
  }
  zle -N _ulvim_fzp_widget
  bindkey '^@' _ulvim_fzp_widget
  bindkey -M viins '^@' _ulvim_fzp_widget
  bindkey -M vicmd '^@' _ulvim_fzp_widget
fi

# Your own shell additions: shell/user.zsh in the config folder, loaded last when
# present, so it can add names or replace any of the ones above.
if [[ -r ~/.config/nvim/shell/user.zsh ]]; then
  source ~/.config/nvim/shell/user.zsh
fi
