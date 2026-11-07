-- Autocmds: living next to agents, reopening where you left off, the yank flash, and
-- the plain-text open history.
local group = vim.api.nvim_create_augroup("ulvim", { clear = true })
local au = function(ev, opts) vim.api.nvim_create_autocmd(ev, vim.tbl_extend("force", { group = group }, opts)) end

-- Spell stays off everywhere; Neovim's default is off and nothing here turns it on.

-- Blue flash on yank (the color lives in colors.lua).
au("TextYankPost", { callback = function() vim.hl.on_yank({ higroup = "YankHighlight", timeout = 200 }) end })

-- Reopen a file on the line it was last left (ISC-43).
au("BufReadPost", {
	callback = function(ev)
		local ft = vim.bo[ev.buf].filetype
		if ft == "gitcommit" or vim.b[ev.buf].ulvim_last_loc then return end
		vim.b[ev.buf].ulvim_last_loc = true
		local mark = vim.api.nvim_buf_get_mark(ev.buf, '"')
		if mark[1] > 0 and mark[1] <= vim.api.nvim_buf_line_count(ev.buf) then pcall(vim.api.nvim_win_set_cursor, 0, mark) end
	end,
})

-- Remember the disk mtime each buffer last read or wrote, so auto-save can refuse to
-- write over a newer file an agent saved (ISC-90). A reload fires BufReadPost; a change
-- that was not reloaded (unsaved edits) must not refresh it.
au({ "BufReadPost", "BufWritePost" }, {
	callback = function(ev)
		local st = vim.uv.fs_stat(vim.api.nvim_buf_get_name(ev.buf))
		if st then vim.b[ev.buf].ulvim_mtime = st.mtime.sec end
	end,
})

-- Reload files changed on disk: on focus, after a terminal, and the moment a watched
-- file changes while its window is visible but unfocused (ISC-88, ISC-89, ISC-110).
au({ "FocusGained", "TermClose", "TermLeave" }, {
	callback = function()
		if vim.o.buftype ~= "nofile" then vim.cmd("checktime") end
	end,
})

local watchers = {}
local function watch(buf)
	local name = vim.api.nvim_buf_get_name(buf)
	if name == "" or vim.bo[buf].buftype ~= "" or watchers[buf] then return end
	local handle = vim.uv.new_fs_event()
	if not handle then return end
	local timer = vim.uv.new_timer()
	local ok = handle:start(name, {}, function()
		timer:stop()
		timer:start(100, 0, vim.schedule_wrap(function()
			if vim.api.nvim_buf_is_valid(buf) then vim.cmd("checktime " .. buf) end
			-- Editors and agents often replace the file (rename over it); re-arm on the new inode.
			if watchers[buf] then
				watchers[buf].handle:stop()
				watchers[buf] = nil
				watch(buf)
			end
		end))
	end)
	if ok then watchers[buf] = { handle = handle, timer = timer } else handle:close() timer:close() end
end
au({ "BufReadPost", "BufWritePost" }, { callback = function(ev) watch(ev.buf) end })
au({ "BufDelete", "BufWipeout" }, {
	callback = function(ev)
		local w = watchers[ev.buf]
		if w then
			w.handle:stop()
			w.timer:stop()
			watchers[ev.buf] = nil
		end
	end,
})

-- Create missing parent directories on write.
au("BufWritePre", {
	callback = function(ev)
		if ev.match:match("^%w%w+:[\\/][\\/]") then return end
		vim.fn.mkdir(vim.fn.fnamemodify(vim.uv.fs_realpath(ev.match) or ev.match, ":p:h"), "p")
	end,
})

-- q closes help, man, quickfix and similar windows.
au("FileType", {
	pattern = { "help", "man", "qf", "checkhealth", "lspinfo", "notify", "startuptime", "nvim-undotree", "nvim-pack" },
	callback = function(ev)
		vim.bo[ev.buf].buflisted = false
		vim.keymap.set("n", "q", "<Cmd>close<CR>", { buffer = ev.buf, silent = true, desc = "Close window" })
	end,
})

-- Secret files keep no persistent undo and no open-history line (ISC-171): .env, .env.*,
-- *.pem, *.key, ssh keys (id_*) and anything under the system temp dir. Neovim's own state
-- dir is exempt from the temp rule, since a home inside the temp dir keeps its files there.
local function real(path)
	local r = vim.uv.fs_realpath(path)
	if r then return r end
	local parent = vim.uv.fs_realpath(vim.fs.dirname(path)) -- a new file: resolve its folder
	return parent and vim.fs.joinpath(parent, vim.fs.basename(path)) or path
end
local function under(path, root) return root ~= "" and (path == root or vim.startswith(path, root .. "/")) end
local temp_roots = {}
for _, d in ipairs({ vim.uv.os_tmpdir() or "", "/tmp", "/var/tmp" }) do
	d = vim.fs.normalize(d):gsub("/+$", "")
	if d ~= "" then vim.list_extend(temp_roots, { d, real(d) }) end
end
local function is_secret(name)
	if name == "" then return false end
	local base = vim.fs.basename(name):lower()
	if base == ".env" or base:match("^%.env%.") or base:match("%.pem$") or base:match("%.key$") or base:match("^id_") then return true end
	local path = real(vim.fn.fnamemodify(name, ":p"))
	if under(path, real(vim.fn.stdpath("state"))) then return false end
	for _, root in ipairs(temp_roots) do
		if under(path, root) then return true end
	end
	return false
end
-- Before the buffer is read (when Neovim would load an undo file) and before any write
-- (when it would save one), and again when the buffer takes a new name.
au({ "BufReadPre", "BufNewFile", "BufFilePost", "BufWritePre" }, {
	callback = function(ev)
		if is_secret(vim.api.nvim_buf_get_name(ev.buf)) then vim.bo[ev.buf].undofile = false end
	end,
})

-- Plain-text open history, one JSON line per open, for picker ranking (ISC-107).
au("BufReadPost", {
	callback = function(ev)
		-- One line per buffer: a reload after an agent edits the file fires BufReadPost again,
		-- and that is not an open (change time measured worse as a ranking signal).
		if vim.b[ev.buf].ulvim_open_logged or vim.g.ulvim_open_history_readonly then return end
		local history = vim.g.ulvim_open_history or (vim.fn.stdpath("state") .. "/open-history.jsonl")
		local name = vim.api.nvim_buf_get_name(ev.buf)
		if name == "" or vim.bo[ev.buf].buftype ~= "" or is_secret(name) then return end
		-- System temp files are not worth ranking, unless they live in Neovim's own state dir
		-- (where a home under /private/var keeps its files).
		if not vim.startswith(name, vim.fn.stdpath("state")) and (name:match("^/private/") or name:match("^/tmp/")) then return end
		vim.b[ev.buf].ulvim_open_logged = true
		vim.fn.mkdir(vim.fs.dirname(history), "p")
		local fd = io.open(history, "a")
		if fd then
			fd:write(vim.json.encode({ ts = os.time(), file = name }) .. "\n")
			fd:close()
		end
	end,
})
