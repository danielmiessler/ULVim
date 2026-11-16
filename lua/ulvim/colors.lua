-- The one owner of every color (ISC-74). Tokyo Night on a transparent background, in five looks (ISC-182..188).
-- Each look is a tokyonight style registered here, so its palette is set before tokyonight derives anything:
-- syntax, lualine, diffs, diagnostics and :terminal all follow the look, never just the accents.
-- Which look loads: $ULVIM_THEME for one session, else the one saved by :UlTheme, else storm.
local M = {}

local state_file = vim.fn.stdpath("state") .. "/ulvim-theme"
local amber, lavender = "#e0af68", "#bb9af7"

-- The blue syntax ramp shared by twilight and blue: every warm or green hue becomes a blue.
local function blue_syntax(p)
	p.yellow = "#b4d0ff" -- parameters, command mode: pale periwinkle
	p.orange = "#65bcff" -- numbers, constants: clear sky blue
	p.green = "#9cd8ff" -- strings: pale sky
	p.green1 = "#7dcfff" -- properties, members: cyan
	p.green2 = "#3f8fd2" -- diff-add base: steel blue
	p.teal = "#2ac3de" -- hints, links: cobalt cyan
	p.red = "#6d91de" -- builtins, tags: cornflower (error red is red1, kept)
end

M.order = { "storm", "twilight", "blue", "abyss", "neon" }
M.themes = {
	-- Stock Tokyo Night storm, every highlight in its purple. The default since 2026-11-15.
	storm = {
		label = "Tokyo Night", about = "the classic storm palette, purple highlights",
		accent = lavender, fill = "#45367a", visual = "#3d3366",
	},
	-- Blue syntax, with Tokyo Night's purple kept for keywords and every highlight.
	twilight = {
		label = "Twilight", about = "blue code, purple keywords and highlights",
		accent = lavender, fill = "#45367a", visual = "#2f3a78", warning = amber, blue = true,
		palette = function(p) blue_syntax(p) p.magenta2 = "#d7b8ff" end,
	},
	-- The 2026-11-10 look: blues only, amber for keywords and warnings.
	blue = {
		label = "Blue", about = "blues only, amber keywords",
		accent = "#7aa2f7", fill = "#1a3a9e", visual = "#283c86", warning = amber, blue = true,
		palette = function(p)
			blue_syntax(p)
			p.purple, p.magenta = amber, amber -- keywords, statements, escapes
			p.magenta2 = "#ffc777"
		end,
	},
	-- Deep sea: one blue ramp from navy to ice on near-black navy, electric aqua for keywords and highlights.
	abyss = {
		label = "Abyss", about = "one ramp of deep-sea blues, electric aqua",
		accent = "#3ee0ff", fill = "#123c6e", visual = "#16325c", warning = amber, blue = true,
		palette = function(p)
			p.bg, p.bg_dark, p.bg_dark1, p.bg_highlight = "#0d1526", "#0a1120", "#070c18", "#14203a"
			p.fg, p.fg_dark, p.fg_gutter = "#c6daf7", "#9fb6d9", "#3a5079"
			p.comment, p.dark3, p.dark5, p.terminal_black = "#4a6491", "#3c5277", "#5c7299", "#2a3a55"
			p.blue, p.blue0, p.blue1, p.blue2 = "#5b9cff", "#1d3f7a", "#22c7e8", "#12aee0"
			p.blue5, p.blue6, p.blue7, p.cyan = "#8fdcff", "#c2f2ff", "#1e3354", "#8fd4ff"
			p.purple, p.magenta, p.magenta2 = "#22d3ee", "#3ee0ff", "#00e5ff" -- keywords
			p.yellow, p.orange, p.green = "#c7dcff", "#4f8cff", "#a8d8ff"
			p.green1, p.green2, p.teal, p.red = "#6cc4f5", "#2f7fbf", "#1fb6d6", "#3d7bd9"
			p.git = { add = "#3a8fd6", change = "#4a6fa5", delete = "#914c54" }
		end,
	},
	-- Tokyo after dark: vivid electric blues with hot-pink neon keywords and highlights.
	neon = {
		label = "Neon", about = "electric blues, hot-pink neon",
		accent = "#ff4fa3", fill = "#5c1f48", visual = "#26306e", warning = amber, blue = true,
		palette = function(p)
			p.bg, p.bg_dark, p.bg_dark1, p.bg_highlight = "#0e1021", "#0b0c1a", "#07080f", "#191c38"
			p.blue, p.blue0, p.blue7, p.cyan = "#3d8bff", "#2a3f9e", "#26306e", "#00e5ff"
			p.purple, p.magenta, p.magenta2 = "#ff4fa3", "#ff4fa3", "#ff007c" -- keywords
			p.yellow, p.orange, p.green = "#a5c8ff", "#00b3ff", "#7ab8ff"
			p.green1, p.green2, p.teal, p.red = "#4dd8ff", "#2a7fff", "#00d4d4", "#5c7cff"
		end,
	},
}

