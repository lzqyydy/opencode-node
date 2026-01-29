# Hono to Fastify 迁移计划

## 目标
将项目中的 Hono Web 框架替换为 Fastify v4.x，以支持 Node.js 16 运行时。

## 依赖版本确认 (Node.js 16 兼容)

### 新增依赖
- `fastify`: `^4.28.1` (支持 Node.js >= 14.18.0)
- `@fastify/cors`: `^8.5.0` (对应 Fastify ^4.x)
- `@fastify/websocket`: `^8.3.1` (对应 Fastify ^4.x)
- `@fastify/basic-auth`: `^5.1.1` (对应 Fastify ^4.x)
- `fastify-sse-v2`: `^3.1.2` (SSE 支持)

### 移除依赖
- `hono`
- `hono-openapi`
- `@hono/standard-validator`
- `@hono/zod-validator`

---

## 执行步骤

### Phase 1: 依赖管理

- [x] **1.1** 更新 `package.json`
  - 文件: `package.json`
  - 操作: 修改
  - 目标: 添加 Fastify 相关依赖，移除 Hono 相关依赖

### Phase 2: 核心服务器文件重构

- [x] **2.1** 重写 `src/server/server.ts`
  - 文件: `src/server/server.ts`
  - 操作: 修改
  - 目标:
    - 将 `new Hono()` 替换为 `Fastify()`
    - 注册 CORS、BasicAuth、WebSocket 插件
    - 重写错误处理 (`setErrorHandler`)
    - 重写中间件为 Fastify hooks (`onRequest`, `preHandler`)
    - 移除 `/doc` 路由
    - 移除 proxy 相关代码，未匹配路由返回 404
    - 封装 `Server.listen()` 返回对象，保持 `url`, `stop()` 等字段兼容

- [x] **2.2** 更新 `src/server/error.ts`
  - 文件: `src/server/error.ts`
  - 操作: 修改
  - 目标: 移除 `hono-openapi` 的 `resolver` 引用，简化错误定义

### Phase 3: 路由文件转换

每个路由文件需要从 Hono 链式调用风格转换为 Fastify 插件风格。

- [x] **3.1** 转换 `src/server/routes/global.ts`
  - 文件: `src/server/routes/global.ts`
  - 操作: 修改
  - 目标:
    - 将 `new Hono()` 改为 Fastify 插件函数
    - 将 `streamSSE()` 替换为自定义 SSE 实现
    - 移除 `describeRoute`, `resolver` 等 OpenAPI 相关代码

- [x] **3.2** 转换 `src/server/routes/session.ts`
  - 文件: `src/server/routes/session.ts`
  - 操作: 修改
  - 目标:
    - 转换为 Fastify 插件格式
    - 将 `validator()` 移除（不做 schema 验证）
    - 将 `stream()` 替换为 Fastify reply.raw 流式响应
    - 移除所有 `describeRoute`, `resolver` 引用

- [x] **3.3** 转换 `src/server/routes/project.ts`
  - 文件: `src/server/routes/project.ts`
  - 操作: 修改
  - 目标: 转换为 Fastify 插件格式

- [x] **3.4** 转换 `src/server/routes/pty.ts`
  - 文件: `src/server/routes/pty.ts`
  - 操作: 修改
  - 目标:
    - 转换为 Fastify 插件格式
    - 将 `upgradeWebSocket()` 替换为 `@fastify/websocket` 实现

- [x] **3.5** 转换 `src/server/routes/config.ts`
  - 文件: `src/server/routes/config.ts`
  - 操作: 修改
  - 目标: 转换为 Fastify 插件格式

- [x] **3.6** 转换 `src/server/routes/mcp.ts`
  - 文件: `src/server/routes/mcp.ts`
  - 操作: 修改
  - 目标: 转换为 Fastify 插件格式

- [x] **3.7** 转换 `src/server/routes/file.ts`
  - 文件: `src/server/routes/file.ts`
  - 操作: 修改
  - 目标: 转换为 Fastify 插件格式

