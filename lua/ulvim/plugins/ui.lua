-- Message UI, statusline, buffer tabs, key hints, dashboard.

-- ui2 is Neovim's built-in message and command-line UI; tiny-cmdline floats it centered (ISC-117, ISC-118).
require("vim._core.ui2").enable({})

require("mini.icons").setup()
MiniIcons.mock_nvim_web_devicons()

-- Word count for prose buffers (ISC-124).
local function words()
	if vim.bo.filetype ~= "markdown" and vim.bo.filetype ~= "text" then return "" end
	local wc = vim.fn.wordcount()
	return (wc.visual_words or wc.words) .. " words"
end

require("lualine").setup({
	options = { theme = "tokyonight", globalstatus = true, section_separators = "", component_separators = "│" },
	sections = {
		lualine_a = { "mode" },
		lualine_b = { "branch" },
		lualine_c = { { "filename", path = 1 } },
		lualine_x = { words, "filetype" },
		lualine_y = { "progress" },
		lualine_z = { "location" },
	},
})

-- Buffer tabs, cycled with <S-h>/<S-l> (ISC-127..129).
require("mini.tabline").setup()

-- Key hints after <leader>, with ULVim group names (ISC-83, ISC-84, ISC-125).
local clue = require("mini.clue")
clue.setup({
	triggers = {
		{ mode = "n", keys = "<Leader>" },
		{ mode = "x", keys = "<Leader>" },
		{ mode = "n", keys = "g" },
		{ mode = "n", keys = "z" },
		{ mode = "n", keys = "'" },
		{ mode = "n", keys = '"' },
		{ mode = "n", keys = "<C-w>" },
	},
	clues = require("ulvim.user").clues({
		{ mode = "n", keys = "<Leader>b", desc = "+buffer · Enter: bold" },
		{ mode = "n", keys = "<Leader>f", desc = "+find" },
		{ mode = "n", keys = "<Leader>s", desc = "+surround" },
		{ mode = "n", keys = "<Leader>u", desc = "+toggle" },
		{ mode = "n", keys = "<Leader>y", desc = "+yank" },
		{ mode = "n", keys = "<Leader>d", desc = "+delete" },
		{ mode = "n", keys = "<Leader>h", desc = "+alternate" },
		{ mode = "n", keys = "<Leader>i", desc = "+image / italic · Enter: italic" },
		{ mode = "n", keys = "<Leader>x", desc = "Toggle checkbox" }, -- bullets.vim maps it with no desc
		clue.gen_clues.g(),
		clue.gen_clues.z(),
		clue.gen_clues.marks(),
		clue.gen_clues.registers(),
		clue.gen_clues.windows(),
	}),
	window = { delay = 400, config = { width = "auto" } },
})

-- snacks: the start screen, input boxes, image float, and the ranked picker's engine.
require("snacks").setup({
	input = { enabled = true },
	notifier = { enabled = false },
	picker = { enabled = true },
	image = { enabled = true, doc = { inline = false, float = true, max_width = 60, max_height = 30 } },
	styles = { input = { backdrop = false, border = "rounded", title_pos = "center", width = 60, relative = "editor" } },
	dashboard = {
		enabled = true,
		width = 60,
		preset = {
			pick = function() require("ulvim.search").smart() end,
			keys = {
				{ icon = " ", key = "f", desc = "Find file", action = function() require("ulvim.search").smart() end },
				{ icon = " ", key = "n", desc = "New file", action = ":ene | startinsert" },
				unpack(vim.list_extend(vim.deepcopy(require("ulvim.user").spec.dashboard_keys or {}), {
					{ icon = " ", key = "q", desc = "Quit", action = ":qa" },
				})),
			},
		},
		sections = {
			{
				padding = 1,
				text = {
					[[
                 _____                    _____
                /\    \                  /\    \
               /::\____\                /::\____\
              /:::/    /               /:::/    /
             /:::/    /               /:::/    /
            /:::/    /               /:::/    /
           /:::/    /               /:::/    /
          /:::/    /               /:::/    /
         /:::/    /      _____    /:::/    /
        /:::/____/      /\    \  /:::/    /
       |:::|    /      /::\____\/:::/____/
       |:::|____\     /:::/    /\:::\    \
        \:::\    \   /:::/    /  \:::\    \
         \:::\    \ /:::/    /    \:::\    \
          \:::\    /:::/    /      \:::\    \
           \:::\__/:::/    /        \:::\    \
            \::::::::/    /          \:::\    \
             \::::::/    /            \:::\    \
              \::::/    /              \:::\____\
               \::/____/                \::/    /
                ~~                       \/____/

                       "Text is life…"
                            ULVim]],
					hl = "SnacksDashboardHeader",
				},
			},
			{ section = "keys", gap = 0, padding = 1 },
			{ section = "recent_files", limit = 6, padding = 1 },
		},
	},
})
