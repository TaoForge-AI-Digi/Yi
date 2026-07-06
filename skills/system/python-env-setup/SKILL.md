---
name: python-env-setup
description: 为 Python 项目自动检测环境需求并安装依赖，支持 uv/venv/pip 多种方案
tags: ["python", "setup", "environment"]
version: 1.0.0
author: Master Yi
---

# Python Environment Setup

## 目标
为一个 Python 项目（通常从 GitHub 克隆或下载得到）完成 Python 虚拟环境创建和依赖安装。

## 前置检查

### 1. 定位项目根目录
- 查看 workspace 中是否有 `pyproject.toml`、`requirements.txt`、`setup.py`、`setup.cfg`、`Pipfile`、`environment.yml`
- 如果项目文件在一个子目录中（如 `project-main/`），先将其内容移到 workspace 根目录
- 使用 `glob` 确认文件结构

### 2. 读取依赖配置
- 读取 `pyproject.toml` → 查看 `[project]` 中的 `requires-python` 和 `dependencies`
- 读取 `.python-version` → 查看 pyenv 指定版本
- 读取 `requirements.txt` → 查看 pip 依赖列表
- 读取 `README.md` → 查看推荐的安装方式（uv / pip / conda）

## Python 环境管理工具选型

按优先级尝试以下方案：

### 方案 A：uv（推荐，最快）
```bash
# 1. 检查 uv 是否安装
uv --version

# 2. 一键创建虚拟环境并安装依赖
uv sync

# 3. 验证
uv run python -c "import <core_pkg>; print('<core_pkg>:', <core_pkg>.__version__)"
```

### 方案 B：系统 Python + venv + pip
```bash
# 1. 检查 Python 版本是否满足项目要求
python --version   # 确认 >= requires-python

# 2. 创建虚拟环境
python -m venv .venv

# 3. 激活并安装（Windows）
.venv\Scripts\python -m pip install --upgrade pip

# 4. 安装依赖（如有 pyproject.toml）
.venv\Scripts\pip install -e .

# 或安装 requirements.txt
.venv\Scripts\pip install -r requirements.txt

# 5. 手动安装单个依赖（适用于 pip install -e . 失败时）
.venv\Scripts\pip install <pkg1> <pkg2>
```

### 方案 C：conda/mamba（适用于 ML 项目）
```bash
conda env create -f environment.yml
conda activate <env_name>
```

## 超时处理策略

当长时间运行的命令（如 `uv sync`、`pip install torch`）超时时：

1. **拆分安装**：不要一次安装所有包，分批安装
   ```bash
   .venv\Scripts\pip install numpy       # 先装轻量包
   .venv\Scripts\pip install funasr       # 再装项目特定包
   ```
2. **使用国内镜像**：在 pip 命令后添加 `-i https://pypi.tuna.tsinghua.edu.cn/simple`
3. **跳过版本锁定**：如果明确版本号的包找不到，尝试去掉版本号
4. **逐一安装+验证**：每个包安装后立即验证，避免一次性安装大量包超时

## 网络受限处理

当 GitHub HTTPS 连接失败时：
1. 尝试 `git clone` 使用国内镜像（如 `hub.fastgit.xyz`）
2. 或直接下载 ZIP 包：`https://github.com/<user>/<repo>/archive/refs/heads/main.zip`
3. pip 使用国内镜像源：`--index-url https://pypi.tuna.tsinghua.edu.cn/simple`

## 验证清单

安装完成后，执行以下验证：

```bash
# 验证 Python 版本
.venv\Scripts\python --version

# 验证核心依赖可导入
.venv\Scripts\python -c "import <core_pkg1>; import <core_pkg2>; print('All core packages imported successfully')"

# 验证项目自身的脚本可运行（可选）
.venv\Scripts\python <project_script.py> --help
```

## 完成条件

- [ ] 虚拟环境已创建（`.venv/` 目录存在）
- [ ] 所有依赖已安装（`pip list` 包含项目所需包）
- [ ] 核心包可导入无报错
