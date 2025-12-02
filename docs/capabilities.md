# 能力清单

本文档列出 Browser Agent 扩展支持的所有 MCP 工具及其能力。

---

## 核心能力概览

| 类别 | 能力 | 状态 |
|------|------|------|
| 导航 | 页面导航、前进后退、刷新 | ✅ |
| 交互 | 点击、输入、滚动、悬停 | ✅ |
| 信息获取 | 截图、内容提取、页面信息 | ✅ |
| 标签页管理 | 获取列表、切换标签 | ✅ |
| JS 执行 | 在页面执行脚本 | ✅ |
| 网络监控 | 请求捕获、等待响应 | ✅ |
| 等待机制 | 元素、超时、加载状态 | ✅ |
| 用户界面 | 锁定/解锁、状态更新 | ✅ |

---

## MCP 工具详细说明

### 导航类

#### browser_navigate
导航到指定 URL。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| url | string | ✅ | 目标 URL |

```json
{
  "action": "navigate",
  "params": { "url": "https://example.com" }
}
```

#### browser_go_back
浏览器后退。

#### browser_go_forward
浏览器前进。

#### browser_reload
刷新当前页面。

---

### 交互类

#### browser_click
点击元素或坐标。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| selector | string | 可选 | CSS 选择器 |
| x | number | 可选 | X 坐标 |
| y | number | 可选 | Y 坐标 |

```json
{
  "action": "click",
  "params": { "selector": "#submit-btn" }
}
```

#### browser_double_click
双击元素。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| selector | string | ✅ | CSS 选择器 |

#### browser_right_click
右键点击元素。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| selector | string | ✅ | CSS 选择器 |

#### browser_hover
悬停在元素上。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| selector | string | ✅ | CSS 选择器 |

#### browser_type
在元素中输入文本。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| selector | string | 可选 | CSS 选择器 |
| text | string | ✅ | 输入的文本 |
| clearFirst | boolean | 可选 | 是否先清空 |

```json
{
  "action": "type",
  "params": { "selector": "#search", "text": "hello world" }
}
```

#### browser_press_key
按下键盘按键。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| key | string | ✅ | 按键名称 (Enter, Escape, Tab 等) |

#### browser_scroll
滚动页面。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| selector | string | 可选 | 滚动到该元素 |
| direction | string | 可选 | 方向 (up/down/left/right) |
| distance | number | 可选 | 滚动距离 (px) |

#### browser_select_option
选择下拉框选项。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| selector | string | ✅ | select 元素选择器 |
| value | string | 可选 | 选项的 value |
| text | string | 可选 | 选项的文本 |
| index | number | 可选 | 选项的索引 |

#### browser_upload_file
上传文件。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| selector | string | ✅ | file input 选择器 |
| files | string[] | ✅ | 文件绝对路径数组 |

---

### 信息获取类

#### browser_screenshot
截取页面截图。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| fullPage | boolean | 可选 | 是否全页截图 |
| format | string | 可选 | 格式 (png/jpeg/webp) |

```json
{
  "action": "screenshot",
  "params": { "fullPage": true }
}
```

#### browser_extract
提取元素的文本和 HTML。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| selector | string | ✅ | CSS 选择器 |

```json
{
  "action": "extract",
  "params": { "selector": ".article-content" }
}
```

#### browser_get_page_info
获取当前页面信息 (URL, 标题)。

#### browser_evaluate
在页面中执行 JavaScript。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| script | string | ✅ | JS 代码 |

```json
{
  "action": "evaluate",
  "params": { "script": "document.title" }
}
```

---

### 标签页管理类

#### browser_get_tabs
获取所有打开的标签页列表。

**返回：**
```json
{
  "tabs": [
    { "id": 1, "url": "https://example.com", "title": "Example" },
    { "id": 2, "url": "https://google.com", "title": "Google" }
  ]
}
```

#### browser_switch_tab
切换到指定标签页。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| tabId | number | ✅ | 标签页 ID |

---

### 网络监控类

#### browser_enable_network
启用网络请求捕获。

#### browser_disable_network
禁用网络请求捕获。

