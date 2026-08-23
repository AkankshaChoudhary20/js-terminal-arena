import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { RoomManager } from './room.js';

const PORT = Number(process.env.PORT ?? 4200);
const manager = new RoomManager();

const httpServer = createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws) => {
  let playerId = null;
  let room = null;

  ws.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (message.type) {
      case 'join': {
        if (room) return;
        const name = String(message.name ?? 'Player').slice(0, 24).trim() || 'Player';
        const roomCode = String(message.room ?? 'lobby').slice(0, 16).trim().toLowerCase() || 'lobby';
        playerId = randomUUID();
        room = manager.getOrCreate(roomCode);
        room.addPlayer(playerId, ws, name);
        ws.send(JSON.stringify({ type: 'joined', playerId, room: roomCode, state: room.state }));
        break;
      }
      case 'ready': {
        if (!room || !playerId) return;
        room.setReady(playerId, Boolean(message.ready));
        break;
      }
      case 'answer': {
        if (!room || !playerId) return;
        room.submitAnswer(playerId, Number(message.choiceIndex));
        break;
      }
      default:
        break;
    }
  });

  ws.on('close', () => {
    if (room && playerId) room.removePlayer(playerId);
  });
});

httpServer.listen(PORT, () => {
  console.log(`terminal-arena server listening on :${PORT}`);
});
