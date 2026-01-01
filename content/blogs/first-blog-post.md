+++
title = "Getting Started"
date = 2026-01-01
draft = false
+++

# Getting Started with Zola

Zola is a fast static site generator written in Rust. It's designed to be simple, fast, and flexible.

## Why Zola?

1. **Blazing Fast**: Written in Rust, Zola compiles sites in milliseconds
2. **No Dependencies**: Single binary, no Node.js or Ruby required
3. **Simple Configuration**: TOML-based configuration that's easy to understand
4. **Powerful Templating**: Uses Tera templating engine with inheritance

## Basic Commands

```bash
# Build the site
zola build

# Serve with live reload
zola serve

# Check for errors
zola check
```

## Front Matter

Zola uses TOML front matter to define page metadata:

```toml
+++
title = "My Page"
date = 2026-01-01
draft = false
+++
```

## Content Organization

- Content goes in the `content/` directory
- Each section has an `_index.md` file
- Pages are regular markdown files
- Templates are in the `templates/` directory

## Conclusion

Zola is an excellent choice for developers who want a fast, simple static site generator without the complexity of larger frameworks.
