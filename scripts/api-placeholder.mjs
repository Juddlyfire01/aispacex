/**
 * Frontend stand-in for `vercel dev`. Real UI is Vite on :5173; this process only
 * occupies the vercel frontend port so /api serverless routes still mount.
 */
import http from 'node:http'

const port = Number(process.env.PORT || 3000)

http
  .createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('AiSpaceX API is running. Open http://localhost:5173 for the app.\n')
  })
  .listen(port, () => {
    console.log(`[api] placeholder listening on :${port} (use http://localhost:5173)`)
  })
