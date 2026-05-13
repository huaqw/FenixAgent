import Elysia from "elysia";

export const loggerPlugin = new Elysia({ name: "logger" })
  .onBeforeHandle(({ request }) => {
    const start = performance.now();
    (request as any).__startTime = start;
  })
  .onAfterHandle(({ request, set }) => {
    const start = (request as any).__startTime as number | undefined;
    const duration = start != null ? (performance.now() - start).toFixed(2) : "-";
    const method = request.method;
    const url = new URL(request.url);
    console.log(`  <-- ${method} ${url.pathname} ${duration}ms`);
  })
  .onError(({ request, error }) => {
    const start = (request as any).__startTime as number | undefined;
    const duration = start != null ? (performance.now() - start).toFixed(2) : "-";
    const method = request.method;
    const url = new URL(request.url);
    console.log(`  <-- ${method} ${url.pathname} ${duration}ms (error: ${error instanceof Error ? error.message : String(error)})`);
  });
