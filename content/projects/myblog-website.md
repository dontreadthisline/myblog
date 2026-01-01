+++
title = "MyBlog Website"
date = 2026-01-01
draft = false
+++

# MyBlog Website Project

A personal blog website built with Zola static site generator and the Neovim theme.

## Project Overview

This project showcases how to build a fast, keyboard-navigable blog using modern static site generation techniques.

## Technologies Used

- **Zola**: Static site generator written in Rust
- **Neovim Theme**: Keyboard-driven terminal-inspired theme
- **Sass**: CSS preprocessor for styling
- **JavaScript**: For interactive keyboard navigation
- **Markdown**: Content authoring

## Features

### 1. Keyboard Navigation
- Vim-like keybindings for browsing
- Tab-based navigation system
- Modal dialogs for commands

### 2. Performance Optimizations
- Static HTML generation
- Minimal JavaScript footprint
- Optimized asset loading

### 3. Developer Experience
- Live reload during development
- Simple markdown-based content
- Easy theme customization

## Project Structure

```
myblog/
├── config.toml
├── content/
│   ├── blogs/
│   └── projects/
├── themes/
│   └── neovim-theme/
└── static/
    └── assets/
```

## Installation & Setup

```bash
# Clone the repository
git clone https://github.com/username/myblog.git

# Install Zola
# See https://www.getzola.org/documentation/getting-started/installation/

# Serve locally
zola serve

# Build for production
zola build
```

## Customization

The theme can be customized through:

1. **config.toml**: Site-wide configuration
2. **Sass files**: Color schemes and styling
3. **JavaScript files**: Keyboard behavior
4. **Template files**: HTML structure

## Future Enhancements

- [ ] Add search functionality
- [ ] Implement dark/light mode toggle
- [ ] Add RSS feed generation
- [ ] Integrate comment system

## License

This project is open source and available under the MIT License.

## Links

- [Live Demo](https://example.com)
- [GitHub Repository](https://github.com/username/myblog)
- [Zola Documentation](https://www.getzola.org/documentation/)
