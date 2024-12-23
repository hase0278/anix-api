import dotenv from 'dotenv';
import https from "node:https";
import http from "node:http";
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { ANIME, StreamingServers } from '@consumet/extensions';
import Redis from 'ioredis';
import cache from './utils/cache.js';
import cors from 'cors';

const app = express();
dotenv.config();
app.use(cors());
const anix = new ANIME.Anix();
const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
const __dirname = path.dirname(__filename); // get the name of the directory
const PORT = process.env.PORT || 3000;
const redisUri = `rediss://default:${process.env.REDIS_PASSWORD}@${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`;
const redis = process.env.REDIS_HOST && new Redis(redisUri);

const redisCacheTime = 60 * 60;
const redisPrefix = 'anix:';

app.listen(PORT, () => {
    if (process.env.REDIS_HOST) {
        console.warn('Redis found. Cache enabled.');
    }
    console.log("Server Listening on PORT:", PORT);
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'html', 'playground.html'));
});

app.get('/health', (req, res) => {
    res.status(200).send('Welcome to anix api!');
});

app.get("/m3u8-proxy", async (req, res) => {
    let responseSent = false;

    const safeSendResponse = (statusCode, data) => {
        if (!responseSent) {
            responseSent = true;
            res.status(statusCode).send(data);
        }
    };
    try {
        const url = new URL(req.query.url);
        const headersParam = decodeURIComponent(req.query.headers || "");
        const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.116 Safari/537.36';

        if (!url) {
            safeSendResponse(400, { message: "Invalid URL" });
        }

        const headers = {
            "User-Agent": userAgent
        };
        if (headersParam) {
            const additionalHeaders = JSON.parse(headersParam);
            Object.entries(additionalHeaders).forEach(([key, value]) => {
                if (!["Access-Control-Allow-Origin", "Access-Control-Allow-Methods", "Access-Control-Allow-Headers"].includes(key)) {
                    headers[key] = value;
                }
            });
        }
        if (url.pathname.endsWith(".mp4")) {
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
        }
        else {
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = "1";
        }

        const targetResponse = await fetch(url, {
            headers: headers,
        });

        let modifiedM3u8;
        let forceHTTPS = false;
        res.setHeader("Access-Control-Allow-Origin", "*");
        if (url.pathname.endsWith(".m3u8")) {
            modifiedM3u8 = await targetResponse.text();
            const targetUrlTrimmed = encodeURIComponent(url.origin + url.pathname.replace(/[^/]+\.m3u8$/, "").trim());
            modifiedM3u8 = modifiedM3u8.split("\n").map((line) => {
                if (line.startsWith("#") || line.trim() == '') {
                    return line;
                }
                return `/m3u8-proxy?url=${targetUrlTrimmed}${encodeURIComponent(line)}${headersParam ? `&headers=${encodeURIComponent(headersParam)}` : ""}`;
            }).join("\n");
            res.status(200)
                .set('Content-Type', targetResponse.headers.get("Content-Type") || "application/vnd.apple.mpegurl")
                .send(modifiedM3u8 || await targetResponse.text());
        }
        else if (url.pathname.endsWith(".ts") || url.pathname.endsWith(".mp4")) {
            if (req.query.url.startsWith("https://")) {
                forceHTTPS = true;
            }

            const uri = new URL(url);

            // Options
            // It might be worth adding ...req.headers to the headers object, but once I did that
            // the code broke and I receive errors such as "Cannot access direct IP" or whatever.
            const options = {
                hostname: uri.hostname,
                port: uri.port,
                path: uri.pathname + uri.search,
                method: req.method,
                headers: headers,
                timeout: 10000
            };

            // Proxy request and pipe to client
            try {
                if (forceHTTPS) {
                    const proxy = https.request(options, (r) => {
                        if (url.pathname.endsWith(".mp4")) {
                            r.headers["content-type"] = "video/mp4";
                            r.headers["accept-ranges"] = "bytes";
                            const fileName = req.query.filename || undefined;
                            if (fileName) {
                                r.headers['content-disposition'] = `attachment; filename="${fileName}.mp4"`;
                            }
                        }
                        else {
                            r.headers["content-type"] = "video/mp2t";
                        }
                        r.headers["Access-Control-Allow-Origin"] = "*";
                        res.writeHead(r.statusCode ?? 200, r.headers);

                        r.pipe(res, {
                            end: true,
                        });
                    });

                    req.pipe(proxy, {
                        end: true,
                    });
                    proxy.on('timeout', () => {
                        safeSendResponse(504, { message: "Request timed out." });
                        proxy.destroy();
                    });

                    proxy.on('error', (err) => {
                        console.error('Proxy request error:', err.message);
                        safeSendResponse(500, { message: "Proxy failed.", error: err.message });
                    });
                } else {
                    const proxy = http.request(options, (r) => {
                        if (url.pathname.endsWith(".mp4")) {
                            r.headers["content-type"] = "video/mp4";
                            r.headers["accept-ranges"] = "bytes";
                            const fileName = req.query.filename || undefined;
                            if (fileName) {
                                r.headers['content-disposition'] = `attachment; filename="${fileName}.mp4"`;
                            }
                        }
                        else {
                            r.headers["content-type"] = "video/mp2t";
                        }
                        r.headers["Access-Control-Allow-Origin"] = "*";
                        res.writeHead(r.statusCode ?? 200, r.headers);

                        r.pipe(res, {
                            end: true,
                        });
                    });
                    proxy.on('timeout', () => {
                        safeSendResponse(504, { message: "Request timed out." });
                        if (!responseSent) {
                            responseSent = true;
                        }
                        proxy.destroy();
                    });

                    proxy.on('error', (err) => {
                        console.error('Proxy request error:', err.message);
                        safeSendResponse(500, { message: "Proxy failed.", error: err.message });
                    });
                    req.pipe(proxy, {
                        end: true,
                    });
                }
            } catch (e) {
                res.writeHead(500);
                res.end(e.message);
            }
        }
        else {
            res.setHeader("Content-Type", targetResponse.headers.get("Content-Type"));
            res.setHeader("Content-Length", targetResponse.headers.get("Content-Length") || 0);
            safeSendResponse(200, await targetResponse.text());
        }
    } catch (e) {
        console.log(e);
        safeSendResponse(500, { message: e.message });
    }
});

