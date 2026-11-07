-- Prose editing: surround, text objects, pairs, auto-save, bullets, rendering, focus.

-- Surround on <leader>s / <leader>sd / <leader>sr, with markdown B, I, c in both directions (ISC-32..36).
require("mini.surround").setup({
	custom_surroundings = {
		B = { input = { "%*%*().-()%*%*" }, output = { left = "**", right = "**" } },
		I = { input = { "%*().-()%*" }, output = { left = "*", right = "*" } },
		c = { input = { "`().-()`" }, output = { left = "`", right = "`" } },
	},
	mappings = {
		add = "<leader>s",
		delete = "<leader>sd",
		replace = "<leader>sr",
		find = "",
		find_left = "",
		highlight = "",
		update_n_lines = "",
	},
	respect_selection_type = false,
	search_method = "cover",
})

-- Text objects, plus `g` for the whole buffer (ISC-37, ISC-38).
require("mini.ai").setup({
	custom_textobjects = {
		g = function()
			return { from = { line = 1, col = 1 }, to = { line = vim.fn.line("$"), col = math.max(vim.fn.getline("$"):len(), 1) } }
		end,
	},
	mappings = { around_next = "", inside_next = "", around_last = "", inside_last = "" },
	search_method = "cover_or_next",
})

-- Pairs that leave contractions alone (ISC-39, ISC-40, ISC-121).
local npairs = require("nvim-autopairs")
npairs.setup({ check_ts = false })
-- An apostrophe right after a letter is a contraction or possessive, never a pair.
local cond = require("nvim-autopairs.conds")
for _, rule in ipairs(npairs.get_rules("'")) do rule:with_pair(cond.not_before_regex("%w")) end

-- Auto-save, but never over a file that changed on disk since it was loaded (ISC-41, ISC-90).
require("auto-save").setup({
	trigger_events = { immediate_save = { "BufLeave", "FocusLost", "QuitPre", "VimSuspend" }, defer_save = { "InsertLeave", "TextChanged" } },
	condition = function(buf)
		if vim.bo[buf].buftype ~= "" or vim.bo[buf].readonly then return false end
		local name = vim.api.nvim_buf_get_name(buf)
		if name == "" then return false end
		-- Refuse to write when the file on disk is newer than what the buffer last read or wrote.
		local st = vim.uv.fs_stat(name)
		local seen = vim.b[buf].ulvim_mtime
		if st and seen and st.mtime.sec > seen then return false end
		return true
	end,
	debounce_delay = 1000,
})

-- Bullet and number continuation (ISC-30, ISC-31).
vim.g.bullets_enabled_file_types = { "markdown", "text", "gitcommit", "scratch" }
vim.g.bullets_delete_last_bullet_if_empty = 1

-- In-buffer markdown rendering, off by default; <leader>um toggles it (ISC-122).
-- patterns.markdown.disable = false: by default render-markdown strips conceal_lines from
-- the markdown query at setup, even while disabled, which brings back the code fence
-- lines tree-sitter hides (found by tests/look_compare.ts, ISC-98).
require("render-markdown").setup({ enabled = false, patterns = { markdown = { disable = false } } })

-- Focus layout for writing; <leader>uz toggles it (ISC-123).
require("no-neck-pain").setup({ width = 100 })