-- Register every look as a tokyonight style, so `style = <name>` builds from its palette.
for name, t in pairs(M.themes) do
	rawset(require("tokyonight.colors").styles, name, function()
		local p = vim.deepcopy(require("tokyonight.colors.storm"))
		if t.palette then t.palette(p) end
		return p
	end)
end

-- The highlights every look shares, drawn in that look's accent.
local function accents(t)
	return function(hl, c)
		local accent = { fg = t.accent }
		local title = { fg = t.accent, bold = true }
		hl.FloatBorder, hl.FloatTitle = accent, title
		hl.NormalFloat = { bg = c.bg_dark }
		hl.Visual = { bg = t.visual }
		hl.Search = { bg = t.fill, fg = c.fg }
		hl.IncSearch = { bg = t.accent, fg = c.bg_dark, bold = true }
		hl.CurSearch = { bg = t.accent, fg = c.bg_dark, bold = true, underline = true }
		hl.YankHighlight = { bg = t.accent, fg = c.bg_dark }
		hl.CursorLineNr = { fg = t.accent, bold = true }
		hl.PmenuSel = { bg = t.fill, fg = c.fg, bold = true }
		hl.OilFloatBorder = accent
		hl.SnacksPickerBorder, hl.SnacksPickerTitle = accent, title
		hl.SnacksPickerMatch = { fg = t.accent, bold = true }
		hl.SnacksInputBorder, hl.SnacksInputTitle = accent, title
		hl.MiniClueBorder, hl.MiniClueTitle = accent, title
		hl.TinyCmdlineBorder = accent
		hl.DashboardMruIcon, hl.DashboardShortCutIcon = accent, accent
		if t.blue then
			-- Neovim built-ins tokyonight leaves green; success reads in cyan like the rest of the blues.
			for _, g in ipairs({ "Added", "DiagnosticOk", "OkMsg" }) do hl[g] = { fg = c.green1 } end
			hl.DiagnosticUnderlineOk = { sp = c.green1, undercurl = true }
			hl.DiagnosticDeprecated = { sp = c.dark5, strikethrough = true }
			hl.GlyphPalette1 = { fg = c.red } -- remapped builtin blue, not error red
		end
	end
end

local function saved()
	local ok, lines = pcall(vim.fn.readfile, state_file)
	return ok and lines[1] or nil
end

--- Load a look. `persist` saves it as the one every later session opens with.
function M.apply(name, opts)
	local t = M.themes[name]
	if not t then
		vim.notify("ULVim has no theme " .. tostring(name) .. "; try " .. table.concat(M.order, ", "), vim.log.levels.WARN)
		return false
	end
	require("tokyonight").setup({
		style = name,
		transparent = true,
		styles = { sidebars = "transparent", floats = "transparent" },
		on_colors = function(c) if t.warning then c.warning = t.warning end end,
		on_highlights = accents(t),
	})
	require("tokyonight").load()
	M.current = name
	-- load() bypasses :colorscheme, so tell lualine and friends the colors changed.
	vim.api.nvim_exec_autocmds("ColorScheme", { pattern = vim.g.colors_name, modeline = false })
	if opts and opts.persist then
		vim.fn.mkdir(vim.fn.fnamemodify(state_file, ":h"), "p")
		vim.fn.writefile({ name }, state_file)
	end
	return true
end

--- Pick a look that previews as you move: moving through the list repaints the editor, Esc puts the old one back.
function M.pick()
	local before = M.current
	local names = { before }
	for _, n in ipairs(M.order) do if n ~= before then names[#names + 1] = n end end
	local items = {}
	for i, n in ipairs(names) do
		local t = M.themes[n]
		items[i] = { text = string.format("%-9s %s — %s%s", n, t.label, t.about, n == before and "  (current)" or ""), name = n }
	end
	local chosen = false
	require("snacks").picker({
		title = "Theme",
		items = items,
		format = "text",
		layout = { preset = "select" },
		on_change = function(_, item) if item then M.apply(item.name) end end,
		confirm = function(picker, item)
			chosen = true
			picker:close()
			if item then M.apply(item.name, { persist = true }) end
		end,
		on_close = function() if not chosen then vim.schedule(function() M.apply(before) end) end end,
	})
end

M.default = "storm"
M.state_file = state_file
--- The look a session opens with: the env override, else the saved choice, else storm. Unknown names fall through.
function M.resolve(env, saved_name)
	if M.themes[env or ""] then return env end
	if M.themes[saved_name or ""] then return saved_name end
	return M.default
end
M.apply(M.resolve(vim.env.ULVIM_THEME, saved()))

return M
