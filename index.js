const express = require("express");
const colors = require("colors");
const path = require("path");
const dataset = require("./database/nations.json");
const diseases = require("./database/diseases.json");

const app = express();
const PORT = process.env.PORT || 3000;
const BRAND = "BioShield";

// --- 1. View Engine Setup ---
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "website", "views"));

// --- 2. Static Files & Middleware ---
// Serves index.css from website/public (Available at /index.css)
app.use(express.static(path.join(__dirname, "website", "public")));

app.use((req, res, next) => {
    const requestStart = Date.now();
    res.on("finish", () => {
        const durationMs = Date.now() - requestStart;
        const statusColor = res.statusCode >= 500
            ? "red"
            : res.statusCode >= 400
                ? "yellow"
                : res.statusCode >= 300
                    ? "cyan"
                    : "green";

        const methodLabel = `[${req.method}]`.bold.white;
        const routeLabel = `${req.originalUrl}`.brightCyan;
        const statusLabel = `${res.statusCode}`[statusColor].bold;
        const timeLabel = `${durationMs}ms`.gray;

        console.log(`🛡 ${BRAND}`.brightMagenta + ` ${methodLabel} ${routeLabel} ${statusLabel} ${timeLabel}`);
    });
    next();
});

// Serves JS assets from website/public/javascript (Available at /javascript/main.js)

// --- 3. Routes ---
app.get("/", (req, res) => {
    res.render("index", { name: "홍길동" });
});

app.get("/api/nations", (req, res) => {
    res.json(dataset);
});

app.get("/api/diseases", (req, res) => {
    res.json(diseases);
});

// --- 4. Start Server ---
app.listen(PORT, () => {
    console.log("\n╔══════════════════════════════════════════════╗".brightMagenta);
    console.log("║               BIOSHIELD ONLINE              ║".brightMagenta.bold);
    console.log("╚══════════════════════════════════════════════╝".brightMagenta);
    console.log(`🧠 Engine`.brightGreen + `  EJS + Express`.white);
    console.log(`🌐 Access`.brightCyan + `  http://localhost:${PORT}`.underline.brightCyan);
    console.log(`📡 APIs`.brightYellow + `    /api/nations   /api/diseases`.white);
    console.log("──────────────────────────────────────────────".gray);
});