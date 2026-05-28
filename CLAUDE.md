# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

- `zola serve` - Development server with live reload
- `zola build` - Production build to `public/`
- `zola check` - Validate site without building

## Architecture

This is a Zola static site (v0.21.0) deployed to Netlify. The theme is a custom neovim-inspired keyboard-driven UI (`themes/neovim-theme/`).

**Content structure** (`content/`):
- `blogs/` - Blog posts (sorted by date, paginated)
- `lessons/` - Learning notes (courses, papers, projects)
- `projects/` - Project pages
- `readme.md` - Home page
- Each section has an `_index.md` with TOML frontmatter for metadata (sort_by, paginate_by)

**Theme architecture** (`themes/neovim-theme/`):
- `templates/` - Tera templates. `base.html` is the shell; `index.html` is the homepage; `section.html` renders section listings; `page.html` renders individual pages; `components/` holds files sidebar, prompt bar, and tab bar
- `static/js/` - Keyboard-driven SPA layer. `index.js` inits cookie-backed state (tabs, config, focus); `keyboard.js` handles vim-style keybindings; `commands.js` dispatches commands returning `{type, message}`; `tab.js` manages tab state; `prompt.js` handles the command prompt; `config.js` applies user config
- `sass/css/` - `base.scss` and `page.scss`, compiled by Zola (`compile_sass = true`)

**Config** (`config.toml`):
- `extra.config_js` and `extra.custom_css` load custom JS/CSS from `static/` on top of theme defaults
- `extra.background_image` sets the terminal background
- Markdown highlighting is disabled (`highlight_code = false`)

**Deployment**: Netlify builds with `zola build`, publishing `public/`. Zola version pinned in `netlify.toml`.
