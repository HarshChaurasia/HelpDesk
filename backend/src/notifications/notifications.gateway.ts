import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  path: '/ws',
  cors: { origin: (process.env.CORS_ORIGIN ?? '').split(','), credentials: true },
})
export class NotificationsGateway implements OnGatewayConnection {
  private readonly logger = new Logger('WS');
  @WebSocketServer() server: Server;

  constructor(private readonly jwt: JwtService) {}

  handleConnection(client: Socket) {
    const token =
      client.handshake.auth?.token ||
      (client.handshake.headers.authorization ?? '').replace('Bearer ', '');
    try {
      const payload = this.jwt.verify(token, {
        secret: process.env.JWT_ACCESS_SECRET,
      });
      client.join(`user:${payload.sub}`);
    } catch {
      client.disconnect();
    }
  }

  pushToUser(userId: string, event: string, data: unknown) {
    this.server?.to(`user:${userId}`).emit(event, data);
  }
}
