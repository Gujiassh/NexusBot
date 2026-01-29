#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "..", "config.json");
const DEFAULT_QUERY = "Shuangpu, Xihu District, Hangzhou, China";
const DEFAULT_COORDS = { latitude: 30.086, longitude: 120.101 };
const DEFAULT_NAME = "西湖区双浦镇";
const TIMEZONE = "Asia/Shanghai";
const USER_AGENT = "NexusBot/1.0 (weather notify)";

function formatDateInTz(date, timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

async function fetchWithTimeout(url, options = {}, ms = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function geocodeLocation(query) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  const res = await fetchWithTimeout(
    url.toString(),
    {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      },
    },
    8000
  );
  if (!res.ok) throw new Error(`geocoding failed: ${res.status}`);
  const data = await res.json();
  const first = data?.[0];
  if (!first?.lat || !first?.lon) return null;
  return {
    latitude: Number(first.lat),
    longitude: Number(first.lon),
    name: first.display_name?.split(",")?.[0] || DEFAULT_NAME,
  };
}

function parseInitToDate(init) {
  if (typeof init !== "string" || !/^[0-9]{10}$/.test(init)) return null;
  const year = Number(init.slice(0, 4));
  const month = Number(init.slice(4, 6));
  const day = Number(init.slice(6, 8));
  const hour = Number(init.slice(8, 10));
  return new Date(Date.UTC(year, month - 1, day, hour));
}

function seriesTimeToDate(initDate, hours) {
  if (!initDate || typeof hours !== "number") return null;
  return new Date(initDate.getTime() + hours * 60 * 60 * 1000);
}

async function fetchForecast({ latitude, longitude }) {
  const url = new URL("https://www.7timer.info/bin/api.pl");
  url.searchParams.set("lon", String(longitude));
  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("product", "civil");
  url.searchParams.set("output", "json");
  const res = await fetchWithTimeout(url.toString(), {
    headers: {
      "User-Agent": USER_AGENT,
    },
  });
  if (!res.ok) throw new Error(`forecast failed: ${res.status}`);
  return await res.json();
}

async function sendDiscordMessage(token, channelId, content) {
  if (process.env.WEATHER_NOTIFY_DRY_RUN === "1") {
    console.log(`[dry-run] would send to ${channelId}: ${content}`);
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

async function main() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  const token = config.discordToken;
  const channelId = config.adminChannelId;
  const mentionId = config.ownerUserIds?.[0];

  if (!token || !channelId || !mentionId) {
    throw new Error("missing discordToken/adminChannelId/ownerUserIds in config.json");
  }

  let coords = null;
  try {
    coords = await geocodeLocation(DEFAULT_QUERY);
  } catch {
    coords = null;
  }

  if (!coords) {
    coords = { ...DEFAULT_COORDS, name: DEFAULT_NAME };
  }

  const forecast = await fetchForecast(coords);
  const targetDate = formatDateInTz(new Date(Date.now() + 24 * 60 * 60 * 1000), TIMEZONE);
  const initDate = parseInitToDate(forecast?.init);
  const series = Array.isArray(forecast?.dataseries) ? forecast.dataseries : [];
  const daySeries = series.filter((item) => {
    const when = seriesTimeToDate(initDate, Number(item?.timepoint));
    const dateStr = when ? formatDateInTz(when, TIMEZONE) : null;
    return dateStr === targetDate;
  });
  const pickedSeries = daySeries.length ? daySeries : series.slice(0, 24);
  const firstWhen = seriesTimeToDate(initDate, Number(series[0]?.timepoint));
  const date = daySeries.length
    ? targetDate
    : (firstWhen ? formatDateInTz(firstWhen, TIMEZONE) : targetDate);
  const temps = pickedSeries
    .map((item) => item?.temp2m)
    .filter((value) => typeof value === "number");
  const tmax = temps.length ? Math.max(...temps) : null;
  const tmin = temps.length ? Math.min(...temps) : null;
  const precipTypes = pickedSeries
    .map((item) => item?.prec_type)
    .filter((value) => typeof value === "string");
  const precipAmounts = pickedSeries
    .map((item) => item?.prec_amount)
    .filter((value) => typeof value === "number");
  const rainByType = precipTypes.some((value) => value && value !== "none");
  const rainByAmount = precipAmounts.some((value) => value > 0);

  if (rainByType || rainByAmount) {
    const mention = `<@${mentionId}>`;
    const parts = [
      `${mention} ${coords.name || DEFAULT_NAME} ${date || "明天"}有降水预报。`,
      tmax != null && tmin != null ? `温度：${tmin}–${tmax}°C` : null,
    ].filter(Boolean);
    await sendDiscordMessage(token, channelId, parts.join(" "));
  }
}

main().catch((err) => {
  console.error(err?.stack || err);
  process.exitCode = 1;
});
