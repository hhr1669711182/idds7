#!/usr/bin/env sh
# Husky shell 初始化脚本
# 用于 husky hook 脚本调用

# 防止重复加载
[ -z "$HUSKY_LOADED" ] || exit 0
HUSKY_LOADED=1

# 获取 husky 目录
husky_dir="$(dirname -- "$0")"

# 加载环境变量（如果存在）
if [ -f "$husky_dir/.husky.env" ]; then
  . "$husky_dir/.husky.env"
fi
