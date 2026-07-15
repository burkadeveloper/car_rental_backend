const jwt = require("jsonwebtoken");
let io;

exports.initSocket = (server) => {
  io = require("socket.io")(server, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:3000",
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("Authentication error"));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      socket.role = decoded.role;
      next();
    } catch (err) {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    console.log(`User ${socket.userId} connected`);
    socket.join(`user_${socket.userId}`);
    if (["staff", "admin"].includes(socket.role)) {
      socket.join("staff");
    }

    socket.on("disconnect", () => {
      console.log("Client disconnected");
    });
  });

  return io;
};

// ✅ This exports the getter function correctly
exports.getIo = () => {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
};
