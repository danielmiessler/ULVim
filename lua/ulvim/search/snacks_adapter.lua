-- The only file allowed to touch snacks' private picker internals (ISC-6). snacks is
-- pinned in nvim-pack-lock.json; a bump passes tests/search_eval.lua before it lands.
local M = {}

-- Streams `cmd args` lines into picker items.
function M.proc(opts, ctx) return require("snacks.picker.source.proc").proc(opts, ctx) end

return M
