import * as http from 'node:http';

type RouteHandler = (url: URL, headers: http.IncomingHttpHeaders) => { status: number; body: unknown };

interface Route {
  method: string;
  /** String prefix match or RegExp against pathname. */
  pattern: string | RegExp;
  handler: RouteHandler;
}

/**
 * Minimal in-process HTTP stub for external service dependencies (Content Service,
 * Organization Service). Routes are matched in registration order; first match wins.
 * Unmatched routes return 200 `{}`.
 */
export class StubServer {
  private readonly routes: Route[] = [];
  private server?: http.Server;
  url = '';

  register(method: string, pattern: string | RegExp, handler: RouteHandler): this {
    this.routes.push({ method: method.toUpperCase(), pattern, handler });
    return this;
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const method = (req.method ?? 'GET').toUpperCase();
        const route = this.routes.find((r) => {
          if (r.method !== '*' && r.method !== method) return false;
          if (typeof r.pattern === 'string') {
            return url.pathname === r.pattern || url.pathname.startsWith(r.pattern + '/');
          }
          return r.pattern.test(url.pathname);
        });
        const { status, body } = route
          ? route.handler(url, req.headers)
          : { status: 200, body: {} };
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
      });

      this.server.on('error', reject);
      this.server.listen(0, '127.0.0.1', () => {
        const addr = this.server!.address() as { port: number };
        this.url = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server?.close(() => resolve());
    });
  }
}
