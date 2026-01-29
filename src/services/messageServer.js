import http from "node:http";

const MAX_BODY_BYTES = 1024 * 1024;

function isLocalAddress(address) {
  return (
    address === "127.0.0.1" ||
    address === "::1" ||
    address === "::ffff:127.0.0.1"
  );
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk.toString();
      if (data.length > MAX_BODY_BYTES) {
        reject(new Error("body_too_large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(err);
      }
    });
  });
}

export function startMessageServer(client, cfg) {
  if (!cfg.messageServerEnabled) return null;
  const port = Number(cfg.messageServerPort || 18790);
  const token = String(cfg.messageServerToken || "");

  const server = http.createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/message") {
      res.writeHead(404);
      res.end("not found");
      return;
    }

    if (!token && !isLocalAddress(req.socket.remoteAddress)) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }

    if (token) {
      const auth = String(req.headers.authorization || "");
      if (auth !== `Bearer ${token}`) {
        res.writeHead(401);
        res.end("unauthorized");
        return;
      }
    }

    let payload = {};
    try {
      payload = await readJson(req);
    } catch (err) {
      res.writeHead(400);
      res.end("invalid json");
      return;
    }

    const channelId = String(payload.channelId || "").trim();
    const message = String(payload.message || "");
    if (!channelId || !message) {
      res.writeHead(400);
      res.end("channelId and message required");
      return;
    }

    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel?.isTextBased()) {
        res.writeHead(400);
        res.end("channel not text-based");
        return;
      }
      await channel.send({ content: message });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(500);
      res.end("send failed");
    }
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`message server listening on 127.0.0.1:${port}`);
  });

  return server;
}
