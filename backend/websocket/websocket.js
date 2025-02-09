const { WebSocketServer } = require('ws');
const { getUserById } = require('../models/userModel');
const jwt = require('jsonwebtoken');
const { savePrivateMessage} = require('../models/messagesModel');

let connectedUsers = [];


const broadcastConnectedUsers = () => {
  const users = connectedUsers.map(user => user.userInfo);
  connectedUsers.forEach(({ ws }) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: 'connectedUsers', users }));
    }
  });
};

const authenticateUser = async (ws, token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_TOKEN);
    const userId = decoded.userId;
    const userInfo = await getUserById(userId);
    ws.userId = userId;
    ws.userInfo = userInfo;
    connectedUsers.push({ ws, userInfo });
    ws.send(JSON.stringify({ type: 'authenticated', message: 'Autenticado correctamente' }));
    broadcastConnectedUsers();
  } catch (err) {
    console.error("Error:", err);
    ws.send(JSON.stringify({ type: 'error', message: 'Token inválido' }));
    ws.close();
  }
};

const handlePrivateMessage = async (ws, message) => {
  if (!ws.userId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Usuario no autenticado' }));
    return;
  }

  const { senderId, receiverId, content, timestamp } = message; 

  const receiver = connectedUsers.find(user => user.userInfo.id === receiverId);

  if (receiver) {
    receiver.ws.send(JSON.stringify({
      type: 'privateMessage',
      from: senderId,
      to: receiverId,
      content: content,
      timestamp: timestamp, 
    }));
  }

    // Guardar el mensaje en la base de datos
    try {
      await savePrivateMessage(senderId, receiverId, content, timestamp);
    } catch (error) {
      ws.send(JSON.stringify({ type: 'error', message: 'Error guardando el mensaje' }));
    }
};

const setupWebSocket = (server) => {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    console.log('Cliente conectado al WebSocket');

    ws.on('message', async (message) => {
      const parsedMessage = JSON.parse(message);

      if (parsedMessage.type === 'authenticate') {
        authenticateUser(ws, parsedMessage.token);
      } else if (parsedMessage.type === 'privateMessage') {
        handlePrivateMessage(ws, parsedMessage);
      } else {
        console.log(`Mensaje recibido: ${message}`);
        ws.send('Mensaje recibido por el servidor');
      }
    });

    ws.on('close', () => {
      console.log('Cliente desconectado del WebSocket');
      if (ws.userId) {
        connectedUsers = connectedUsers.filter(user => user.ws !== ws);
        broadcastConnectedUsers();
      }
    });
  });
};

module.exports = { setupWebSocket };
