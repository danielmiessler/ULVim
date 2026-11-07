-- Every keymap in one place, each one proven by a probe (CHECKS.md). Your own keys go in
-- lua/user/ (see lua/ulvim/user.lua).
local map = vim.keymap.set
local search = require("ulvim.search")

-- Escapes and exits.
map("i", "jk", "<Esc>", { desc = "Escape" })
map("t", "jk", [[<C-\><C-n>]], { desc = "Leave terminal insert" })
map("i", "jl", "<Esc>ZZ", { desc = "Escape, save and quit" })
-- No normal-mode jl: any normal map starting with j makes every j wait timeoutlen (ISC-22). ZZ does it there.
map("i", "<C-c>", "<Esc>")
map("n", "<Esc>", "<Cmd>nohlsearch<CR><Esc>", { desc = "Clear search highlight" })
map("n", "ZR", "<Cmd>restart<CR>", { desc = "Restart Neovim, keeping the session" })
map({ "n", "i", "x" }, "<C-s>", "<Cmd>write<CR><Esc>", { desc = "Save" })

-- Wrapped prose moves by screen line unless a count is given.
map({ "n", "x" }, "j", "v:count == 0 ? 'gj' : 'j'", { expr = true, desc = "Down (screen line)" })
map({ "n", "x" }, "k", "v:count == 0 ? 'gk' : 'k'", { expr = true, desc = "Up (screen line)" })

-- Undo breakpoints at punctuation, so one u never erases a whole paragraph.
for _, p in ipairs({ ",", ".", ";", "!", "?" }) do map("i", p, p .. "<C-g>u") end

-- Buffers, shown as tabs.
map("n", "<S-h>", "<Cmd>bprevious<CR>", { desc = "Previous buffer" })
map("n", "<S-l>", "<Cmd>bnext<CR>", { desc = "Next buffer" })
map("n", "<leader>bd", function() Snacks.bufdelete() end, { desc = "Delete buffer" })
map("n", "<leader>ha", "<C-^>", { desc = "Alternate file" })

