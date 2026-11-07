-- ULVim: a Neovim distribution on plain Neovim 0.12 (vim.pack, no distro underneath).
-- Every behavior here has a headless probe in tests/; CHECKS.md lists them.
vim.loader.enable()

require("ulvim.options")
require("ulvim.plugins")
require("ulvim.keymaps")
require("ulvim.autocmds")
require("ulvim.commands")
-- Your own layer, if lua/user/ exists (see lua/ulvim/user.lua). Loaded last.
require("ulvim.user").setup()
