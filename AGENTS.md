# AGENTS.md - Zola Static Site Generator

## Build Commands
- `zola build` - Build the static site
- `zola serve` - Start development server with live reload
- `zola check` - Validate site without building
- `zola --help` - Show all available commands

## Project Structure
- Uses Zola static site generator with neovim-theme
- Content in `content/` directory
- Theme in `themes/neovim-theme/`
- Static assets in `static/`
- Sass compilation enabled in config.toml

## Code Style Guidelines
- **HTML/Templates**: Use Zola Tera templating syntax in `themes/neovim-theme/templates/`
- **JavaScript**: Modular ES6 in `themes/neovim-theme/static/js/` with keyboard-driven UI
- **CSS/Sass**: Use Sass with `.scss` files in `themes/neovim-theme/sass/css/`
- **Configuration**: TOML format for `config.toml` and theme configuration
- **Naming**: Lowercase with hyphens for files, camelCase for JavaScript
- **Error Handling**: JavaScript commands return `{type: "success"/"error", message: string}`

## Theme Customization
- Custom JavaScript config via `config_js` in config.toml
- Custom CSS via `custom_css` in config.toml
- Background images in `static/assets/`
- Fonts in `static/` directory

## Development Workflow
1. Edit content in `content/` or theme files
2. Run `zola serve` for live preview
3. Run `zola build` for production
4. Deploy generated `public/` directory