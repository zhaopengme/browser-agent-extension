# Browser Agent Extension - 优化待办清单

## 优先级说明
- 🔴 高优先级 - 严重影响AI Agent能力
- 🟡 中优先级 - 影响操作灵活性
- 🟢 低优先级 - 增强功能

---

## 🔴 高优先级

### 1. 网络请求捕获 ✅ 已完成
- [x] 启用 Network.enable CDP域
- [x] 实现网络请求收集和存储
- [x] 添加 `browser_enable_network` MCP工具
- [x] 添加 `browser_get_network_requests` MCP工具
- [x] 添加 `browser_wait_for_response` MCP工具
- [x] 支持按URL、方法、状态码、资源类型过滤

### 2. 等待机制 ✅ 已完成
- [x] 添加 `browser_wait_for_selector` MCP工具
- [x] 添加 `browser_wait_for_timeout` MCP工具
- [x] 添加 `browser_wait_for_load_state` MCP工具 (支持 load/domcontentloaded/networkidle)
- [x] 添加 `browser_wait_for_function` MCP工具
- [x] 支持自定义超时时间

### 3. iframe/frame操作 ⏳ 待实现
- [ ] 添加 `browser_get_frames` MCP工具
- [ ] 添加 `browser_switch_to_frame` MCP工具
- [ ] 添加 `browser_switch_to_main` MCP工具
- [ ] 支持通过name/id/index切换frame

### 4. 文件上传 ✅ 已完成
- [x] 添加 `browser_upload_file` MCP工具
- [x] 支持通过选择器定位file input
- [x] 支持多文件上传（files数组）

### 5. 弹窗处理 ✅ 已完成
- [x] 监听 Page.javascriptDialogOpening 事件
- [x] 添加 `browser_get_dialog` MCP工具
- [x] 添加 `browser_handle_dialog` MCP工具
- [x] 添加 `browser_set_auto_dialog` MCP工具
- [x] 支持 accept/dismiss 操作
- [x] 支持输入prompt文本

### 6. 控制台日志MCP工具 ✅ 已完成
- [x] 暴露现有 getConsoleLogs 方法为MCP工具
- [x] 添加 `browser_get_console_logs` MCP工具
- [x] 添加 `browser_enable_console_capture` MCP工具
- [x] 支持按日志类型过滤 (log/warn/error/info/debug)

---

## 🟡 中优先级

### 7. 鼠标高级操作 ✅ 已完成
- [x] 添加 `browser_hover` MCP工具
- [x] 添加 `browser_double_click` MCP工具
- [x] 添加 `browser_right_click` MCP工具
- [ ] 添加 `browser_drag_drop` MCP工具

### 8. Cookie/Storage操作
- [ ] 添加 `browser_get_cookies` MCP工具
- [ ] 添加 `browser_set_cookie` MCP工具
- [ ] 添加 `browser_delete_cookies` MCP工具
- [ ] 添加 `browser_get_localstorage` MCP工具
- [ ] 添加 `browser_set_localstorage` MCP工具
- [ ] 添加 `browser_clear_storage` MCP工具

### 9. 元素断言
- [ ] 添加 `browser_assert_element_exists` MCP工具
- [ ] 添加 `browser_assert_element_visible` MCP工具
- [ ] 添加 `browser_assert_element_text` MCP工具

### 10. 错误处理增强
- [ ] 按操作类型设置不同超时时间
- [ ] 添加可配置的重试机制
- [ ] 改进错误信息详细度

---

## 🟢 低优先级

### 11. 页面导出
- [ ] 添加 `browser_export_pdf` MCP工具
- [ ] 支持页面尺寸和边距配置

### 12. 设备模拟
- [ ] 添加 `browser_set_viewport` MCP工具
- [ ] 添加 `browser_emulate_device` MCP工具
- [ ] 预设常用设备配置

### 13. 性能和可访问性
- [ ] 添加 `browser_get_performance` MCP工具
- [ ] 添加 `browser_get_accessibility_tree` MCP工具

### 14. 工程质量
- [ ] 添加单元测试
- [ ] 添加E2E测试
- [ ] 生成API文档
- [ ] 支持多实例连接

---

## 新增 MCP 工具汇总 (本次实现)

| 工具名称 | 描述 |
|----------|------|
| `browser_enable_network` | 启用网络请求捕获 |
| `browser_disable_network` | 禁用网络请求捕获 |
| `browser_get_network_requests` | 获取捕获的网络请求（支持过滤） |
| `browser_clear_network_requests` | 清空捕获的网络请求 |
| `browser_wait_for_response` | 等待匹配URL模式的网络响应 |
| `browser_wait_for_selector` | 等待选择器匹配的元素出现 |
| `browser_wait_for_timeout` | 等待指定时间 |
| `browser_wait_for_load_state` | 等待页面加载状态 |
| `browser_wait_for_function` | 等待JS函数返回真值 |
| `browser_upload_file` | 文件上传 |
| `browser_get_dialog` | 获取当前弹窗信息 |
| `browser_handle_dialog` | 处理弹窗 |
| `browser_set_auto_dialog` | 设置自动弹窗处理 |
| `browser_get_console_logs` | 获取控制台日志 |
| `browser_enable_console_capture` | 启用控制台日志捕获 |
| `browser_hover` | 悬停在元素上 |
| `browser_double_click` | 双击元素 |
| `browser_right_click` | 右键点击元素 |

---

## 完成记录

| 日期 | 完成项 | 备注 |
|------|--------|------|
| 2025-12-02 | 网络请求捕获 | 包含启用/禁用/获取/清空/等待响应 |
| 2025-12-02 | 等待机制 | 包含选择器/超时/加载状态/函数等待 |
| 2025-12-02 | 文件上传 | 支持多文件 |
| 2025-12-02 | 弹窗处理 | 支持获取/处理/自动处理 |
| 2025-12-02 | 控制台日志MCP工具 | 暴露为MCP工具 |
| 2025-12-02 | 高级鼠标操作 | hover/双击/右键 |
