import { createServer, Server as HttpServer } from 'http'
import { Server } from 'connect'

export async function resolveHttpServer(
  app: Server
): Promise<HttpServer> {
  return createServer(app)
}