#### browser_get_network_requests
获取捕获的网络请求。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| urlPattern | string | 可选 | URL 正则过滤 |
| method | string | 可选 | HTTP 方法过滤 |
| resourceType | string | 可选 | 资源类型 (XHR, Fetch 等) |
| statusCode | number | 可选 | 状态码过滤 |
| clear | boolean | 可选 | 返回后清空 |

#### browser_clear_network_requests
清空已捕获的网络请求。

#### browser_wait_for_response
等待匹配的网络响应。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| urlPattern | string | ✅ | URL 正则匹配 |
| method | string | 可选 | HTTP 方法 |
| timeout | number | 可选 | 超时时间 (ms) |

---

### 等待机制类

#### browser_wait_for_selector
等待元素出现。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| selector | string | ✅ | CSS 选择器 |
| visible | boolean | 可选 | 等待可见 |
| hidden | boolean | 可选 | 等待隐藏 |
| timeout | number | 可选 | 超时时间 (ms) |

#### browser_wait_for_timeout
等待指定时间。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| ms | number | ✅ | 等待毫秒数 |

#### browser_wait_for_load_state
等待页面加载状态。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| state | string | 可选 | load/domcontentloaded/networkidle |
| timeout | number | 可选 | 超时时间 (ms) |

#### browser_wait_for_function
等待 JS 函数返回真值。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| function | string | ✅ | JS 函数/表达式 |
| timeout | number | 可选 | 超时时间 (ms) |
| polling | number | 可选 | 轮询间隔 (ms) |

---

### 对话框处理类

#### browser_get_dialog
获取当前 JS 对话框信息 (alert, confirm, prompt)。

#### browser_handle_dialog
处理 JS 对话框。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| accept | boolean | 可选 | 接受/拒绝 |
| promptText | string | 可选 | prompt 输入文本 |

#### browser_set_auto_dialog
设置自动对话框处理。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| handler | string | 可选 | accept/dismiss/null |

---

### 控制台日志类

#### browser_enable_console_capture
启用控制台日志捕获。

#### browser_get_console_logs
获取控制台日志。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| types | string[] | 可选 | 日志类型过滤 (log/info/warn/error/debug) |

---

### 用户界面控制类

#### browser_lock
锁定页面，防止用户交互干扰自动化。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| status | string | 可选 | 显示的状态文本 |

#### browser_unlock
解锁页面，恢复用户交互。

#### browser_update_status
更新锁定状态的提示文本。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| status | string | ✅ | 新的状态文本 |
| shimmer | boolean | 可选 | 是否启用闪烁动画 |

---

## 使用示例

### 搜索流程示例

```
1. browser_navigate → https://google.com
2. browser_type → selector: "input[name=q]", text: "MCP protocol"
3. browser_press_key → key: "Enter"
4. browser_wait_for_selector → selector: "#search"
5. browser_screenshot
```

### 登录流程示例

```
1. browser_lock → status: "正在登录..."
2. browser_navigate → https://example.com/login
3. browser_type → selector: "#username", text: "user"
4. browser_type → selector: "#password", text: "pass"
5. browser_click → selector: "#submit"
6. browser_wait_for_load_state → state: "networkidle"
7. browser_unlock
```

### 数据抓取示例

```
1. browser_navigate → https://example.com/list
2. browser_wait_for_selector → selector: ".item"
3. browser_evaluate → script: "Array.from(document.querySelectorAll('.item')).map(e => e.textContent)"
4. browser_screenshot → fullPage: true
```

---

## 扩展权限

| 权限 | 用途 |
|------|------|
| sidePanel | Side Panel UI |
| debugger | CDP 控制 (核心) |
| tabs | 标签页管理 |
| activeTab | 当前标签页访问 |
| scripting | 执行脚本 |

---

## 注意事项

1. **Side Panel 必须打开** - 所有命令需要 Side Panel 保持打开状态
2. **调试提示条** - 使用 chrome.debugger 时会显示调试提示
3. **选择器优先** - 推荐使用 CSS 选择器而非坐标点击
4. **等待机制** - 操作前使用 wait 系列工具确保元素就绪
5. **锁定/解锁** - 长流程建议使用 lock/unlock 防止用户干扰
