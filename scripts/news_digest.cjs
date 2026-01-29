#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const CONFIG_PATH = path.join(ROOT, "config.json");
const FEEDS_PATH = path.join(ROOT, "news_feeds.json");
const STATE_PATH = path.join(ROOT, "memory", "news_state.json");
const RSS_POLL = path.join(__dirname, "rss_poll.py");

const MAX_MESSAGE_LENGTH = 1900;
const TRANSLATE_ENABLED = process.env.NEWS_DIGEST_TRANSLATE !== "0";
const TRANSLATE_TARGET = process.env.NEWS_DIGEST_TRANSLATE_LANG || "zh-CN";
const TRANSLATE_TIMEOUT_MS =
  Number(process.env.NEWS_DIGEST_TRANSLATE_TIMEOUT_MS) || 6000;
const SUMMARY_MAX_LEN = Number(process.env.NEWS_DIGEST_SUMMARY_MAX_LEN) || 80;

function loadJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    if (fallback !== undefined) return fallback;
    throw err;
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function parseDate(value) {
  if (!value) return 0;
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}

function stripUrls(text) {
  if (!text) return "";
  return text.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(text) {
  if (!text) return "";
  return text.replace(/<[^>]*>/g, " ");
}

function normalizeSummary(text) {
  if (!text) return "";
  const cleaned = decodeHtmlEntities(stripHtml(text));
  return cleaned.replace(/\s+/g, " ").trim();
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function truncateText(text, maxLen) {
  if (!text) return "";
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trim() + "…";
}

function cleanSummary(summary, title) {
  const normalized = normalizeSummary(summary);
  if (!normalized) return "";
  if (!title) return normalized;
  const titleNorm = normalizeSummary(title);
  if (!titleNorm) return normalized;
  const prefixRegex = new RegExp(
    "^" + escapeRegExp(titleNorm) + "[\\s\\-—:：,，]*",
    "i"
  );
  const trimmed = normalized.replace(prefixRegex, "").trim();
  return trimmed || normalized;
}

function needsTranslation(text) {
  return /[A-Za-z]/.test(text || "");
}

async function translateText(text) {
  if (!TRANSLATE_ENABLED || !text || !needsTranslation(text)) return text;
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", "auto");
  url.searchParams.set("tl", TRANSLATE_TARGET);
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", text);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TRANSLATE_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        "User-Agent": "news-digest/1.0",
      },
    });
    if (!res.ok) return text;
    const data = await res.json();
    const translated = Array.isArray(data?.[0])
      ? data[0].map((part) => part?.[0]).join("")
      : "";
    return translated ? translated.trim() : text;
  } catch {
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

async function translateItems(items) {
  const titleCache = new Map();
  const summaryCache = new Map();
  const results = [];
  for (const item of items) {
    const rawTitle = stripUrls(item.title);
    const rawSummary = cleanSummary(item.summary, rawTitle);

    let translatedTitle = rawTitle;
    if (rawTitle) {
      if (titleCache.has(rawTitle)) {
        translatedTitle = titleCache.get(rawTitle);
      } else {
        translatedTitle = await translateText(rawTitle);
        titleCache.set(rawTitle, translatedTitle);
      }
    }

    let translatedSummary = rawSummary;
    if (rawSummary) {
      if (summaryCache.has(rawSummary)) {
        translatedSummary = summaryCache.get(rawSummary);
      } else {
        translatedSummary = await translateText(rawSummary);
        summaryCache.set(rawSummary, translatedSummary);
      }
    }

    results.push({
      ...item,
      title: translatedTitle || rawTitle || item.title,
      summary: translatedSummary || rawSummary || item.summary,
    });
  }
  return results;
}

function pollFeed(url, maxItems, statePath, timeoutMs) {
  const args = [
    RSS_POLL,
    "--feed",
    url,
    "--state",
    statePath,
    "--max",
    String(maxItems),
    "--json",
  ];
  const res = spawnSync("python3", args, {
    encoding: "utf8",
    timeout: timeoutMs,
  });
  if (res.error && res.error.code === "ETIMEDOUT") {
    throw new Error(`rss_poll timeout for ${url}`);
  }
  if (res.status !== 0) {
    const details = (res.stderr || res.stdout || "").trim();
    throw new Error(`rss_poll failed for ${url}: ${details || res.status}`);
  }
  const output = (res.stdout || "").trim();
  if (!output) return [];
  try {
    return JSON.parse(output);
  } catch (err) {
    throw new Error(`rss_poll invalid JSON for ${url}: ${err.message}`);
  }
}

function formatDateTime(now, timezone) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);
}

function buildMessage(sections, timezone, perSectionLimit) {
  const now = new Date();
  const header = `【每日新闻摘要】${formatDateTime(now, timezone)}`;
  const parts = [header];

  for (const section of sections) {
    parts.push(`【${section.name}】`);
    if (!section.items.length) {
      parts.push("暂无新增");
      continue;
    }
    const items = section.items.slice(0, perSectionLimit);
    for (const item of items) {
      const title = stripUrls(item.title);
      if (!title) continue;
      const summary = truncateText(
        cleanSummary(item.summary, title),
        SUMMARY_MAX_LEN
      );
      const source = item.source ? `（${item.source}）` : "";
      if (summary) {
        parts.push(`- ${title}${source}｜${summary}`);
      } else {
        parts.push(`- ${title}${source}`);
      }
    }
  }

  return parts.join("\n");
}

