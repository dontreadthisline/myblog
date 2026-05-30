+++
title = "easy-img-claude"
date = 2026-05-30
draft = false
+++

# easy-img-claude

让非视觉模型在 Claude Code 中"看到"图片 -- Image-to-text bridge for non-vision LLMs.

## Project Overview

`img2text` 是一个 Python CLI 工具，解决了一个实际问题：Claude Code 用户使用不支持图片的非视觉模型（如 DeepSeek）时，无法查看截图、照片等图片内容。通过在 UserPromptSubmit hook 阶段自动拦截图片并调用视觉模型转换为文本描述，非视觉模型也能间接"看到"图片。

支持 **9 种后端**：Qwen (通义千问)、Zhipu (智谱)、Moonshot、Stepfun、OpenAI 兼容 API，以及本地部署的 Ollama、vLLM、llama.cpp (server + SDK)、MLX (macOS)。自动检测可用的后端，零配置上手。

## Technologies Used

- **Python 3.10+**: Core language
- **Click**: CLI framework
- **httpx**: HTTP client for API backends
- **PyYAML**: Configuration file management
- **llama-cpp-python**: llama.cpp SDK mode (in-process inference)
- **vLLM / MLX / Ollama**: Optional local inference backends
- **Astro + Starlight**: Documentation site
- **Catppuccin**: Docs theme

## Features

### 1. 多后端自动检测

运行 `img2text list-backends` 一键查看所有后端的可用状态。通过环境变量自动发现已配置的 API Key 和本地服务端口，无需手动指定。

### 2. Claude Code Hook 集成

配置 UserPromptSubmit hook 后，用户在 Claude Code 中粘贴图片（Ctrl+V）或 `@path` 引用图片时，自动调用视觉模型转换为文本，无感嵌入对话上下文。

### 3. 双质量模式

- **fast**: 快速模式，适合一般场景
- **detailed**: 详细模式，提取更多图片细节

### 4. 本地优先架构

优先使用本地部署的推理服务（Ollama、vLLM、llama.cpp），数据不出本机，适合隐私敏感场景。

### 5. 模型下载

内置 `download-model` 命令，支持从 HuggingFace Hub 下载 MLX、vLLM 或 GGUF 格式的视觉模型，支持 HF 镜像加速。

## Project Structure

```
easy-img-claude/
├── src/img2text/
│   ├── cli.py              # Click CLI (convert, config, list-backends, download-model, hook-run)
│   ├── converter.py         # Core conversion logic with fast/detailed modes
│   ├── detector.py          # Backend auto-detection (env vars + port probing)
│   ├── hook.py              # Claude Code UserPromptSubmit hook handler
│   ├── config.py            # YAML config read/write (~/.config/img2text/config.yaml)
│   ├── providers.py         # Provider metadata and port probing utilities
│   ├── image_utils.py       # Image file detection and validation
│   └── backends/
│       ├── base.py           # Base adapter class
│       ├── openai_compat.py  # OpenAI-compatible API adapter (covers most backends)
│       ├── mlx.py            # macOS MLX native inference
│       └── llamacpp_sdk.py   # llama.cpp in-process inference via llama-cpp-python
├── docs/                    # Astro/Starlight documentation site
├── astro.config.mjs         # Astro config (base: /easy-img-claude/)
├── pyproject.toml           # Python project config (hatchling build, uv environments)
└── config.yaml              # User config reference
```

## Installation & Setup

```bash
# macOS (MLX + Ollama + API backends)
uv tool install git+https://github.com/dontreadthisline/easy-img-claude.git \
  --with mlx --with mlx-lm --with mlx-vlm

# Linux (vLLM + Ollama + API backends)
uv tool install git+https://github.com/dontreadthisline/easy-img-claude.git --with vllm

# 验证安装
img2text --help
img2text list-backends
```

配置 Claude Code hook（`~/.claude/settings.json`）：

```json
{
  "UserPromptSubmit": [
    {
      "matcher": "*",
      "hooks": [
        {
          "type": "command",
          "command": "img2text hook-run"
        }
      ]
    }
  ]
}
```

## Links

- [Documentation](https://dontreadthisline.github.io/easy-img-claude/)
- [GitHub Repository](https://github.com/dontreadthisline/easy-img-claude)
