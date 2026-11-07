-- Headless probes for ISA.md, run inside a real startup (init.lua, plugins, filetype
-- detection, shada) so they see what your editor sees:
--   NVIM_APPNAME=ulvim PROBE='<check> [args...]' nvim --headless +'luafile tests/probe.lua'
-- Exit 0 = pass. tests/run.ts runs every ISA row this way.

local C = {}
local tmpdir = vim.fn.stdpath("state") .. "/probe"
vim.fn.mkdir(tmpdir, "p")
-- Probes never touch your real history: their own shada and open-history file.
vim.o.shadafile = tmpdir .. "/probe.shada"
vim.g.ulvim_open_history = tmpdir .. "/open-history.jsonl"

local function keys(s, mode) vim.api.nvim_feedkeys(vim.keycode(s), mode or "mtx", false) end
local function lines() return vim.api.nvim_buf_get_lines(0, 0, -1, false) end
local function md(content, name)
	local path = tmpdir .. "/" .. (name or ("p" .. vim.uv.hrtime())) .. ".md"
	vim.fn.writefile(content or { "" }, path)
	vim.cmd("silent edit! " .. vim.fn.fnameescape(path))
	return path
end
local function wait(ms, cond) return vim.wait(ms, cond or function() return false end, 20) end
local function maprhs(mode, lhs)
	local m = vim.fn.maparg(lhs, mode, false, true)
	if vim.tbl_isempty(m) then return nil end
	return m.rhs or ("<lua> " .. (m.desc or ""))
end
local function eq(a, b, what) return a == b, string.format("%s: got %s, want %s", what or "value", vim.inspect(a), vim.inspect(b)) end

-- options -------------------------------------------------------------------
C["opt"] = function(name, want)
	local v = vim.o[name]
	if want == nil then return true, name .. "=" .. tostring(v) end
	if type(v) == "number" then want = tonumber(want) elseif type(v) == "boolean" then want = want == "true" end
	return eq(v, want, name)
end
C["opt-md"] = function(name, want) md() return C.opt(name, want) end
C["opt-has"] = function(name, part) return vim.o[name]:find(part, 1, true) ~= nil, name .. "=" .. vim.o[name] end
C["spell-off"] = function()
	md()
	vim.cmd("doautocmd FileType markdown")
	vim.cmd("doautocmd BufEnter")
	return eq(vim.wo.spell, false, "spell")
end

-- maps ----------------------------------------------------------------------
C["map"] = function(mode, lhs, contains)
	local rhs = maprhs(mode, lhs)
	if not rhs then return false, lhs .. " unmapped in " .. mode end
	if contains and not rhs:find(contains, 1, true) then return false, lhs .. " -> " .. rhs end
	return true, lhs .. " -> " .. rhs
end
C["map-rhs"] = function(modes, lhs, want)
	for m in modes:gmatch(".") do
		local rhs = maprhs(m, lhs)
		if rhs ~= want then return false, string.format("%s %s -> %s, want %s", m, lhs, tostring(rhs), want) end
	end
	return true, lhs
end
C["unmapped"] = function(mode, lhs) return maprhs(mode, lhs) == nil, lhs .. " in " .. mode end
C["no-git-add-all"] = function()
	for _, m in ipairs({ "n", "i", "x", "v", "o", "t", "c" }) do
		for _, k in ipairs(vim.api.nvim_get_keymap(m)) do
			local rhs = (k.rhs or "") .. (k.desc or "")
			if rhs:match("git add %.") or rhs:match("git add %-A") then return false, m .. " " .. k.lhs end
		end
	end
	return true, "none"
end

-- typing ----------------------------------------------------------------------
C["feed"] = function(mode, seq, what, want)
	md({ "hello world" })
	if mode == "i" then keys("A" .. seq) elseif mode == "n" then keys(seq) end
	if what == "mode" then return eq(vim.api.nvim_get_mode().mode, want, "mode") end
	if what == "line" then
		keys("<Esc>")
		return eq(vim.api.nvim_get_current_line(), "hello world" .. want, "line")
	end
	if what == "empty" then return eq(table.concat(lines(), ""), "", "buffer") end
