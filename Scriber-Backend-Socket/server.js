
const express = require("express");
const app = express();
require("dotenv").config();

const http = require("http");
const socketIo = require("socket.io");
const server = http.createServer(app);

const cors = require("cors");
const axios = require("axios");
const formData = require("form-data");
const cookieParser = require('cookie-parser');

const io = socketIo(server, {
  cors: {
     origin: [
      "https://scriber-backend.onrender.com",
      "https://tjl8m83g-3001.euw.devtunnels.ms",
    ],
    methods: ["GET", "POST"],
    credentials: true
  },
  maxHttpBufferSize: 1e8 // 100 MB
});

app.use(cookieParser());

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error("Token yok"));
  }
  //console.log("Socket token:", token);
  socket.token = token;
  next();
});


const usersInRoom = {};        // { roomId: [ userId, userId, ... ] }
const userSocketMap = {};      // { userId: socket.id }
const roomsScreenSharing = {}; // { roomId: sharingUserId }
const userTokenMap = {}; // { userId: token }
io.on('connection', (socket) => {

  function getTokensFromCookie(req) {
    const raw = req.headers.cookie || "";
    const token = raw
      .split(";")
      .map(c => c.trim())
      .find(c => c.startsWith("token="))
      ?.slice(6);
    return token;
  }


  socket.on('join-room',async ({ roomId, userId ,chatId }) => {
    socket.join(roomId);
    socket.userId = userId;
    console.log("odaya girildi.")
    userSocketMap[userId] = socket.id;
    if (!usersInRoom[roomId]) usersInRoom[roomId] = [];
    usersInRoom[roomId].push(userId);
    console.log(`[Server] Room ${roomId} içindekiler:`, usersInRoom[roomId]);
    // Yeni katılan kullanıcıya diğer kullanıcıları gönder
    const otherUsers = usersInRoom[roomId].filter(id => id !== userId);
    const screenSharer = roomsScreenSharing[roomId] || null;
    socket.emit('all-users', {users: otherUsers, screenSharer});
    
    //socket.to(roomId).emit('new-user', { userId }); // diğerlerine bildir
    // Odadan ayrılınca Temizleme
    socket.on('disconnect',async () => {
      socket.to(chatId).emit('disconnected-call-notification',{chatId});
      if (roomsScreenSharing[roomId] === userId) {
        delete roomsScreenSharing[roomId];
        socket.to(roomId).emit('screen-share-stopped', { userId });
      }
      usersInRoom[roomId] = usersInRoom[roomId].filter(id => id !== userId);
      console.log("roomId:", roomId);
      try{
        const user_leaved = await axios.post("https://scriber-backend.onrender.com/chat/video/user-leaved", {
          roomId,
          userId
        });


      }catch(err){
        console.error("Error while removing user from room:", err);
      }
      socket.to(roomId).emit('user-disconnected', userId);
    });

    // 8.1) Kamera “offer” → Diğer kullanıcılara ilet
    socket.on('offer', ({ to, offer , isScreenOffer}) => {
      console.log('offer: ', offer);
      console.log(`[Server] Offer from ${socket.userId} → ${to} and isScreenOffer=${isScreenOffer}`);
      socket.to(userSocketMap[to]).emit('offer', { from: socket.userId,offer, isScreenOffer });
    });

    // 8.2) Kamera “answer” → Diğer kullanıcılara ilet
    socket.on('answer', ({ to, answer ,isScreenAnswer}) => {
      console.log(`[Server] Answer from ${socket.userId} → ${to} and isScreenAnswer=${isScreenAnswer}`);
      socket.to(userSocketMap[to]).emit('answer', { from: socket.userId, answer , isScreenAnswer });
    });

    // 8.3) ICE Candidate → Diğer kullanıcılara ilet
    socket.on('ice-candidate', ({ to, candidate }) => {
      socket.to(userSocketMap[to]).emit('ice-candidate', { from: socket.userId, candidate });
    });

    // ───────────────────────────────────────────────────────────
    // 9) Ekran Paylaşımı Başlat: “start-screen-share”
    socket.on('start-screen-share', ({ to, offer }) => {
      console.log(`[Server] start-screen-share: from=${socket.userId}, to=${to}`);
      if (roomsScreenSharing[roomId]) {
        // Eğer zaten biri ekran paylaşıyorsa reddet
        socket.emit('screen-share-denied', { reason: 'Başka biri zaten ekran paylaşıyor.' });
      } else {
        roomsScreenSharing[roomId] = socket.userId;
        const targetSocketId = userSocketMap[to];
        console.log(`[Server] screen-share-started → targetSocketId=${targetSocketId}`);
        socket.to(targetSocketId).emit('screen-share-started', { userId: socket.userId, offer });
      }
    });

    // 10) Ekran Paylaşımı Durduruldu: “stop-screen-share”
    socket.on('stop-screen-share', ({ to, offer }) => {
      console.log(`[Server] stop-screen-share: from=${socket.userId}, to=${to}`);
      // “offer” ile yeniden kamera akışına geçiş yapacağız
      socket.to(to).emit('stop-screen-share', { userId: socket.userId, offer });
      if (roomsScreenSharing[roomId] === socket.userId) {
        delete roomsScreenSharing[roomId];
        // Tüm odaya ekran paylaşıldı bitti sinyali
        socket.to(roomId).emit('screen-share-stopped', { userId: socket.userId });
      }
    });
  });

  socket.on('join-chat', async ({ currentRoomId }) => {
    socket.join(currentRoomId);
    console.log(`Socket2 ${socket.id} joined room ${currentRoomId}`);
    
  });
  // ───────────────────────────────────────────────────────────
  // 1) send-message-p2p, send-message-group, get-messages vb. event’ler
  //    (Sizin kodunuza birebir kopyalayabilirsiniz)
  // ───────────────────────────────────────────────────────────


  socket.on('send-message-p2p', async ({ userId, content, originalname, mimetype, chatId }, buffer, ack) => {
    try {
      const token = socket.token;
      const form = new formData();
      form.append('userId', userId);
      form.append('content', content);
      form.append('messageType', mimetype ? mimetype.split('/')[0] : 'text');
      if (mimetype) {
        form.append('files', buffer, {
          filename: originalname || 'upload.png',
          contentType: mimetype || 'application/octet-stream'
        });
      }
      const sendMessage = await axios.post("https://scriber-backend.onrender.com/message/p2p", form, {
        headers: {
          ...form.getHeaders(),
          Cookie: `token=${token}`
        }
      });
      if (sendMessage.status === 200) {
        
        socket.to(chatId).emit("receive-message", sendMessage.data);
        if (typeof ack === 'function') ack(sendMessage.data);
      }
    } catch (err) {
      console.log(err);
    }
  });

  socket.on('send-message-group', async ({ chatId, content, originalname, mimetype }, buffer, ack) => {
    try {
      const token = socket.token;
      const form = new formData();
      form.append('chatId', chatId);
      form.append('content', content);
      form.append('messageType', mimetype ? mimetype.split('/')[0] : 'text');
      if (mimetype) {
        form.append('files', buffer, {
          filename: originalname || 'upload.png',
          contentType: mimetype || 'application/octet-stream'
        });
      }
      const sendMessage = await axios.post("https://scriber-backend.onrender.com/message/group", form, {
        headers: {
          ...form.getHeaders(),
          Cookie: `token=${token}`
        }
      });
      if (sendMessage.status === 200) {
        socket.to(chatId).emit("receive-message", sendMessage.data);
        if (typeof ack === 'function') ack(sendMessage.data);
      }
    } catch (err) {
      console.log(err);
    }
  });

  socket.on("get-messages", async ({ chatId }) => {
    try {
      const token = socket.token;
      const messages = await axios.get(`https://scriber-backend.onrender.com/message/${chatId}`, {
        headers: { Cookie: `token=${token}` }
      });
      if (messages.status === 200) {
        socket.emit("receive-messages", { messages: messages.data });
      }
    } catch (err) {
      console.log(err);
    }
  });



  socket.on('get-chat-list', async () => {
    try {
      const token = socket.token;
      //console.log("token", token);
      const { data } = await axios.get("https://scriber-backend.onrender.com/chat/all", {
        headers: { Cookie: `token=${token}` }
      });
      socket.emit("receive-chat-list", data);
    } catch (err) {
      console.log(err);
    }
  });

  socket.on('get-profile', async () => {
    try {
      const token = socket.token;
      const { data } = await axios.get("https://scriber-backend.onrender.com/user/profile", {
        headers: { Cookie: `token=${token}` }
      });
      socket.emit("receive-profile", data);
    } catch (err) {
      console.log(err);
    }
  });

  socket.on('get-users', async () => {
    try {
      const token = socket.token;
      console.log("token", token);
      const { data } = await axios.get(`https://scriber-backend.onrender.com/user/users/p2p`, {
        headers: { Cookie: `token=${token}` }
      });
      console.log("userlar getirildi", data);
      socket.emit("receive-users", data);
    } catch (err) {
      console.log(err);
    }
  });

  socket.on('get-users-group', async () => {
    try {
      const token = socket.token;
      const { data } = await axios.get(`https://scriber-backend.onrender.com/user/users/group`, {
        headers: { Cookie: `token=${token}` }
      });
      console.log("userlar getirildi", data);
      socket.emit("receive-users-group", data);
    } catch (err) {
      console.log(err);
    }
  });

  socket.on('create-chat', async ({ isGroupChat, chatName, participants, originalname, mimetype }, buffer) => {
    try {
      const token = socket.token;
      if (isGroupChat) {
        const form = new formData();
        form.append('chatName', chatName);
        form.append('users', JSON.stringify(participants));
        form.append('files', buffer, {
          filename: originalname || 'upload.png',
          contentType: mimetype || 'application/octet-stream'
        });
        const response = await axios.post("https://scriber-backend.onrender.com/chat/group", form, {
          headers: {
            ...form.getHeaders(),
            Cookie: `token=${token}`
          }
        });
        socket.emit("receive-chat", response.data);
      }
    } catch (err) {
      console.log(err);
    }
  });

  socket.on('start-call-notification',async ({room}) => {
     socket.to(room).emit('receive-start-call-notification',room);
  })
  // ───────────────────────────────────────────────────────────
  // 8) “join-room” (WebRTC Video & Ekran Paylaşımı için)

  // ───────────────────────────────────────────────────────────
  // 11) Genel “disconnect” Event’i
  socket.on('disconnect', () => {
    console.log("[Server] user disconnected");
  });
});

// ───────────────────────────────────────────────────────────
server.listen(process.env.PORT || 3001, () => {
  console.log("Sunucu 3001 portunda çalışıyor");
});

