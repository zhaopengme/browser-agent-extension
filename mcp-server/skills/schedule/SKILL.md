---
name: schedule
description: This skill should be used when the user asks to "create a scheduled task", "set up a cron job", "create a pipeline", "run this daily", "execute this every week", or mentions scheduling, recurring tasks, or automation timing.
version: 0.1.0
---

# Schedule - 定时任务管理

创建和管理基于 ai-memory Pipeline 的定时任务。

## 概述

ai-memory 提供了 Pipeline 功能，支持定时任务调度。此 Skill 封装了 Pipeline 的创建和管理流程。

## 可用操作

| 操作 | 描述 |
|------|------|
| 创建任务 | 定义新的定时 Pipeline |
| 列出任务 | 查看所有现有 Pipeline 及状态 |
| 启用/禁用 | 暂停或恢复 Pipeline 执行 |
| 删除任务 | 移除不再需要的 Pipeline |

## Cron 表达式

Pipeline 使用 5 段式 cron 表达式：

```
┌───────────── 分钟 (0 - 59)
│ ┌───────────── 小时 (0 - 23)
│ │ ┌───────────── 日期 (1 - 31)
│ │ │ ┌───────────── 月份 (1 - 12)
│ │ │ │ ┌───────────── 星期 (0 - 6, 0=周日)
│ │ │ │ │
* * * * *
```

### 常用示例

| 频率 | Cron 表达式 |
|------|------------|
| 每天凌晨 1 点 | `0 1 * * *` |
| 每天上午 9 点 | `0 9 * * *` |
| 每周一上午 10 点 | `0 10 * * 1` |
| 每小时 | `0 * * * *` |
| 每 30 分钟 | `*/30 * * * *` |
| 工作日早上 9 点 | `0 9 * * 1-5` |

更多示例见 `examples/cron-examples.md`。

## 创建定时任务

### 基本语法

```
schedule <任务名称> every <频率> do <命令/模板>
```

### 示例

```
# 每天早上检查依赖更新
schedule check-deps daily at 9am do npm-check-updates

# 每周生成项目报告
schedule weekly-report every monday at 10am do generate-report

# 每小时运行健康检查
schedule health-check hourly do check-health
```

### 技术实现

创建任务需调用 `mcp__ai-memory__pipeline_create`：

```json
{
  "key": "task-name",
  "value": "[{\"label\": \"任务描述\", \"type\": \"text\"}]",
  "metadata": {
    "cron": "0 9 * * *",
    "status": "active"
  },
  "isActive": true
}
```

## 管理现有任务

### 列出所有任务

使用 `mcp__ai-memory__pipeline_list` 查看所有 Pipeline。

### 启用/禁用任务

使用 `mcp__ai-memory__pipeline_update` 修改 `metadata.status`：
- `active` - 启用
- `paused` - 暂停

### 删除任务

使用 `mcp__ai-memory__pipeline_delete`，需设置 `confirm: true`。

## 工作流程

1. **识别需求** - 确定执行频率和命令/模板
2. **生成 cron** - 根据频率生成对应的 cron 表达式
3. **创建 Pipeline** - 调用 pipeline_create
4. **确认** - 验证任务已正确创建

## 附加资源

### 示例文件

- **`examples/cron-examples.md`** - 更多 cron 表达式示例
- **`examples/task-templates.md`** - 常见任务模板

### 参考

- **`references/ai-memory-api.md`** - ai-memory Pipeline API 完整文档
