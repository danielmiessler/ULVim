# Security

## Reporting a vulnerability

Report it privately through GitHub's private vulnerability reporting: open this repository's **Security** tab and choose **Report a vulnerability**. The report stays between you and the maintainers until a fix is out.

Please don't open a public issue, pull request or discussion for a security problem.

A useful report says what is affected, how to reproduce it, and what an attacker gains. A proof of concept helps; it doesn't need to be polished.

## Scope

In scope is everything this repository ships:

- the Neovim configuration (`init.lua` and everything under `lua/`)
- the installers (`scripts/install.ts` and `scripts/nvim-install.ts`, including the checksum check on the Neovim download)
- the scripts and the shell layer (`scripts/`, `shell/ulvim.zsh`)
- the CI workflow under `.github/workflows/`

Out of scope: bugs in Neovim itself or in the third-party plugins ULVim installs. Report those to their own projects. If ULVim's configuration makes one of them exploitable, that part is in scope here.

## What happens next

Every report gets a reply. You'll be told whether it is accepted, what the fix is, and when it ships. Credit in the release notes is yours if you want it.

## Supported versions

Fixes land on the `main` branch. There are no maintained older releases.