function dedupeItems(items) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = stripUrls(item.title).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function filterItemsByKeywords(items, keywords) {
  if (!Array.isArray(keywords) || keywords.length === 0) return items;
  const needle = keywords.map((word) => String(word).toLowerCase());
  return items.filter((item) => {
    const title = stripUrls(item.title).toLowerCase();
    if (!title) return false;
    return needle.some((word) => word && title.includes(word));
  });
}

async function sendDiscordMessage(token, channelId, content) {
  if (process.env.NEWS_DIGEST_DRY_RUN === "1") {
    console.log(content);
    return;
  }
  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bot ${token}`,
    },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`discord send failed: ${res.status} ${text}`);
  }
}

function defaultFeeds() {
  return {
    timezone: "Asia/Shanghai",
    maxItemsPerSection: 5,
    sections: [
      {
        name: "美股",
        feeds: [
          {
            name: "Nasdaq Markets",
            url: "https://www.nasdaq.com/feed/rssoutbound?category=Markets",
          },
          {
            name: "WSJ Markets",
            url: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml",
          },
        ],
      },
      {
        name: "加密",
        feeds: [
          {
            name: "CoinDesk",
            url: "https://www.coindesk.com/arc/outboundfeeds/rss/",
          },
          {
            name: "Nasdaq Crypto",
            url: "https://www.nasdaq.com/feed/rssoutbound?category=Cryptocurrencies",
          },
        ],
      },
      {
        name: "全球政治/军事",
        keywords: [
          "war",
          "military",
          "defense",
          "army",
          "missile",
          "nuclear",
          "attack",
          "security",
          "conflict",
          "ceasefire",
          "sanction",
          "election",
          "government",
          "president",
          "prime minister",
          "parliament",
          "diplomatic",
          "coup",
          "terror",
          "strike",
          "nato",
          "un ",
          "summit",
          "minister",
          "外交",
          "军事",
          "战争",
          "冲突",
          "制裁",
          "选举",
          "政府",
          "总统",
          "首相",
          "国会",
          "军",
          "袭击",
          "导弹",
          "安全",
          "北约",
          "联合国",
        ],
        feeds: [
          {
            name: "The Guardian World",
            url: "https://www.theguardian.com/world/rss",
          },
          {
            name: "Al Jazeera",
            url: "https://www.aljazeera.com/xml/rss/all.xml",
          },
        ],
      },
    ],
  };
}

async function main() {
  const config = loadJson(CONFIG_PATH);
  const isDryRun = process.env.NEWS_DIGEST_DRY_RUN === "1";
  const feedTimeoutMs = Number(process.env.NEWS_DIGEST_FEED_TIMEOUT_MS) || 8000;
  const token = config.discordToken;
  const channelId = process.env.NEWS_DIGEST_CHANNEL_ID || config.adminChannelId;

  if (!token || !channelId) {
    throw new Error("missing discordToken/adminChannelId in config.json");
  }

  const statePath = isDryRun ? `${STATE_PATH}.dryrun` : STATE_PATH;
  ensureDir(path.dirname(statePath));

  const feedConfig = loadJson(FEEDS_PATH, defaultFeeds());
  const timezone = feedConfig.timezone || "Asia/Shanghai";
  const maxItemsPerSection =
    typeof feedConfig.maxItemsPerSection === "number"
      ? feedConfig.maxItemsPerSection
      : 5;

  const sections = [];
  for (const section of feedConfig.sections || []) {
    const items = [];
    for (const feed of section.feeds || []) {
      const maxItems = typeof feed.maxItems === "number" ? feed.maxItems : 10;
      try {
        const newItems = pollFeed(feed.url, maxItems, statePath, feedTimeoutMs);
        for (const item of newItems) {
          items.push({
            title: item.title,
            summary: item.summary,
            published: item.published,
            source: feed.name,
          });
        }
      } catch (err) {
        console.error(err.message);
      }
    }
    const deduped = dedupeItems(items).sort(
      (a, b) => parseDate(b.published) - parseDate(a.published)
    );
    const filtered = filterItemsByKeywords(deduped, section.keywords);
    const translated = await translateItems(filtered);
    sections.push({ name: section.name, items: translated });
  }

  let perSectionLimit = maxItemsPerSection;
  let message = buildMessage(sections, timezone, perSectionLimit);
  while (message.length > MAX_MESSAGE_LENGTH && perSectionLimit > 1) {
    perSectionLimit -= 1;
    message = buildMessage(sections, timezone, perSectionLimit);
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    message = message.slice(0, MAX_MESSAGE_LENGTH - 1) + "…";
  }

  await sendDiscordMessage(token, channelId, message);
}

main().catch((err) => {
  console.error(err?.stack || err);
  process.exitCode = 1;
});
