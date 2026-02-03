import { createMiddleware } from 'hono/factory';

/**
 * Hono 请求日志中间件
 * 记录每个请求的 method、path、status 和耗时
 */
export const logger = createMiddleware(async (c, next) => {
  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;

  // 记录请求开始
  console.error(`[Request] ${method} ${path}`);

  await next();

  // 记录响应
  const duration = Date.now() - start;
  const status = c.res.status;
  console.error(`[Response] ${method} ${path} ${status} (${duration}ms)`);
});