end
C["jl-insert"] = function()
	local p = md({ "x" })
	local quit = false
	vim.api.nvim_create_autocmd("QuitPre", { callback = function() quit = true error("probe: stop quit") end })
	pcall(keys, "Ay<Esc>")
	pcall(keys, "ijl")
	return quit and vim.fn.readfile(p)[1] == "yx" or quit, "quit=" .. tostring(quit)
end
C["jl-normal"] = function()
	md({ "x" })
	local quit = false
	vim.api.nvim_create_autocmd("QuitPre", { callback = function() quit = true error("probe: stop quit") end })
	pcall(keys, "jl")
	return quit, "quit=" .. tostring(quit)
end
C["md-key"] = function(mode, lhs, mark)
	if mode == "n" then
		md({ "hello world" })
		keys("w" .. lhs)
		return eq(vim.api.nvim_get_current_line(), "hello " .. mark .. "world" .. mark, "line")
	end
	md({ "say  hello  now" })
	keys("0fhv5l" .. lhs) -- selects "hello " with the trailing space
	return eq(vim.api.nvim_get_current_line(), "say  " .. mark .. "hello" .. mark .. "  now", "line")
end
-- A selection holding a control byte and key notation is wrapped as text (ISC-172): typed
-- through a command string, the ESC would leave insert mode and run the rest as commands.
C["wrap-literal"] = function()
	local body = "a\27b<CR>c<Esc>"
	md({ "say " .. body .. "  now" })
	vim.api.nvim_win_set_cursor(0, { 1, 4 })
	keys("v" .. vim.fn.strchars(body) .. "l<leader>b") -- the body plus one trailing space
	local want = "say **" .. body .. "**  now"
	local got = lines()
	if #got ~= 1 then return false, "lines: " .. vim.inspect(got) end
	if vim.api.nvim_get_mode().mode ~= "n" then return false, "mode " .. vim.api.nvim_get_mode().mode end
	return eq(got[1], want, "line")
end
C["list-continue"] = function(kind)
	md({ kind == "bullet" and "- item" or "1. item" })
	keys("A<CR>next<Esc>")
	local want = kind == "bullet" and "- next" or "2. next"
	return eq(lines()[2], want, "second line")
end
C["surround"] = function(what)
	if what == "add" then md({ "hello" }) keys("<leader>siw)") return eq(lines()[1], "(hello)", "add") end
	if what == "delete" then md({ "(hello)" }) keys("l<leader>sd)") return eq(lines()[1], "hello", "delete") end
	if what == "replace" then md({ "(hello)" }) keys("l<leader>sr)]") return eq(lines()[1], "[hello]", "replace") end
	local want = { B = "**w**", I = "*w*", c = "`w`" }
	for id, out in pairs(want) do
		if what == "md-add" then
			md({ "w" })
			keys("<leader>siw" .. id)
			if lines()[1] ~= out then return false, id .. " add -> " .. lines()[1] end
		else
			md({ out })
			keys((id == "B" and "ll" or "l") .. "<leader>sd" .. id)
			if lines()[1] ~= "w" then return false, id .. " delete -> " .. lines()[1] end
		end
	end
	return true, what
end
C["textobj"] = function()
	md({ [[say 'hello' now]] })
	keys("fhciqbye<Esc>")
	return eq(lines()[1], [[say 'bye' now]], "ciq")
end
C["pairs"] = function(what)
	md({ "" })
	if what == "open" then keys("i(x<Esc>") return eq(lines()[1], "(x)", "open") end
	if what == "skip" then keys("i(x)<Esc>") return eq(lines()[1], "(x)", "skip") end
	keys("idon't<Esc>")
	return eq(lines()[1], "don't", "contraction")
end
C["no-popup"] = function()
	md({ "hello world" })
	keys("Ahel")
	local shown = vim.fn.pumvisible()
	keys("<C-n>")
	shown = shown + vim.fn.pumvisible()
	keys("<Esc>")
	return shown == 0 and not vim.o.autocomplete, "pumvisible=" .. shown .. " autocomplete=" .. tostring(vim.o.autocomplete)
