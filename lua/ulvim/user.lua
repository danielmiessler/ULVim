-- Your own layer on top of ULVim. If lua/user/init.lua exists in the config folder, it is
-- required once, during plugin setup (the key hints and the start screen read it), and should
-- return a table with any of:
--   clues          extra key-hint entries; one with the same mode and keys replaces ULVim's
--   dashboard_keys extra start-screen keys, shown before Quit
--   setup()        called last, from init.lua after everything else: your keymaps, commands,
--                  plugin overrides
-- A layer that fails to load, or whose setup() fails, is reported as an error and skipped, and
-- ULVim keeps working without it; a layer that returns something other than a table is reported
-- as a warning. With no lua/user/, ULVim is the whole config.
local M = { spec = {} }

-- Scheduled so the message lands after startup, where ui2 shows it, instead of during it.
local function report(msg, level)
	vim.schedule(function() vim.notify("ULVim: " .. msg, level) end)
end

local init = vim.fn.stdpath("config") .. "/lua/user/init.lua"
if vim.uv.fs_stat(init) then
	local ok, spec = pcall(require, "user")
	if not ok then
		report("your layer in lua/user/ failed to load and was skipped:\n" .. tostring(spec), vim.log.levels.ERROR)
	elseif type(spec) == "table" then
		M.spec = spec
	else
		report(("lua/user/init.lua returned %s, not a table; its clues, dashboard_keys and setup() are ignored"):format(type(spec)), vim.log.levels.WARN)
	end
end

-- ULVim's clue list with the layer's entries applied (same mode and keys replace).
function M.clues(base)
	local out = vim.deepcopy(base)
	for _, c in ipairs(M.spec.clues or {}) do
		local replaced = false
		for i, b in ipairs(out) do
			if type(b) == "table" and b.mode == c.mode and b.keys == c.keys then
				out[i], replaced = c, true
			end
		end
		if not replaced then table.insert(out, c) end
	end
	return out
end

function M.setup()
	if type(M.spec.setup) ~= "function" then return end
	local ok, err = pcall(M.spec.setup)
	if not ok then report("your layer's setup() failed partway:\n" .. tostring(err), vim.log.levels.ERROR) end
end

return M
