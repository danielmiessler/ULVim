-- The stable surface for callers outside Neovim (the shell's fzp and Ctrl-Space, launchers).
-- They run `nvim +UlFind` and never require an internal module.
local cmd = vim.api.nvim_create_user_command

cmd("UlFind", function() require("ulvim.search").launch() end, { desc = "Ranked file finder; quits Neovim if cancelled" })
-- Muscle memory from older plugin managers: :Lazy sync / :Lazy update open
-- vim.pack's update review, where :write applies it and :quit discards it.
cmd("Lazy", function() vim.pack.update() end, { nargs = "*", desc = "Review plugin updates (vim.pack)" })
-- :UlTheme opens the theme picker, which previews as you move; :UlTheme <name> switches and saves (ISC-186).
cmd("UlTheme", function(o)
	local colors = require("ulvim.colors")
	if o.args == "" then colors.pick() else colors.apply(o.args, { persist = true }) end
end, { nargs = "?", complete = function(lead) return vim.tbl_filter(function(n) return vim.startswith(n, lead) end, require("ulvim.colors").order) end, desc = "Pick or set the color theme" })
