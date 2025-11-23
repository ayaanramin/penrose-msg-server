import express from "express";
import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";
import cors from "cors";

const app = express();
const __dirname = path.resolve();

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Make sure images folder exists
const imgDir = path.join(__dirname, "images");
if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir);

app.post("/upload", (req, res) => {
    try {
        const { dataUrl } = req.body;
        if (!dataUrl) return res.status(400).json({ error: "No data URL" });

        const id = nanoid(8);
        const base64 = dataUrl.split(",")[1];

        const filePath = path.join(imgDir, `${id}.png`);
        fs.writeFileSync(filePath, Buffer.from(base64, "base64"));

        const fullUrl = `${req.protocol}://${req.get("host")}/img/${id}.png`;

        res.json({ url: fullUrl });
    } catch (e) {
        res.status(500).json({ error: e.toString() });
    }
});

app.use("/img", express.static("images"));

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log("Server running on port", port);
});
