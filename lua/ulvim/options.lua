-- Options. Each one is a deliberate choice or a comfort a writer relies on; anything equal
-- to a Neovim default is left out.
local o, g = vim.opt, vim.g

g.mapleader = " "
g.maplocalleader = "\\"
g.markdown_recommended_style = 0 -- keep the markdown ftplugin from resetting indent

-- Terminal tab title: file name with modified and readonly flags.
o.title = true
o.titlestring = "%t%( %m%)%( %r%)"

-- Prose: soft wrap at word boundaries, hidden markup, screen-line friendly.
o.wrap = true
o.linebreak = true
o.breakindent = true
o.conceallevel = 2
o.smoothscroll = true

-- Indent: four spaces.
o.tabstop = 4
o.softtabstop = 4
o.shiftwidth = 4
o.expandtab = true

-- No spell, no completion of any kind.
o.spell = false
o.spelllang = ""
o.complete = ""
o.completeopt = ""
o.wildmenu = false
o.wildmode = ""

-- Search.
o.ignorecase = true
o.smartcase = true

-- Files and undo.
o.swapfile = false
o.undofile = true
o.undodir = vim.fn.expand("~/.neovim_undo/")
o.undolevels = 10000
o.confirm = true
o.viewdir = vim.fn.expand("~/.nvimfolds")
vim.fn.mkdir(vim.o.viewdir, "p")

-- Look.
o.number = true
o.relativenumber = false -- absolute numbers only
o.cursorline = true
o.scrolloff = 12
o.signcolumn = "yes"
o.laststatus = 3
o.cmdheight = 0
o.showmode = false
o.termguicolors = true
o.list = true
o.fillchars = { diff = "╱", eob = " " }
o.winborder = "rounded"

-- Windows and timing.
o.splitright = true
o.splitbelow = true
o.updatetime = 150
o.timeoutlen = 1000 -- a longer leader-chord window
o.foldmethod = "manual"
o.mouse = "a"
o.virtualedit = "block"
o.jumpoptions = "view"
o.clipboard = "" -- the + register only through <leader>y / <leader>p

-- Quiet comforts a polished editor gives without being asked.
o.splitkeep = "screen"
o.autowrite = true
o.shiftround = true
o.sidescrolloff = 8
o.foldlevel = 99
o.winminwidth = 5
o.ruler = false
o.shortmess:append({ W = true, I = true, c = true, C = true })
o.sessionoptions = { "buffers", "curdir", "tabpages", "winsize", "help", "globals", "skiprtp", "folds" }

-- Prose diffs highlight whole words.
o.diffopt:append("inline:word")

vim.diagnostic.config({ underline = false, virtual_text = false, signs = true, severity_sort = false })
