-- Syntax: tree-sitter parsers for the languages a writer and programmer reads most. nvim-treesitter (main) builds them and owns their queries, which also
-- hide a markdown fence's ``` lines and color the code inside by its language (ISC-98).
-- A missing parser is built in the background on first start; building needs the
-- tree-sitter CLI and a C compiler.
local ts = require("nvim-treesitter")
ts.setup({})

local wanted = {
	"bash", "c", "diff", "dtd", "html", "javascript", "jsdoc", "json", "lua", "luadoc", "luap",
	"markdown", "markdown_inline", "printf", "python", "query", "regex", "toml", "tsx",
	"typescript", "vim", "vimdoc", "xml", "yaml",
}
local have = ts.get_installed()
local missing = vim.tbl_filter(function(p) return not vim.list_contains(have, p) end, wanted)
if #missing > 0 then ts.install(missing) end

-- Guard for neovim/neovim#38303 (open; fix PR #38613 closed unmerged): when the buffer changes
-- while the highlighter is mid-pass, a node's range can point past the end of the buffer, and
-- the injection predicates' get_node_text raises "Index out of bounds" on every redraw (seen in a
-- markdown buffer, 2026-11-05). A stale node's text is empty instead; the next parse is correct.
-- Predicates look this function up at call time, so the wrapper reaches them (ISC-147).
-- Remove when a pinned release carries the upstream fix.
local get_node_text = vim.treesitter.get_node_text
vim.treesitter.get_node_text = function(node, source, opts)
	local ok, text = pcall(get_node_text, node, source, opts)
	if ok then return text end
	if type(text) == "string" and text:find("Index out of bounds", 1, true) then return "" end
	error(text, 0)
end

-- Neovim starts highlighting on its own only for its bundled languages; this starts it for
-- every buffer whose filetype has a parser.
vim.api.nvim_create_autocmd("FileType", {
	group = vim.api.nvim_create_augroup("ulvim_treesitter", { clear = true }),
	callback = function(ev) pcall(vim.treesitter.start, ev.buf) end,
})
