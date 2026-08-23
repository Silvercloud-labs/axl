# 快速开始

在 **5 分钟内** 搭建一个完整的 AXL 服务器，支持 REST API、MCP 工具、身份认证和有状态工作流。

---

### 第一步：安装 CLI

```bash
npm install -g scl-axl
```

### 第二步：初始化项目

```bash
mkdir 我的第一个axl && cd 我的第一个axl
axl init -y
```

### 第三步：编译 Flow 文件

```bash
axl compile
```

### 第四步：启动引擎

```bash
axl serve
```

您应该看到类似以下的输出：
```
  AXL Server
  ✔ Running (MCP + REST + WS)

  Health        http://localhost:3939/health
  Discovery     http://localhost:3939/.well-known/axl
  MCP Endpoint  http://localhost:3939/mcp
  REST API      http://localhost:3939/actions/:name
  WS API        ws://localhost:3939/ws
  Listening on  127.0.0.1:3939
```

---

## 测试

### 1. 第一个 REST 调用

```bash
curl -s -X POST http://localhost:3939/actions/list_projects \
  -H "Content-Type: application/json" \
  -d "{}"
```

### 2. 连接 AI 代理 (MCP)

在您的 `mcp.json` 中添加：
```json
{
  "mcpServers": {
    "my-axl-server": {
      "command": "npx",
      "args": ["axl", "serve", "--dir", "/路径/到/flow"]
    }
  }
}
```

---

### 下一步

- 探索 [Hotel Booking 示例](../../../examples/hotel-booking)
- 阅读 [架构](../../architecture.md)
- 阅读 [`.flow` 语言](../../language.md)
- 阅读 [权限和速率限制](../../permissions.md)
