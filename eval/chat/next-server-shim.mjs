// Minimal NextResponse shim so the real route handler can run in-process
// under plain Node (eval only). Only .json() is needed by /api/chat.
export class NextResponse extends Response {
  static json(body, init = {}) {
    return new Response(JSON.stringify(body), {
      status: init.status || 200,
      headers: { "content-type": "application/json" },
    });
  }
}
