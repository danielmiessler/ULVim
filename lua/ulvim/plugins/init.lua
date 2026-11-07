-- Every plugin, installed in one vim.pack.add call (ISC-3). Versions are pinned by
-- nvim-pack-lock.json, which is committed (ISC-4). Group files below only configure.
local gh = function(repo) return "https://github.com/" .. repo end

vim.pack.add({
	-- look
	gh("folke/tokyonight.nvim"),
	gh("nvim-mini/mini.icons"),
	gh("nvim-lualine/lualine.nvim"),
	gh("nvim-mini/mini.tabline"),
	gh("rachartier/tiny-cmdline.nvim"),
	-- prose editing
	gh("nvim-mini/mini.surround"),
	gh("nvim-mini/mini.ai"),
	gh("windwp/nvim-autopairs"),
	gh("okuuva/auto-save.nvim"),
	gh("bullets-vim/bullets.vim"),
	gh("tpope/vim-repeat"),
	gh("inkarkat/vim-visualrepeat"),
	gh("MeanderingProgrammer/render-markdown.nvim"),
	gh("shortcuts/no-neck-pain.nvim"),
	-- files and images (no plugin here may run a server, ISC-170)
	gh("stevearc/oil.nvim"),
	gh("HakonHarnes/img-clip.nvim"),
	-- finder: snacks stays at the commit the old config ran, until the bake-off (ISC-109)
	{ src = gh("folke/snacks.nvim"), version = "882c996cf28183f4d63640de0b4c02ec886d01f2" },
	-- syntax: parsers and their queries, the same set the old config ran
	{ src = gh("nvim-treesitter/nvim-treesitter"), version = "main" },
	-- key hints
	gh("nvim-mini/mini.clue"),
}, { confirm = false })

-- Ghostty config syntax ships inside the app bundle.
local ghostty = "/Applications/Ghostty.app/Contents/Resources/vim/vimfiles"
if vim.uv.fs_stat(ghostty) then vim.opt.runtimepath:append(ghostty) end

require("ulvim.colors")
require("ulvim.plugins.ui")
require("ulvim.plugins.editing")
require("ulvim.plugins.files")
require("ulvim.plugins.syntax")
