# Checks

Every behavior ULVim promises has a check, and this is the list. Each row is one check: what it
looks at, the result that counts as a pass, and the command that measures it.

- `bun tests/run.ts` runs them all.
- `bun tests/run.ts ISC-12` runs one (name several to run several).
- `bun tests/run.ts --unattended` skips the checks that need a live terminal.

Commands run from the repo root with `NVIM_APPNAME=ulvim`. This file is generated; do not edit it by hand.

| id | check | threshold | command |
|---|---|---|---|
| ISC-1 | clean headless start | 0 bytes stderr | `NVIM_APPNAME=ulvim nvim --headless +qa 2>&1 \| wc -c \| tr -d ' ' \| grep -qx 0` |
| ISC-2 | startup median | <= 303 ms | `bun tests/startup.ts --runs 5 --max 303` |
| ISC-3 | single install site | 1 call | `bun tests/static.ts single-pack-add` |
| ISC-4 | lockfile tracked | exit 0 | `git ls-files --error-unmatch nvim-pack-lock.json` |
| ISC-5 | no distro residue | 0 files | `bun tests/static.ts no-lazyvim` |
| ISC-6 | snacks internals behind one adapter | 0 other files | `bun tests/static.ts snacks-adapter-only` |
| ISC-7 | no blanket git add | 0 maps | `PROBE='no-git-add-all' nvim --headless +'luafile tests/probe.lua'` |
| ISC-9 | no Python files | 0 files | `bun tests/static.ts no-python-files` |
| ISC-10 | no Python calls | 0 files | `bun tests/static.ts no-python-calls` |
| ISC-11 | restart key | rhs contains restart | `PROBE='map n ZR restart' nvim --headless +'luafile tests/probe.lua'` |
| ISC-12 | wrap | true | `PROBE='opt-md wrap true' nvim --headless +'luafile tests/probe.lua'` |
| ISC-13 | linebreak | true | `PROBE='opt-md linebreak true' nvim --headless +'luafile tests/probe.lua'` |
| ISC-14 | breakindent | true | `PROBE='opt-md breakindent true' nvim --headless +'luafile tests/probe.lua'` |
| ISC-15 | conceal markup | 2 | `PROBE='opt-md conceallevel 2' nvim --headless +'luafile tests/probe.lua'` |
| ISC-16 | spell stays off | false after FileType, BufEnter, restart | `PROBE='spell-off' nvim --headless +'luafile tests/probe.lua'` |
| ISC-17 | no completion popup | pumvisible 0 | `PROBE='no-popup' nvim --headless +'luafile tests/probe.lua'` |
| ISC-18 | no completion plugin | 0 matches in lockfile | `bun tests/static.ts no-completion-plugin` |
| ISC-19 | jk insert | mode n | `PROBE='feed i jk mode n' nvim --headless +'luafile tests/probe.lua'` |
| ISC-20 | jk terminal | rhs <C-\><C-n> | `PROBE='map t jk' nvim --headless +'luafile tests/probe.lua'` |
| ISC-21 | jl insert | file written | `PROBE='map-rhs i jl <Esc>ZZ' nvim --headless +'luafile tests/probe.lua'` |
| ISC-22 | j and k never wait | 0 prefixes | `PROBE='no-jk-prefix' nvim --headless +'luafile tests/probe.lua'` |
| ISC-23 | em dash | line == — | `PROBE='feed i -- line —' nvim --headless +'luafile tests/probe.lua'` |
| ISC-24 | bold word | **word** | `PROBE='md-key n <leader>b **' nvim --headless +'luafile tests/probe.lua'` |
| ISC-25 | italic word | *word* | `PROBE='md-key n <leader>i *' nvim --headless +'luafile tests/probe.lua'` |
| ISC-26 | quote word | "word" | `PROBE='md-key n <leader>q "' nvim --headless +'luafile tests/probe.lua'` |
| ISC-27 | bold selection | trimmed | `PROBE='md-key x <leader>b **' nvim --headless +'luafile tests/probe.lua'` |
| ISC-28 | italic selection | trimmed | `PROBE='md-key x <leader>i *' nvim --headless +'luafile tests/probe.lua'` |
| ISC-29 | quote selection | trimmed | `PROBE='md-key x <leader>q "' nvim --headless +'luafile tests/probe.lua'` |
| ISC-30 | bullet continue | next line '- ' | `PROBE='list-continue bullet' nvim --headless +'luafile tests/probe.lua'` |
| ISC-31 | number continue | next line '2. ' | `PROBE='list-continue number' nvim --headless +'luafile tests/probe.lua'` |
| ISC-32 | surround add | text wrapped | `PROBE='surround add' nvim --headless +'luafile tests/probe.lua'` |
| ISC-33 | surround delete | markers gone | `PROBE='surround delete' nvim --headless +'luafile tests/probe.lua'` |
| ISC-34 | surround replace | markers swapped | `PROBE='surround replace' nvim --headless +'luafile tests/probe.lua'` |
| ISC-35 | md surround add | 3 of 3 | `PROBE='surround md-add' nvim --headless +'luafile tests/probe.lua'` |
| ISC-36 | md surround delete | 3 of 3 | `PROBE='surround md-delete' nvim --headless +'luafile tests/probe.lua'` |
| ISC-37 | whole-buffer object | buffer empty | `PROBE='feed n dig empty' nvim --headless +'luafile tests/probe.lua'` |
| ISC-38 | any-quote object | quote body replaced | `PROBE='textobj ciq' nvim --headless +'luafile tests/probe.lua'` |
| ISC-39 | pair insert | () | `PROBE='pairs open' nvim --headless +'luafile tests/probe.lua'` |
| ISC-40 | pair skip | one ) | `PROBE='pairs skip' nvim --headless +'luafile tests/probe.lua'` |
| ISC-41 | auto-save | disk matches buffer | `PROBE='autosave' nvim --headless +'luafile tests/probe.lua'` |
| ISC-42 | persistent undo | undo works after reopen | `PROBE='undofile' nvim --headless +'luafile tests/probe.lua'` |
| ISC-43 | last location | cursor line restored | `PROBE='last-loc' nvim --headless +'luafile tests/probe.lua'` |
| ISC-45 | picker key 1 | ranked picker open | `PROBE='picker-key <C-Space>' nvim --headless +'luafile tests/probe.lua'` |
| ISC-46 | picker key 2 | ranked picker open | `PROBE='picker-key <leader>ff' nvim --headless +'luafile tests/probe.lua'` |
| ISC-47 | shell entry | ranked picker open | `PROBE='ulfind open' nvim --headless +'luafile tests/probe.lua'` |
| ISC-48 | shell entry cancel | nvim exits | `PROBE='ulfind cancel' nvim --headless +'luafile tests/probe.lua'` |
| ISC-50 | oil float | float with oil buffer | `PROBE='oil float' nvim --headless +'luafile tests/probe.lua'` |
| ISC-51 | oil border color | blue | `PROBE='oil border' nvim --headless +'luafile tests/probe.lua'` |
| ISC-52 | oil window | oil buffer, not float | `PROBE='oil window' nvim --headless +'luafile tests/probe.lua'` |
| ISC-53 | double space free | unmapped | `PROBE='unmapped n <leader><space>' nvim --headless +'luafile tests/probe.lua'` |
| ISC-55 | no hardcoded config path | 0 matches | `bun tests/static.ts no-config-path` |
| ISC-59 | no bare chrome open | 0 matches | `bun tests/static.ts no-bare-chrome` |
| ISC-69 | colorscheme | tokyonight-storm | `PROBE='colorscheme tokyonight-storm' nvim --headless +'luafile tests/probe.lua'` |
| ISC-70 | transparent | bg nil | `PROBE='hl-nobg Normal' nvim --headless +'luafile tests/probe.lua'` |
| ISC-71 | search blues | #1a3a9e / #7aa2f7 | `PROBE='search-blues' nvim --headless +'luafile tests/probe.lua'` |
| ISC-72 | border blue | #7aa2f7 | `PROBE='hl-fg FloatBorder #7aa2f7' nvim --headless +'luafile tests/probe.lua'` |
| ISC-73 | yank blue | #7aa2f7 | `PROBE='hl-bg YankHighlight #7aa2f7' nvim --headless +'luafile tests/probe.lua'` |
| ISC-74 | one color owner | 0 other files | `bun tests/static.ts one-color-owner` |
| ISC-75 | dashboard art | text present | `PROBE='dashboard art' nvim --headless +'luafile tests/probe.lua'` |
| ISC-76 | dashboard brand | logo label present | `PROBE='dashboard brand' nvim --headless +'luafile tests/probe.lua'` |
| ISC-77 | rounded floats | rounded | `PROBE='opt winborder rounded' nvim --headless +'luafile tests/probe.lua'` |
| ISC-78 | tab title | exact | `PROBE='opt titlestring' nvim --headless +'luafile tests/probe.lua'` |
| ISC-79 | clipboard yank | "+y | `PROBE='map-rhs nx <leader>y "+y' nvim --headless +'luafile tests/probe.lua'` |
| ISC-80 | clipboard yank line | "+Y | `PROBE='map-rhs n <leader>Y "+Y' nvim --headless +'luafile tests/probe.lua'` |
| ISC-81 | clipboard put | "+p | `PROBE='map-rhs nx <leader>p "+p' nvim --headless +'luafile tests/probe.lua'` |
| ISC-82 | clipboard put before | "+P | `PROBE='map-rhs nx <leader>P "+P' nvim --headless +'luafile tests/probe.lua'` |
| ISC-83 | key hints | popup window open | `PROBE='leader-popup' nvim --headless +'luafile tests/probe.lua'` |
| ISC-84 | group names | all named | `PROBE='leader-groups' nvim --headless +'luafile tests/probe.lua'` |
| ISC-85 | no shadowed keys | 0 duplicates | `PROBE='no-dup-lhs' nvim --headless +'luafile tests/probe.lua'` |
| ISC-86 | no dead keys | 0 dead | `PROBE='no-dead-leader' nvim --headless +'luafile tests/probe.lua'` |
| ISC-88 | reload on focus | buffer == disk | `PROBE='checktime FocusGained' nvim --headless +'luafile tests/probe.lua'` |
| ISC-89 | reload after terminal | buffer == disk | `PROBE='checktime TermLeave' nvim --headless +'luafile tests/probe.lua'` |
| ISC-90 | no clobber | disk keeps agent text | `PROBE='autosave-no-clobber' nvim --headless +'luafile tests/probe.lua'` |
| ISC-91 | cmd keys insert | 0 unmapped | `PROBE='cmd-keys i' nvim --headless +'luafile tests/probe.lua'` |
| ISC-92 | cmd keys cmdline | 0 unmapped | `PROBE='cmd-keys c' nvim --headless +'luafile tests/probe.lua'` |
| ISC-93 | cmd-z undo | rhs u | `PROBE='map-rhs n <D-z> u' nvim --headless +'luafile tests/probe.lua'` |
| ISC-95 | no silent reload over edits | buffer edits kept, warning shown | `PROBE='checktime-modified' nvim --headless +'luafile tests/probe.lua'` |
| ISC-99 | errors not muted | no E/W-hiding flags | `PROBE='shortmess-safe' nvim --headless +'luafile tests/probe.lua'` |
| ISC-100 | errors visible | visible message | `PROBE='notify-error-visible' nvim --headless +'luafile tests/probe.lua'` |
| ISC-106 | current stable | >= 0.12.6 | `bun tests/static.ts nvim-version 0.12.6` |
| ISC-107 | own open history | 1 line per open, 0 per reload | `PROBE='history-log' nvim --headless +'luafile tests/probe.lua'` |
| ISC-108 | plain-text ranking data | 0 binary reads | `bun tests/static.ts no-binary-history` |
| ISC-110 | file watcher | <= 1000 ms | `PROBE='fs-watch' nvim --headless +'luafile tests/probe.lua'` |
| ISC-111 | undo tree | Undotree window | `PROBE='undotree' nvim --headless +'luafile tests/probe.lua'` |
| ISC-112 | word diffs | contains inline:word | `PROBE='opt-has diffopt inline:word' nvim --headless +'luafile tests/probe.lua'` |
| ISC-114 | copy location | + register matches | `PROBE='copy-location' nvim --headless +'luafile tests/probe.lua'` |
| ISC-115 | no lazygit plugin | 0 in lockfile | `bun tests/static.ts no-lazygit-plugin` |
| ISC-116 | heading outline | loclist of headings | `PROBE='md-outline' nvim --headless +'luafile tests/probe.lua'` |
| ISC-117 | ui2 on | enabled | `PROBE='ui2-enabled' nvim --headless +'luafile tests/probe.lua'` |
| ISC-119 | no noice | 0 in lockfile | `bun tests/static.ts no-noice` |
| ISC-120 | screen-line motion | rhs gj/gk | `PROBE='jk-screenlines' nvim --headless +'luafile tests/probe.lua'` |
| ISC-121 | contractions safe | don't | `PROBE='pairs contraction' nvim --headless +'luafile tests/probe.lua'` |
| ISC-122 | render toggle | toggles on/off | `PROBE='render-toggle' nvim --headless +'luafile tests/probe.lua'` |
| ISC-123 | focus toggle | layout centered | `PROBE='focus-toggle' nvim --headless +'luafile tests/probe.lua'` |
| ISC-124 | word count | N words | `PROBE='statusline-words' nvim --headless +'luafile tests/probe.lua'` |
| ISC-125 | maintained key hints | 0 which-key | `bun tests/static.ts no-which-key` |
| ISC-126 | fresh plugins | 0 unexplained | `bun tests/plugin_freshness.ts` |
| ISC-127 | buffer back | bprevious | `PROBE='map n <S-h> bprevious' nvim --headless +'luafile tests/probe.lua'` |
| ISC-128 | buffer forward | bnext | `PROBE='map n <S-l> bnext' nvim --headless +'luafile tests/probe.lua'` |
| ISC-129 | buffer tabs | names shown | `PROBE='tabline-buffers' nvim --headless +'luafile tests/probe.lua'` |
| ISC-132 | bold behind the b group | **word** | `PROBE='leader-b-enter' nvim --headless +'luafile tests/probe.lua'` |
| ISC-133 | absolute numbers only | false | `PROBE='opt relativenumber false' nvim --headless +'luafile tests/probe.lua'` |
| ISC-134 | statusline look | lualine active | `PROBE='lualine' nvim --headless +'luafile tests/probe.lua'` |
| ISC-135 | no flash | 0 in lockfile | `bun tests/static.ts no-flash` |
| ISC-136 | scroll margin | 12 | `PROBE='opt scrolloff 12' nvim --headless +'luafile tests/probe.lua'` |
| ISC-137 | leader chord time | 1000 | `PROBE='opt timeoutlen 1000' nvim --headless +'luafile tests/probe.lua'` |
| ISC-141 | no purple | 0 groups | `PROBE='no-purple' nvim --headless +'luafile tests/probe.lua'` |
| ISC-142 | visual blue | #283c86 | `PROBE='hl-bg Visual #283c86' nvim --headless +'luafile tests/probe.lua'` |
| ISC-143 | pinned upstream nvim | path and version match | `bun tests/neovim_pin.ts path` |
| ISC-144 | checksum enforced | tampered copy refused | `bun tests/neovim_pin.ts tamper` |
| ISC-147 | stale node text | empty text, no error | `PROBE='stale-node-text' nvim --headless +'luafile tests/probe.lua'` |
| ISC-148 | shell layer defines the set | 11 names, no others, targets exist | `bun tests/shell.ts defines` |
| ISC-149 | shell layer reaches only the link | 0 repo paths, 0 requires | `bun tests/shell.ts reach` |
| ISC-150 | install in a fresh home | links + 1 source line, rerun no-op | `bun tests/shell.ts install` |
| ISC-151 | existing config kept | refused, untouched | `bun tests/shell.ts refuse` |
| ISC-152 | check is read-only | 6 steps, 0 changes | `bun tests/shell.ts check` |
| ISC-153 | agent install doc | outcome, command, check, refusals | `bun tests/shell.ts doc` |
| ISC-167 | index builds in a sparse home | 4 of 4 files, with and without fd, 0 duplicates | `bun tests/search_index.ts` |
| ISC-170 | no HTTP-serving plugin | 0 in lockfile and keymaps | `bun tests/static.ts no-live-preview` |
| ISC-171 | secrets keep no undo or history | undofile off, 0 history lines | `PROBE='secret-no-undo' nvim --headless +'luafile tests/probe.lua'` |
| ISC-172 | wrap keys are literal | control bytes wrapped as text | `PROBE='wrap-literal' nvim --headless +'luafile tests/probe.lua'` |
| ISC-173 | CI actions pinned by SHA | 0 tag pins | `bun tests/ci_pins.ts` |