-- System clipboard only on purpose (clipboard="" otherwise).
map({ "n", "x" }, "<leader>y", [["+y]], { desc = "Yank to clipboard" })
map("n", "<leader>Y", [["+Y]], { desc = "Yank line to clipboard" })
map({ "n", "x" }, "<leader>p", [["+p]], { desc = "Put from clipboard" })
map({ "n", "x" }, "<leader>P", [["+P]], { desc = "Put before from clipboard" })
map("n", "<leader>yy", "<Cmd>%y+<CR>", { desc = "Yank buffer to clipboard" })
map("n", "<leader>dd", "<Cmd>%d<CR>i", { desc = "Delete buffer text, insert" })
map("n", "<leader>yf", function()
	local loc = vim.fn.expand("%:p") .. ":" .. vim.fn.line(".")
	vim.fn.setreg("+", loc)
	vim.notify("Copied " .. loc)
end, { desc = "Copy path:line" })

-- Typography and markdown emphasis.
map("i", "--", "—", { desc = "Em dash" })
local function wrap_word(mark)
	return function() vim.cmd("normal! ciw" .. mark .. vim.fn.expand("<cword>") .. mark) end
end
-- The selection is read and rewritten as buffer text, never typed through a command string,
-- so control bytes or key notation in it stay literal (ISC-172). Edge whitespace stays
-- outside the markers (ISC-27..29); a block selection wraps each row on its own.
local function wrap_range(sr, sc, er, ec, mark) -- 0-based, end exclusive
	local text = table.concat(vim.api.nvim_buf_get_text(0, sr, sc, er, ec, {}), "\n")
	local lead, body, trail = text:match("^(%s*)(.-)(%s*)$")
	if body == "" then return nil end
	local new = vim.split(lead .. mark .. body .. mark .. trail, "\n", { plain = true })
	vim.api.nvim_buf_set_text(0, sr, sc, er, ec, new)
	return { sr + #new - 1, (#new == 1 and sc or 0) + #new[#new] } -- just past the new text
end
local function wrap_selection(mark)
	return function()
		local mode = vim.fn.mode()
		local segs = vim.fn.getregionpos(vim.fn.getpos("v"), vim.fn.getpos("."), { type = mode })
		vim.api.nvim_feedkeys(vim.keycode("<Esc>"), "nx", false)
		-- getregionpos gives 1-based byte columns, the end on the last character's first byte.
		local function start(pos) return math.min(math.max(pos[3] - 1, 0), #vim.fn.getline(pos[2])) end
		local function stop(pos)
			local line = vim.fn.getline(pos[2])
			local c = pos[3]
			if c <= 0 or #line == 0 then return 0 end
			if c >= #line then return #line end
			return c + vim.str_utf_end(line, c)
		end
		local ranges = {}
		if mode == "\22" then
			for _, s in ipairs(segs) do table.insert(ranges, { s[1][2] - 1, start(s[1]), s[2][2] - 1, stop(s[2]) }) end
		elseif #segs > 0 then
			local first, last = segs[1][1], segs[#segs][2]
			table.insert(ranges, { first[2] - 1, start(first), last[2] - 1, stop(last) })
		end
		local cursor
		for i = #ranges, 1, -1 do -- bottom up, so earlier ranges keep their positions
			local r = ranges[i]
			if r[1] < r[3] or r[2] < r[4] then cursor = wrap_range(r[1], r[2], r[3], r[4], mark) or cursor end
		end
		if cursor then
			local len = #vim.fn.getline(cursor[1] + 1)
			pcall(vim.api.nvim_win_set_cursor, 0, { cursor[1] + 1, math.max(math.min(cursor[2], len - 1), 0) })
		end
	end
end
for key, mark in pairs({ b = "**", i = "*", q = '"' }) do
	map("n", "<leader>" .. key, wrap_word(mark), { desc = "Wrap word in " .. mark })
	map("x", "<leader>" .. key, wrap_selection(mark), { desc = "Wrap selection in " .. mark })
end

-- Find.
map("n", "<C-Space>", function() search.smart() end, { desc = "Find files (ranked)" })
map("n", "<leader>ff", function() search.smart() end, { desc = "Find files (ranked)" })
map("n", "<leader>ft", function() require("oil").open_float() end, { desc = "File tree (float)" })
map("n", "<leader>fT", "<Cmd>Oil<CR>", { desc = "File tree (window)" })

-- Images.
map("n", "<leader>ii", "<Cmd>PasteImage<CR>", { desc = "Paste image" })

-- Toggles.
map("n", "<leader>uu", function()
	vim.cmd.packadd("nvim.undotree")
	vim.cmd("Undotree")
end, { desc = "Undo tree" })
map("n", "<leader>um", function() require("render-markdown").toggle() end, { desc = "Render markdown" })
map("n", "<leader>uz", "<Cmd>NoNeckPain<CR>", { desc = "Focus layout" })

-- Mac Cmd keys: undo and redo work; any other Cmd chord never types into the buffer
-- (an unmapped Cmd chord would otherwise insert its literal key name, such as `<D-z>`).
map({ "n", "x" }, "<D-S-z>", "<C-r>", { desc = "Redo" }) -- <D-Z> is the same key to Neovim
map("i", "<D-S-z>", "<C-o><C-r>", { desc = "Redo" })
map({ "n", "x" }, "<D-z>", "u", { desc = "Undo" })
map("i", "<D-z>", "<C-o>u", { desc = "Undo" })
for _, ch in ipairs(vim.split("abcdefghijklmnopqrstuvwxyz0123456789[];',./`-=", "")) do
	for _, lhs in ipairs({ "<D-" .. ch .. ">", "<D-S-" .. ch .. ">" }) do
		for _, mode in ipairs({ "i", "c" }) do
			if vim.fn.maparg(lhs, mode) == "" then map(mode, lhs, "<Nop>") end
		end
	end
end
