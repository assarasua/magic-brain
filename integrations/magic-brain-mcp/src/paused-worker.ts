/** Temporary deployment entry point. The original worker is preserved for relaunch. */
const pausedWorker = {
  async fetch(_request: Request): Promise<Response> {
    void _request;
    return Response.json(
      { error: { code: "service_paused", message: "Magic Brain is temporarily paused. Subscribe at https://magicbrain.es for updates." } },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "86400" } },
    );
  },
};

export default pausedWorker;
