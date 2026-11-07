-- File explorer and image paste.

-- oil in a float on <leader>ft, in the window on <leader>fT (ISC-50..52).
require("oil").setup({
	default_file_explorer = true,
	columns = { "icon" },
	delete_to_trash = true,
	keymaps = {
		["l"] = "actions.select",
		["h"] = "actions.parent",
		["<BS>"] = "actions.parent",
		["q"] = "actions.close",
		["<C-v>"] = "actions.select_vsplit",
		["<C-x>"] = "actions.select_split",
	},
	float = { padding = 2, max_width = 0.8, max_height = 0.8, border = "rounded", win_options = { winhighlight = "FloatBorder:OilFloatBorder" } },
})
vim.api.nvim_create_autocmd("FileType", {
	pattern = "oil",
	callback = function()
		local win = vim.api.nvim_get_current_win()
		local cfg = vim.api.nvim_win_get_config(win)
		if cfg.relative ~= "" then
			cfg.title, cfg.title_pos = " 📁 File Explorer ", "center"
			vim.api.nvim_win_set_config(win, cfg)
		end
	end,
})

-- Image paste on <leader>ii: the clipboard image saved as png into ./assets beside the
-- current file, linked in markdown. Override it from lua/user/ (img-clip's setup replaces).
require("img-clip").setup({
	default = { dir_path = "assets", relative_to_current_file = true, prompt_for_file_name = false, file_name = "%y%m%d-%H%M%S", extension = "png" },
	filetypes = { markdown = { url_encode_path = true, template = "![Image]($FILE_PATH)" } },
})