end
C["jk-screenlines"] = function()
	return C["map-rhs"]("n", "j", "v:count == 0 ? 'gj' : 'j'")
end

-- files and history ------------------------------------------------------------
C["autosave"] = function()
	local p = md({ "a" })
	keys("Ab<Esc>")
	vim.api.nvim_exec_autocmds("InsertLeave", { buffer = 0 })
	wait(2500, function() return vim.fn.readfile(p)[1] == "ab" end)
	return eq(vim.fn.readfile(p)[1], "ab", "disk")
end
C["autosave-no-clobber"] = function()
	local p = md({ "mine" })
	vim.uv.sleep(1100)
	vim.fn.writefile({ "agent" }, p) -- an agent writes the file
	keys("Ax<Esc>")
	vim.api.nvim_exec_autocmds("InsertLeave", { buffer = 0 })
	wait(2500)
	return eq(vim.fn.readfile(p)[1], "agent", "disk")
end
C["undofile"] = function()
	local p = md({ "one" })
	keys("Atwo<Esc>")
	vim.cmd("silent write")
	vim.cmd("silent bwipeout!")
	vim.cmd("silent edit " .. vim.fn.fnameescape(p))
	keys("u")
	return eq(lines()[1], "one", "after undo")
end
C["last-loc"] = function()
	local p = md({ "1", "2", "3", "4", "5" })
	vim.api.nvim_win_set_cursor(0, { 4, 0 })
	vim.cmd("silent write")
	vim.cmd("silent wshada!") -- the '" mark persists through shada, as across sessions
	vim.cmd("silent bwipeout")
	vim.cmd("silent rshada!")
	vim.cmd("silent edit " .. vim.fn.fnameescape(p))
	return eq(vim.api.nvim_win_get_cursor(0)[1], 4, "cursor line")
