-- The ranked file finder behind <C-Space>, <leader>ff and :UlFind.
--
-- What is searched: search-roots.local.json when it exists, else search-roots.json, indexed by scripts/search-index.ts into the
-- index file (one path per line). Opening the picker reads the last index at once and
-- rebuilds it in the background when it is stale.
--
-- How it ranks: fuzzy match quality plus open history. A file opened before gets a
-- bonus that fades the longer ago that was: v:oldfiles order, plus visit frecency from
-- the plain-text open history (autocmds.lua), never a binary store (ISC-108).
-- Change time was tried and measured worse: builds touch files nobody means.
-- Measured by tests/search_eval.lua, tuned on one half of the cases, reported on the other.
local adapter = require("ulvim.search.snacks_adapter")
local M = {}

local CONFIG = vim.fn.stdpath("config")
-- Your own roots go in search-roots.local.json (same shape), which wins when present.
local ROOTS_FILE = CONFIG .. "/search-roots.local.json"
if not vim.uv.fs_stat(ROOTS_FILE) then ROOTS_FILE = CONFIG .. "/search-roots.json" end
local cfg = vim.json.decode(table.concat(vim.fn.readfile(ROOTS_FILE), "\n"))
local function expand(list) return vim.tbl_map(vim.fn.expand, list or {}) end

M.config = cfg
M.roots = expand(vim.list_extend(vim.deepcopy(cfg.projects or {}), cfg.containers or {}))
M.excludes = cfg.excludes or {}
M.index = vim.env.SEARCH_INDEX or (vim.fn.stdpath("cache") .. "/search-index.txt")

-- Max bonus for the most recently opened file, in fuzzy-score points (a full-name
-- match scores ~300). Eval 2026-10-09: 15, 30 and 60 all took opened files from 91%
-- to 100% rank-1 with no loss on never-opened files; 15 is the smallest.
M.weight = tonumber(vim.env.SEARCH_W or "") or 15

local STALE_SECONDS = 300
local building = false

-- The indexer reports a failing tool on stderr ("search-index: fd failed ...") and still writes
-- what it found; it exits non-zero only when it could not build at all. Either way the picker
-- would quietly miss files, so one warning names the first failure.
local function report(res)
	local lines = vim.split(res.stderr or "", "\n", { trimempty = true })
	local first
	for _, l in ipairs(lines) do
		if l:find("failed", 1, true) then first = l; break end
	end
	if not first and res.code ~= 0 then first = lines[1] or ("exit " .. tostring(res.code)) end
	if not first then return end
	-- Scheduled: the background path calls this from a libuv callback, where notify may not run.
	vim.schedule(function()
		local code = res.code ~= 0 and (" (exit %s)"):format(tostring(res.code)) or ""
		vim.notify("File index: " .. first .. code, vim.log.levels.WARN)
	end)
end

function M.refresh(sync)
	if building then return end
	building = true
	local cmd = { "bun", CONFIG .. "/scripts/search-index.ts" }
	local opts = { env = { SEARCH_ROOTS = ROOTS_FILE, SEARCH_INDEX = M.index }, text = true }
	local function done(res)
		building = false
		report(res)
	end
	-- vim.system throws when bun is missing; that is reported the same way.
	local ok, err = pcall(function()
		if sync then
			done(vim.system(cmd, opts):wait())
		else
			vim.system(cmd, opts, done)
		end
	end)
	if not ok then done({ code = -1, stderr = "could not run bun: " .. tostring(err) }) end
end

local function ensure_index()
	local st = vim.uv.fs_stat(M.index)
	if not st then
		M.refresh(true)
	elseif os.time() - st.mtime.sec > STALE_SECONDS then
		M.refresh(false)
	end
end

-- 0..1 for each file opened: 1 for the latest, fading to 0.5 for the oldest oldfile.
local function open_history()
	local h, files = {}, vim.v.oldfiles
	for i, f in ipairs(files) do h[f] = 1 - 0.5 * (i - 1) / #files end
	return h
end

-- Visit frecency from the JSONL open history: each open counts w * 0.5^(age / 30 days),
-- w = 1 for a real open, or the carried-over score for lines seed-history.ts wrote.
local HALF_LIFE = 30 * 24 * 3600
local function visits()
	local path = vim.g.ulvim_open_history or (vim.fn.stdpath("state") .. "/open-history.jsonl")
	local ok, lines = pcall(vim.fn.readfile, path, "", -5000)
	local score, now = {}, os.time()
	if not ok then return score end
	for _, line in ipairs(lines) do
		local okj, e = pcall(vim.json.decode, line)
		if okj and type(e) == "table" and type(e.file) == "string" then score[e.file] = (score[e.file] or 0) + (e.w or 1) * 0.5 ^ ((now - (e.ts or now)) / HALF_LIFE) end
	end
	return score
end

local function finder(_, ctx)
	local history = open_history()
	local frecency = visits()
	return adapter.proc(
		ctx:opts({
			cmd = "cat",
			args = { M.index },
			notify = false,
			transform = function(item)
				item.file = item.text
				local opened = math.max(history[item.file] or 0, 1 - 1 / (1 + (frecency[item.file] or 0)))
				item.score_add = M.weight * opened
			end,
		}),
		ctx
	)
end

function M.smart(opts)
	ensure_index()
	return Snacks.picker.pick(vim.tbl_deep_extend("force", {
		source = "files",
		title = "Files",
		finder = finder,
		format = "file",
		matcher = { frecency = false, cwd_bonus = false, sort_empty = true },
		sort = { fields = { "score:desc", "#text", "idx" } },
	}, opts or {}))
end

-- Quit Neovim if the picker closes with no file opened (shell launchers).
function M.quit_if_empty()
	vim.defer_fn(function()
		if vim.api.nvim_buf_get_name(0) == "" then vim.cmd("qa!") end
	end, 100)
end

-- :UlFind, the shell's Ctrl-Space.
function M.launch() return M.smart({ on_close = M.quit_if_empty }) end

return M