app.get("/recent-episodes", async (req, res) => {
    try {
        const page = req.query?.page ?? 1;
        const type = req.query?.type ?? 1;
        const response = redis ? await cache.fetch(
            redis,
            `${redisPrefix}recent-episodes;page;${page};type;${type}`,
            async () => await anix.fetchRecentEpisodes(page, type),
            redisCacheTime,
        ) : await anix.fetchRecentEpisodes(page, type);
        return res.status(200).send(response);
    } catch (e) {
        res.status(500).send({ message: e.message });
    }
});

app.get("/search", async (req, res) => {
    try {
        const keyword = req.query?.keyword ?? undefined;
        const page = req.query?.page ?? 1;
        if (!keyword) {
            return res.status(400).send({ message: "Search keyword is required" });
        }
        const response = redis ? await cache.fetch(
            redis,
            `${redisPrefix}search;${keyword};${page};`,
            async () => await anix.search(keyword, page),
            redisCacheTime,
        ) : await anix.search(keyword, page);
        return res.status(200).send(response);
    } catch (e) {
        res.status(500).send({ message: e.message });
    }
});

app.get("/info", async (req, res) => {
    try {
        const id = req.query?.id ?? undefined;
        if (!id) {
            return res.status(400).send({ message: "id is required" });
        }
        const response = redis ? await cache.fetch(
            redis,
            `${redisPrefix}info;${id};`,
            async () => await anix.fetchAnimeInfo(id),
            redisCacheTime,
        ) : await anix.fetchAnimeInfo(id);
        return res.status(200).send(response);
    } catch (e) {
        res.status(500).send({ message: e.message });
    }
});

app.get("/watch", async (req, res) => {
    try {
        const id = req.query?.id ?? undefined;
        const epId = req.query?.epId ?? undefined;
        const server = req.query?.server ?? undefined;
        const type = req.query?.type ?? 'sub';
        if (type !== 'sub' && type !== 'dub') {
            return res.status(400).send({ message: "type must be sub or dub" });
        }
        if (!id) {
            return res.status(400).send({ message: "id is required" });
        }
        if (!epId) {
            return res.status(400).send({ message: "epId is required" });
        }
        if (server) {
            let finalServer = StreamingServers.BuiltIn;
            switch (server) {
                case "streamwish":
                    finalServer = StreamingServers.StreamWish;
                    break;
                case "mp4upload":
                    finalServer = StreamingServers.Mp4Upload;
                    break;
                case "vidstream":
                    finalServer = StreamingServers.BuiltIn;
                    break;
                case "vidhide":
                    finalServer = StreamingServers.VidHide;
                    break;
                default:
                    return res.status(400).send({ message: "Invalid server" });
            }
            const response = redis ? await cache.fetch(
                redis,
                `${redisPrefix}watch;${id};${epId};${finalServer};`,
                async () => await anix.fetchEpisodeSources(id, epId, finalServer, type),
                redisCacheTime,
            ) : await anix.fetchEpisodeSources(id, epId, finalServer, type);
            return res.status(200).send(response);
        }
        else {
            const response = redis ? await cache.fetch(
                redis,
                `${redisPrefix}watch;${id};${epId};${StreamingServers.VidStream};type;${type}`,
                async () => await anix.fetchEpisodeSources(id, epId, StreamingServers.BuiltIn, type),
                redisCacheTime,
            ) : await anix.fetchEpisodeSources(id, epId, StreamingServers.BuiltIn, type);
            return res.status(200).send(response);
        }
    } catch (e) {
        res.status(500).send({ message: e.message });
    }
});

app.get("/servers", async (req, res) => {
    try {
        const id = req.query?.id ?? undefined;
        const epId = req.query?.epId ?? undefined;
        const type = req.query?.type ?? 'sub';
        if (type !== 'sub' && type !== 'dub') {
            return res.status(400).send({ message: "type must be sub or dub" });
        }
        if (!id) {
            return res.status(400).send({ message: "id is required" });
        }
        if (!epId) {
            return res.status(400).send({ message: "epId is required" });
        }
        const response = redis ? await cache.fetch(
            redis,
            `${redisPrefix}server;${id};${epId};type;${type}`,
            async () => await anix.fetchEpisodeServerType(id, epId, type),
            redisCacheTime,
        ) : await anix.fetchEpisodeServerType(id, epId, type);
        return res.status(200).send(response);
    } catch (e) {
        res.status(500).send({ message: e.message });
    }
});

app.get("/random-anime", async (req, res) => {
    try {
        const response = redis ? await cache.fetch(
            redis,
            `${redisPrefix}random`,
            async () => await anix.fetchRandomAnimeInfo(),
            redisCacheTime * 24,
        ) : await anix.fetchRandomAnimeInfo();
        return res.status(200).send(response);
    }
    catch (e) {
        res.status(500).send({ message: e.message });
    }
});