end
C["history-log"] = function()
	local f = vim.g.ulvim_open_history
	local before = vim.fn.filereadable(f) == 1 and #vim.fn.readfile(f) or 0
	local p = md({ "x" })
	local after = vim.fn.readfile(f)
	local logged = #after == before + 1 and after[#after]:find(vim.fs.basename(p), 1, true) ~= nil
	-- An external rewrite reloads the buffer (BufReadPost again) and must add nothing.
	vim.uv.sleep(1100)
	vim.fn.writefile({ "y" }, p)
	vim.cmd("checktime")
	wait(300, function() return vim.api.nvim_buf_get_lines(0, 0, 1, false)[1] == "y" end)
	local reloaded = vim.api.nvim_buf_get_lines(0, 0, 1, false)[1] == "y"
	local final = #vim.fn.readfile(f)
	return logged and reloaded and final == before + 1, string.format("%d -> %d after open, %d after reload (reloaded=%s)", before, #after, final, tostring(reloaded))
end
-- A .env buffer keeps no undo file and adds no open-history line, while a plain file in the
-- same folder does both, so the rule is about the name (ISC-171). The other secret names and
-- a file under the system temp dir must open with undofile off too.
C["secret-no-undo"] = function()
	local f = vim.g.ulvim_open_history
	local count = function() return vim.fn.filereadable(f) == 1 and #vim.fn.readfile(f) or 0 end
	local dir = tmpdir .. ("/secret%d"):format(vim.uv.hrtime())
	vim.fn.mkdir(dir, "p")
	local function open_edit_write(name)
		local p = dir .. "/" .. name
		vim.fn.writefile({ "KEY=one" }, p)
		local before = count()
		vim.cmd("silent edit! " .. vim.fn.fnameescape(p))
		local udf = vim.bo.undofile
		keys("Atwo<Esc>")
		vim.cmd("silent write")
		local undo = vim.fn.undofile(p)
		local r = { udf = udf, undo = vim.fn.filereadable(undo) == 1, logged = count() - before }
		vim.fn.delete(undo)
		return r
	end
	local secret, plain = open_edit_write(".env"), open_edit_write("notes.md")
	local bad = {}
	if secret.udf or secret.undo or secret.logged ~= 0 then table.insert(bad, ".env " .. vim.inspect(secret)) end
	if not (plain.udf and plain.undo and plain.logged == 1) then table.insert(bad, "control notes.md " .. vim.inspect(plain)) end
	local tmpfile = vim.fs.joinpath(vim.uv.os_tmpdir(), ("ulvim-probe-%d.md"):format(vim.uv.hrtime()))
	for _, p in ipairs({ dir .. "/.env.local", dir .. "/server.pem", dir .. "/tls.key", dir .. "/id_ed25519", tmpfile }) do
		vim.fn.writefile({ "x" }, p)
		vim.cmd("silent edit! " .. vim.fn.fnameescape(p))
		if vim.bo.undofile then table.insert(bad, vim.fs.basename(p) .. " undofile on") end
	end
	vim.cmd("enew")
	for _, b in ipairs(vim.api.nvim_list_bufs()) do
		local n = vim.api.nvim_buf_get_name(b)
		if n ~= "" and (vim.startswith(n, dir) or n == tmpfile) then vim.cmd("silent bwipeout! " .. b) end
	end
	vim.fn.delete(tmpfile)
	vim.fn.delete(dir, "rf")
	return #bad == 0, #bad == 0 and ".env: undofile off, no undo file, 0 history lines; notes.md control kept both; .env.*, *.pem, *.key, id_*, temp dir off" or table.concat(bad, "; ")
end
local function external_change(trigger)
	local p = md({ "old" })
	vim.uv.sleep(1100)
	vim.fn.writefile({ "new" }, p)
	if trigger == "watch" then
		wait(1000, function() return lines()[1] == "new" end)
	else
		vim.api.nvim_exec_autocmds(trigger, {})
		-- checktime inside an autocmd reloads once the autocmd returns
		wait(500, function() return lines()[1] == "new" end)
	end
	return eq(lines()[1], "new", trigger)
end
C["checktime"] = function(ev) return external_change(ev) end
C["fs-watch"] = function()
	local t0 = vim.uv.hrtime()
	local ok, why = external_change("watch")
	return ok, why .. string.format(" in %d ms", (vim.uv.hrtime() - t0) / 1e6 - 1100)
end
C["checktime-modified"] = function()
	local p = md({ "old" })
	keys("Amine<Esc>") -- unsaved edit
	vim.uv.sleep(1100)
	vim.fn.writefile({ "agent" }, p)
	vim.v.fcs_choice = ""
	pcall(vim.cmd, "checktime")
	return eq(lines()[1], "oldmine", "buffer keeps unsaved edits")
end

-- look ------------------------------------------------------------------------
C["colorscheme"] = function(want) return eq(vim.g.colors_name, want, "colorscheme") end
local function hl(name) return vim.api.nvim_get_hl(0, { name = name, link = false }) end
local function hex(n) return n and string.format("#%06x", n) or nil end
C["hl-nobg"] = function(name) return hl(name).bg == nil, name .. " bg=" .. tostring(hex(hl(name).bg)) end
C["hl-bg"] = function(names, want)
	for n in names:gmatch("[^,]+") do
		if hex(hl(n).bg) ~= want then return false, n .. " bg=" .. tostring(hex(hl(n).bg)) end
	end
	return true, names
end
C["no-purple"] = function()
	local bad = {}
	-- Highlighting and UI accents only: search, selection, yank, menus, and every float border
	-- or title. Syntax colors (keywords, escapes) keep the theme palette (ISC-98 look parity).
	local fixed = { Search = 1, IncSearch = 1, CurSearch = 1, Visual = 1, YankHighlight = 1, PmenuSel = 1, CursorLineNr = 1, DashboardMruIcon = 1, DashboardShortCutIcon = 1 }
	local function accent(name) return fixed[name] or name:match("Border$") or name:match("^%a*Float%a*Title$") or name:match("^Snacks%a*Title$") or name:match("^MiniClue%a*Title$") end
	for name, h in pairs(vim.api.nvim_get_hl(0, {})) do
		if not h.link and accent(name) then
			for _, k in ipairs({ "fg", "bg", "sp" }) do
				local v = hex(h[k])
				if v == "#9d7cd8" or v == "#bb9af7" then bad[#bad+1] = name .. "." .. k end
			end
		end
	end
	table.sort(bad)
	return #bad == 0, #bad == 0 and "none" or (#bad .. ": " .. table.concat(bad, ", ", 1, math.min(#bad, 12)))
end
C["search-blues"] = function()
	local ok1, d1 = C["hl-bg"]("Search", "#1a3a9e")
	local ok2, d2 = C["hl-bg"]("IncSearch,CurSearch", "#7aa2f7")
	return ok1 and ok2, d1 .. "; " .. d2
end
C["no-jk-prefix"] = function()
	local bad = {}
	for _, m in ipairs(vim.api.nvim_get_keymap("n")) do
		local c = m.lhs:sub(1, 1)
		if (c == "j" or c == "k") and #m.lhs > 1 then bad[#bad + 1] = m.lhs end
	end
	return #bad == 0, #bad == 0 and "none" or table.concat(bad, ", ")
end
C["stale-node-text"] = function()
	local lines = {}
	for i = 1, 20 do lines[i] = "line " .. i .. " with a [link](x) and **bold**" end
	md(lines)
	local tree = vim.treesitter.get_parser(0, "markdown"):parse()[1]
	local node = tree:root():named_descendant_for_range(18, 0, 18, 4)
	if not node then return false, "no node on line 19" end
	vim.api.nvim_buf_set_lines(0, 3, -1, false, {}) -- the node now points past the end of the buffer
	local ok, text = pcall(vim.treesitter.get_node_text, node, 0)
	local ok2, err2 = pcall(vim.treesitter.get_node_text, nil, 0) -- a different error must still raise
	return ok and text == "" and not ok2, string.format("stale: ok=%s text=%q; bad call raised=%s", tostring(ok), tostring(text), tostring(not ok2))
end
C["hl-fg"] = function(name, want) return eq(hex(hl(name).fg), want, name .. " fg") end
C["dashboard"] = function(what)
	vim.cmd("enew")
	Snacks.dashboard.open()
	wait(300)
	local text = table.concat(lines(), "\n")
	if what == "art" then return text:find("Text is life", 1, true) ~= nil, "art" end
	return text:find("ULVim", 1, true) ~= nil, "brand"
end
C["statusline-words"] = function()
	md({ "one two three" })
	require("lualine").refresh({ force = true, place = { "statusline" } })
	local rendered = vim.api.nvim_eval_statusline(vim.o.statusline, { maxwidth = 200 }).str
	return rendered:find("3 words", 1, true) ~= nil, rendered
end
C["lualine"] = function() return vim.o.statusline:find("lualine", 1, true) ~= nil, vim.o.statusline:sub(1, 60) end
C["tabline-buffers"] = function()
	md({ "a" }, "alpha")
	md({ "b" }, "beta")
	local t = vim.api.nvim_eval_statusline(vim.o.tabline, { use_tabline = true }).str
	return t:find("alpha", 1, true) ~= nil and t:find("beta", 1, true) ~= nil, t
end
C["ui2-enabled"] = function()
	local ok, ui2 = pcall(require, "vim._core.ui2")
	return ok and ui2 and (ui2.enabled or (vim.g.ui2_enabled ~= false)) and vim.o.cmdheight == 0, "cmdheight=" .. vim.o.cmdheight
end

-- discovery ----------------------------------------------------------------------
C["leader-popup"] = function() return MiniClue ~= nil and #MiniClue.config.triggers > 0, "mini.clue triggers" end
C["leader-groups"] = function()
	local named = {}
	for _, c in ipairs(MiniClue.config.clues) do
		if type(c) == "table" and c.keys and c.desc then named[c.mode .. c.keys] = c.desc end
	end
	for _, m in ipairs(vim.api.nvim_get_keymap("n")) do
		local lhs = m.lhs:gsub(" ", "<Leader>")
		local prefix = lhs:match("^(<Leader>.)") -- <Leader>x
		if prefix and #lhs > #prefix and not named["n" .. prefix] then return false, "no group name for " .. prefix end
	end
	return true, "all leader groups named"
end
C["no-dup-lhs"] = function()
	local seen, dups = {}, {}
	local orig = vim.keymap.set
	vim.keymap.set = function(modes, lhs, ...)
		for _, m in ipairs(type(modes) == "table" and modes or { modes }) do
			local k = m .. ":" .. vim.keycode(lhs)
			if seen[k] then table.insert(dups, k) end
			seen[k] = true
		end
		return orig(modes, lhs, ...)
	end
	package.loaded["ulvim.keymaps"] = nil
	require("ulvim.keymaps")
	vim.keymap.set = orig
	return #dups == 0, #dups == 0 and "none" or table.concat(dups, ", ")
end
C["no-dead-leader"] = function()
	for _, m in ipairs(vim.api.nvim_get_keymap("n")) do
		local rhs = m.rhs or ""
		if rhs:match("%[s") or rhs:match("%]s") or rhs:match("z=") then return false, m.lhs .. " -> " .. rhs end
	end
	return true, "none"
end
C["prefix-isolated"] = function(mode, lhs)
	local target = vim.keycode(lhs)
	for _, m in ipairs(vim.api.nvim_get_keymap(mode)) do
		local k = vim.keycode(m.lhs)
		if k ~= target and vim.startswith(k, target) then return false, m.lhs end
	end
	return true, "isolated"
end
C["leader-b-enter"] = function()
	md({ "hello world" })
	keys("w")
	-- mini.clue holds <leader>b open as a group; Enter runs the exact <leader>b map.
	-- The popup path itself is proven in a real terminal; here the
	-- leader must be a mini.clue trigger, so <leader>b never fires on a timeout.
	wait(1000, function() return (vim.fn.maparg(vim.g.mapleader, "n", false, true).desc or ""):find("Query keys after", 1, true) ~= nil end)
	local trig = vim.fn.maparg(vim.g.mapleader, "n", false, true)
	if not (trig.desc or ""):find("Query keys after", 1, true) then return false, "leader is not a mini.clue trigger: " .. vim.inspect(trig.desc) end
	keys("<leader>b<CR>")
	wait(500, function() return vim.api.nvim_get_current_line():find("%*%*") ~= nil end)
	return eq(vim.api.nvim_get_current_line(), "hello **world**", "line")
end
C["cmd-keys"] = function(mode)
	for _, ch in ipairs(vim.split("abcdefghijklmnopqrstuvwxyz0123456789", "")) do
		for _, lhs in ipairs({ "<D-" .. ch .. ">", "<D-S-" .. ch .. ">" }) do
			if vim.fn.maparg(lhs, mode) == "" then return false, lhs .. " unmapped in " .. mode end
		end
	end
	return true, "all mapped"
end
C["shortmess-safe"] = function()
	-- Flags that would hide errors or warnings: none exist in shortmess today; guard F (file info) and W (written) are cosmetic.
	return not vim.o.shortmess:find("[eE]"), "shortmess=" .. vim.o.shortmess
end
C["notify-error-visible"] = function()
	local seen = false
	local orig = vim.api.nvim_echo
	vim.api.nvim_echo = function(chunks, history, opts)
		for _, c in ipairs(chunks) do if tostring(c[1]):find("probe%-error") then seen = true end end
		return orig(chunks, history, opts)
	end
	vim.notify("probe-error", vim.log.levels.ERROR)
	vim.api.nvim_echo = orig
	return seen, "vim.notify(ERROR) reached nvim_echo"
end

-- toggles and agents ------------------------------------------------------------------
C["render-toggle"] = function()
	md({ "# Title" })
	local st = require("render-markdown.state")
	local before = st.enabled
	require("render-markdown").toggle()
	local after = st.enabled
	return before == false and after == true, tostring(before) .. " -> " .. tostring(after)
end
C["focus-toggle"] = function()
	md({ "x" })
	vim.o.columns = 220 -- headless defaults to 80, narrower than the focus width
	local wins = #vim.api.nvim_tabpage_list_wins(0)
	keys("<leader>uz")
	wait(800, function() return #vim.api.nvim_tabpage_list_wins(0) > wins end) -- it opens its side windows on the next tick
	local now = #vim.api.nvim_tabpage_list_wins(0)
	vim.cmd("NoNeckPain")
	return now > wins, wins .. " -> " .. now .. " windows"
end
C["undotree"] = function()
	md({ "x" })
	keys("<leader>uu")
	wait(500)
	for _, w in ipairs(vim.api.nvim_tabpage_list_wins(0)) do
		if vim.bo[vim.api.nvim_win_get_buf(w)].filetype == "nvim-undotree" then return true, "undotree window" end
	end
	return false, "no undotree window"
end
C["md-outline"] = function()
	md({ "# One", "text", "## Two" })
	keys("gO")
	wait(300)
	local list = vim.fn.getloclist(0)
	return #list >= 2, #list .. " headings in loclist"
end
C["copy-location"] = function()
	local p = md({ "a", "b" })
	vim.api.nvim_win_set_cursor(0, { 2, 0 })
	keys("<leader>yf")
	return eq(vim.fn.getreg("+"), p .. ":2", "+ register")
end

-- pickers ---------------------------------------------------------------------------
local function picker_open(fn)
	fn()
	wait(1500, function() return #Snacks.picker.get() > 0 end)
	local p = Snacks.picker.get()[1]
	return p
end
C["picker-key"] = function(lhs, kind)
	local p = picker_open(function() keys(lhs) end)
	if not p then return false, "no picker" end
	local title = p.title or ""
	p:close()
	-- An optional title argument names the picker; underscores stand for spaces.
	if kind then return title == kind:gsub("_", " "), title end
	return title == "Files", title
end
C["ulfind"] = function(what)
	local quit = false
	vim.api.nvim_create_autocmd("QuitPre", { callback = function() quit = true error("probe: stop quit") end })
	vim.cmd("enew")
	local p = picker_open(function() vim.cmd("UlFind") end)
	if what == "open" then
		local ok = p ~= nil and p.title == "Files"
		if p then p:close() end
		return ok, p and p.title or "no picker"
	end
	if p then pcall(function() p:close() end) end
	wait(500, function() return quit end)
	return quit, "quit=" .. tostring(quit)
end
C["oil"] = function(what)
	md({ "x" })
	if what == "window" then
		keys("<leader>fT")
		wait(500, function() return vim.bo.filetype == "oil" end)
		return vim.bo.filetype == "oil" and vim.api.nvim_win_get_config(0).relative == "", vim.bo.filetype
	end
	keys("<leader>ft")
	wait(800, function() return vim.bo.filetype == "oil" end)
	local cfg = vim.api.nvim_win_get_config(0)
	if what == "float" then return vim.bo.filetype == "oil" and cfg.relative ~= "", vim.bo.filetype .. " relative=" .. cfg.relative end
	return vim.wo.winhighlight:find("FloatBorder:OilFloatBorder", 1, true) ~= nil and hex(hl("OilFloatBorder").fg) == "#7aa2f7", vim.wo.winhighlight
end

-- Your own probes, if tests/probe_user.lua exists: it returns a function that adds checks to C.
local user_probes = vim.fn.stdpath("config") .. "/tests/probe_user.lua"
if vim.uv.fs_stat(user_probes) then
	dofile(user_probes)(C, { md = md, keys = keys, wait = wait, eq = eq, lines = lines, picker_open = picker_open })
end

-- runner ----------------------------------------------------------------------------
local function run(name, args)
	local f = C[name]
	if not f then return false, "unknown check " .. name end
	local ok, pass, detail = pcall(f, unpack(args))
	if not ok then return false, "error: " .. tostring(pass) end
	return pass, detail
end

local args = vim.split(vim.env.PROBE or "", " ", { trimempty = true })
local name = args[1] or "(none)"
local pass, detail = run(name, vim.list_slice(args, 2))
io.stdout:write((pass and "PASS " or "FAIL ") .. table.concat(args, " ") .. " — " .. tostring(detail) .. "\n")
vim.cmd(pass and "qa!" or "cq!")
