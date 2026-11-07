-- The one owner of every color (ISC-74). tokyonight storm, transparent, ULVim blue accents (purple retired 2026-11-05).
require("tokyonight").setup({
	style = "storm",
	transparent = true,
	styles = { sidebars = "transparent", floats = "transparent" },
	on_highlights = function(hl, c)
		-- The deep blue is the logo mark's (#1a3a9e): quiet fills that text sits on. Light blue is
		-- tokyonight blue, the same hue lifted for anything that has to pop on a dark ground.
		local ul_blue, light_blue = "#1a3a9e", c.blue -- #7aa2f7
		local accent = { fg = light_blue }
		hl.FloatBorder = accent
		hl.FloatTitle = { fg = light_blue, bold = true }
		hl.NormalFloat = { bg = c.bg_dark }
		hl.Visual = { bg = "#283c86" }
		hl.Search = { bg = ul_blue, fg = c.fg }
		hl.IncSearch = { bg = light_blue, fg = c.bg_dark, bold = true }
		hl.CurSearch = { bg = light_blue, fg = c.bg_dark, bold = true, underline = true }
		hl.YankHighlight = { bg = light_blue, fg = c.bg_dark }
		hl.CursorLineNr = { fg = light_blue, bold = true }
		hl.PmenuSel = { bg = ul_blue, fg = c.fg, bold = true }
		hl.OilFloatBorder = accent
		hl.SnacksPickerBorder = accent
		hl.SnacksPickerTitle = { fg = light_blue, bold = true }
		hl.SnacksPickerMatch = { fg = light_blue, bold = true }
		hl.SnacksInputBorder = accent
		hl.SnacksInputTitle = { fg = light_blue, bold = true }
		hl.MiniClueBorder = accent
		hl.MiniClueTitle = { fg = light_blue, bold = true }
		hl.TinyCmdlineBorder = accent
		hl.DashboardMruIcon = accent
		hl.DashboardShortCutIcon = accent
	end,
})
vim.cmd.colorscheme("tokyonight-storm")
