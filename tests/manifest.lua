-- Dumps the observable surface of whatever config Neovim started with, as JSON on stdout:
-- keymaps (every mode), options that differ from Neovim's defaults, autocmd groups,
-- user commands and highlight groups. Run after startup settles:
--   NVIM_APPNAME=<app> nvim --headless +'lua vim.defer_fn(function() dofile("tests/manifest.lua") end, 1500)'
local out = { keymaps = {}, options = {}, augroups = {}, commands = {}, highlights = {} }

for _, mode in ipairs({ "n", "x", "s", "o", "i", "c", "t" }) do
	for _, m in ipairs(vim.api.nvim_get_keymap(mode)) do
		if not m.lhs:match("^<Plug>") and not m.lhs:match("^<SNR>") then
			local lhs = m.lhs:gsub("^ ", "<leader>"):gsub(" ", "<Space>")
			out.keymaps[mode .. " " .. lhs] = m.desc or m.rhs or "<lua>"
		end
	end
end

local skip = { columns = true, lines = true, shell = true, runtimepath = true, packpath = true, ttyfast = true, scroll = true, window = true, shadafile = true, term = true, termguicolors = false }
for name, info in pairs(vim.api.nvim_get_all_options_info()) do
	if not skip[name] and info.scope ~= "buf" or name == "expandtab" or name == "tabstop" or name == "shiftwidth" then
		local ok, val = pcall(function() return vim.o[name] end)
		if ok and info.default ~= nil and val ~= info.default and type(val) ~= "table" then out.options[name] = tostring(val) end
	end
end

for _, a in ipairs(vim.api.nvim_get_autocmds({})) do
	if a.group_name then out.augroups[a.group_name] = true end
end
for name in pairs(vim.api.nvim_get_commands({})) do out.commands[name] = true end
for name in pairs(vim.api.nvim_get_hl(0, {})) do out.highlights[name] = true end

io.stdout:write(vim.json.encode(out))
vim.cmd("qa!")