- [x] **3.8** 转换 `src/server/routes/experimental.ts`
  - 文件: `src/server/routes/experimental.ts`
  - 操作: 修改
  - 目标: 转换为 Fastify 插件格式

- [x] **3.9** 转换 `src/server/routes/provider.ts`
  - 文件: `src/server/routes/provider.ts`
  - 操作: 修改
  - 目标: 转换为 Fastify 插件格式

- [x] **3.10** 转换 `src/server/routes/permission.ts`
  - 文件: `src/server/routes/permission.ts`
  - 操作: 修改
  - 目标: 转换为 Fastify 插件格式

- [x] **3.11** 转换 `src/server/routes/question.ts`
  - 文件: `src/server/routes/question.ts`
  - 操作: 修改
  - 目标: 转换为 Fastify 插件格式

### Phase 4: 类型定义与辅助函数

- [x] **4.1** 创建 SSE 辅助函数
  - 文件: `src/server/sse.ts` (新建)
  - 操作: 新增
  - 目标: 封装自定义 SSE 流式响应工具函数（基于 Node.js 原生 Response）

### Phase 5: 验证与测试

- [x] **5.1** TypeScript 类型检查
  - 命令: `bun run typecheck`
  - 目标: 确保无类型错误

- [ ] **5.2** 运行测试
  - 命令: `bun test`
  - 目标: 确保现有测试通过

- [ ] **5.3** 手动启动验证
  - 命令: `bun run serve`
  - 目标: 验证服务器正常启动

---

## API 映射对照表

| Hono API | Fastify 替代方案 |
|----------|-----------------|
| `new Hono()` | `Fastify()` |
| `.get()/.post()/.put()/.patch()/.delete()` | `fastify.get()/.post()/.put()/.patch()/.delete()` |
| `.route(path, subApp)` | `fastify.register(plugin, { prefix: path })` |
| `.use(middleware)` | `fastify.addHook('onRequest', handler)` |
| `.onError(handler)` | `fastify.setErrorHandler(handler)` |
| `cors()` | `@fastify/cors` 插件 |
| `basicAuth()` | `@fastify/basic-auth` 插件 |
| `streamSSE()` | `fastify-sse-v2` 插件 |
| `stream()` | `reply.raw` + Node.js 原生流 |
| `upgradeWebSocket()` | `@fastify/websocket` 插件 |
| `proxy()` | 移除，返回 404 |
| `validator()` | 移除（不做验证） |
| `describeRoute()`, `resolver()` | 移除（不需要 OpenAPI） |
| `c.req.query()` | `request.query` |
| `c.req.param()` | `request.params` |
| `c.req.header()` | `request.headers` |
| `c.req.valid('json')` | `request.body` |
| `c.req.valid('param')` | `request.params` |
| `c.req.valid('query')` | `request.query` |
| `c.json()` | `reply.send()` |
| `c.status()` | `reply.code()` |
| `c.header()` | `reply.header()` |
| `HTTPException` | Fastify 原生错误 + `reply.code().send()` |

---

## 服务器对象封装

原 `Server.listen()` 返回的对象需要保持以下字段兼容：

```typescript
interface ServerInstance {
  url: URL
  port: number
  stop: (closeActiveConnections?: boolean) => Promise<void>
}
```

Fastify 的 `fastify.listen()` 返回 `Promise<string>` (地址)，需要封装为上述接口。

---

## 风险与注意事项

1. **SSE 心跳机制**: 需要在 `fastify-sse-v2` 中手动实现 30s 心跳
2. **WebSocket 连接管理**: `@fastify/websocket` 的 API 与 Hono/Bun 有差异，需要调整 `Pty.connect()` 的调用方式
3. **Instance.provide 中间件**: 需要在 Fastify hook 中实现相同的上下文注入逻辑
4. **流式响应**: `stream()` 函数需要用 Node.js 原生 `reply.raw` 实现
