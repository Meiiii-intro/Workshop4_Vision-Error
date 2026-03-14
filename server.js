const path = require("path");
const os = require("os");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

function getLocalIPv4() {
  const interfaces = os.networkInterfaces();

  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      const isIPv4 = net.family === "IPv4" || net.family === 4;
      const isInternal = net.internal === true;

      if (isIPv4 && !isInternal) {
        return net.address;
      }
    }
  }

  return null;
}

app.get('/server-info', (req, res) => {
  const host = req.get('host'); 
  const protocol = req.protocol;
  
  res.json({
    mobileURL: `${protocol}://${host}/mobile.html`
  });
});

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("cameraFrame", (payload) => {
    socket.broadcast.emit("cameraFrame", payload);
  });

  socket.on("visionState", (payload) => {
    socket.broadcast.emit("visionState", payload);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);

  const localIP = getLocalIPv4();
  if (localIP) {
    console.log(`Mobile viewer available at: http://${localIP}:${PORT}/mobile.html`);
  } else {
    console.log("No LAN IPv4 detected.");
  }
});