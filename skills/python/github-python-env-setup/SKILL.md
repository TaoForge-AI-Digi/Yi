---
name: github-python-env-setup
description: 从 GitHub 克隆 Python 项目并自动配置虚拟环境和安装依赖
tags: ["python", "github", "environment", "setup", "venv"]
version: 1.0.0
author: Yi-Lin / Master Yi
---

# GitHub Python 环境安装 Skill

## 目标

从用户提供的 GitHub 仓库 URL 出发，完成以下全流程：
1. 克隆代码（自动处理网络异常，含国内镜像回退）
2. 检测项目依赖类型（requirements.txt / setup.py / pyproject.toml / Pipfile）
3. 创建 Python 虚拟环境
4. 安装项目依赖
5. 验证环境可用

## 前置条件

- 目标机器已安装 Git
- 目标机器已安装 Python 3.8+
- `pip` 可用

## 步骤

### Step 1: 解析用户输入

用户输入示例：
- `https://github.com/yan5xu/ququ` → 自动用仓库名 `ququ` 作为目录名
- `https://github.com/owner/repo.git` → 去掉 `.git` 后缀
- `owner/repo` → 拼接为 `https://github.com/owner/repo`

提取 `owner` 和 `repo` 两个变量备用。

### Step 2: 检测网络连通性

```bash
# 快速检查 GitHub 可达性
curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 https://github.com
```

- 如果 HTTP 200 → 直连可用，直接走 Step 3
- 如果超时/失败 → 走镜像回退（Step 2b）

### Step 2b: 镜像回退（国内网络专用）

按优先级依次尝试以下镜像源，任一成功则跳过后续：

| 优先级 | 镜像地址模板 |
|--------|-------------|
| 1 | `https://ghproxy.com/https://github.com/{owner}/{repo}.git` |
| 2 | `https://hub.fastgit.xyz/{owner}/{repo}.git` |
| 3 | `https://github.com.cnpmjs.org/{owner}/{repo}.git` |
| 4 | `https://kgithub.com/{owner}/{repo}.git` |

尝试方式：
```bash
git clone {mirror_url} {target_dir} 2>&1
```
若失败（返回非零），记录错误并尝试下一个镜像。全部失败则向用户报告网络不可达。

### Step 3: 克隆到本地

```bash
git clone {effective_url} {workspace}/{repo}
```

- 如果目标目录已存在且非空，先询问用户是否覆盖或使用已有代码
- 克隆后确认目录中存在文件

### Step 4: 检测项目结构

进入项目目录后，按优先级检测依赖文件：

1. `requirements.txt` — pip install -r requirements.txt
2. `Pipfile` — pipenv install
3. `pyproject.toml` — 检测有无 `[project]` 或 `[build-system]`，有则用 pip install -e . 或 poetry install
4. `setup.py` / `setup.cfg` — pip install -e .
5. `environment.yml` — conda env create (如果 conda 可用)
6. 以上都没有 → 报告用户此项目未检测到标准 Python 依赖文件

### Step 5: 创建虚拟环境

```bash
# 在项目目录下创建 .venv
cd {repo_dir}
python -m venv .venv
```

- Windows: `.venv\Scripts\activate`
- Linux/Mac: `source .venv/bin/activate`

确认激活后 `python --version` 能返回正确的版本。

### Step 6: 安装依赖

根据 Step 4 的检测结果安装：

```bash
# 激活虚拟环境后执行

# requirements.txt
pip install -r requirements.txt

# 或 pyproject.toml (PEP 517)
pip install -e .

# 或 Pipfile
pipenv install
```

安装完成后 `pip list` 确认关键包已安装。

### Step 7: 验证

运行项目提供的验证方式（按优先级检测）：

1. `python -c "import {main_module}"` — 测试核心模块可导入
2. 如果项目有 `tests/` 目录 → `python -m pytest tests/ -x -q`（未安装 pytest 则跳过）
3. 如果项目有 `main.py` 或 `cli.py` → `python main.py --help` 或 `python cli.py --help`
4. 如果项目有 `README.md` → 读取其中的 Quick Start 部分并执行对应命令

## 输出产物

克隆完成后，项目目录结构示例：
```
{workspace}/{repo}/
├── .venv/              # Python 虚拟环境（已安装依赖）
├── .git/
├── requirements.txt    # 或 pyproject.toml / setup.py 等
├── ... (项目文件)
```

## 常见问题处理

| 问题 | 处理方式 |
|------|---------|
| GitHub HTTPS 超时 | 自动尝试 ghproxy 等镜像 |
| 镜像 404 | 镜像可能滞后，尝试下一个镜像 |
| 虚拟环境创建失败 | 检查 Python 版本是否 3.8+，尝试 `python3 -m venv` |
| pip install 超时 | 添加 `-i https://pypi.tuna.tsinghua.edu.cn/simple` 国内镜像 |
| 项目无依赖文件 | 只创建虚拟环境，不安装包，告知用户 |

## 完成条件

- [x] 代码已克隆到工作目录
- [x] 虚拟环境已创建
- [x] 依赖已安装（或明确告知无依赖）
- [x] 基本导入/运行验证通过
