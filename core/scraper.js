import axios from "axios";
import * as cheerio from "cheerio";
import dns from "node:dns/promises";
import net from "node:net";
import { URL } from "node:url";

const DEFAULTS = {
  maxPages: Number(process.env.SCRAPER_MAX_PAGES || 6),
  maxPageBytes: Number(process.env.SCRAPER_MAX_PAGE_BYTES || 500000),
  timeoutMs: Number(process.env.SCRAPER_TIMEOUT_MS || 8000),
  minDelayMs: Number(process.env.SCRAPER_MIN_DELAY_MS || 500)
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function ipv6ToBigInt(address) {
  let value = address.toLowerCase();
  if (value.includes('.')) {
    const lastColon = value.lastIndexOf(':');
    const ipv4Text = value.slice(lastColon + 1);
    if (!net.isIPv4(ipv4Text)) throw new Error('INVALID_IPV6');
    const number = ipv4Text.split('.').map(Number).reduce((n, part) => (n << 8) + part, 0);
    value = `${value.slice(0, lastColon + 1)}${(number >>> 16).toString(16)}:${(number & 0xffff).toString(16)}`;
  }

  const [left, right] = value.split('::');
  let parts;
  if (right !== undefined) {
    const leftParts = left ? left.split(':') : [];
    const rightParts = right ? right.split(':') : [];
    parts = [...leftParts, ...Array(8 - leftParts.length - rightParts.length).fill('0'), ...rightParts];
  } else {
    parts = value.split(':');
  }
  if (parts.length !== 8) throw new Error('INVALID_IPV6');
  return parts.reduce((result, part) => (result << 16n) + BigInt(parseInt(part || '0', 16)), 0n);
}

function isPrivateIp(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      (a === 100 && b >= 64 && b <= 127) ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  if (!net.isIPv6(address)) return false;

  try {
    const value = ipv6ToBigInt(address);
    const first8 = value >> 120n;
    const first10 = value >> 118n;
    const mappedPrefix = value >> 32n;
    if (value === 1n) return true; // ::1
    if (first8 === 0xffn) return true; // multicast
    if ((value >> 121n) === 0b1111110n) return true; // fc00::/7
    if (first10 === 0b1111111010n) return true; // fe80::/10
    if (mappedPrefix === 0xffffn) {
      const ipv4 = Number(value & 0xffffffffn);
      const octets = [ipv4 >>> 24, (ipv4 >>> 16) & 255, (ipv4 >>> 8) & 255, ipv4 & 255].join('.');
      return isPrivateIp(octets);
    }
    return false;
  } catch {
    const normalized = address.toLowerCase();
    return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:');
  }
}

export async function validateExternalUrl(value, { allowPrivate = false } = {}) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("COMPANY_URL_INVALID");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("COMPANY_URL_PROTOCOL_UNSUPPORTED");
  }
  if (parsed.username || parsed.password) {
    throw new Error("COMPANY_URL_CREDENTIALS_NOT_ALLOWED");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!allowPrivate) {
    if (["localhost", "localhost.localdomain"].includes(hostname)) {
      throw new Error("COMPANY_URL_PRIVATE_BLOCKED");
    }
    if (net.isIP(hostname) && isPrivateIp(hostname)) {
      throw new Error("COMPANY_URL_PRIVATE_BLOCKED");
    }

    try {
      const addresses = await dns.lookup(hostname, { all: true });
      if (addresses.some(({ address }) => isPrivateIp(address))) {
        throw new Error("COMPANY_URL_PRIVATE_BLOCKED");
      }
    } catch (error) {
      if (error.message === "COMPANY_URL_PRIVATE_BLOCKED") throw error;
      // The HTTP request below will produce the final failure message for an unresolved host.
    }
  }

  return parsed;
}

function parseRobots(text) {
  const groups = [];
  let current = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line) continue;

    const separator = line.indexOf(":");
    if (separator < 0) continue;

    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (key === "user-agent") {
      current = groups.find((group) => group.agents.includes(value.toLowerCase()));
      if (!current) {
        current = { agents: [value.toLowerCase()], disallow: [] };
        groups.push(current);
      }
    } else if (key === "disallow" && current) {
      current.disallow.push(value);
    }
  }

  return groups;
}

function robotsAllows(robots, targetUrl) {
  if (!robots) return true;
  const parsed = new URL(targetUrl);
  const matching = robots.filter(
    (group) => group.agents.includes("*") || group.agents.includes("trao-assessment-bot")
  );
  if (!matching.length) return true;

  const path = `${parsed.pathname}${parsed.search}`;
  return !matching.some((group) =>
    group.disallow.some((rule) => rule && path.startsWith(rule))
  );
}

function normalizeLink(href, baseUrl) {
  try {
    if (!href || /^(javascript:|mailto:|tel:)/i.test(href)) return null;
    const url = new URL(href, baseUrl);
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

function scoreLink(url, anchorText = "") {
  const haystack = `${url} ${anchorText}`.toLowerCase();
  const weights = [
    ["interview", 12],
    ["hiring", 11],
    ["career", 10],
    ["careers", 10],
    ["jobs", 10],
    ["open roles", 9],
    ["work with us", 9],
    ["join us", 8],
    ["engineering", 8],
    ["handbook", 8],
    ["life at", 7],
    ["culture", 6],
    ["about", 5],
    ["team", 4],
    ["values", 4],
    ["people", 3],
    ["benefit", 3]
  ];

  return weights.reduce(
    (score, [term, weight]) => score + (haystack.includes(term) ? weight : 0),
    0
  );
}

async function fetchPageHtml(url, { origin, allowPrivate, settings, rateState, warnings }) {
  let currentUrl = url;

  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    await validateExternalUrl(currentUrl, { allowPrivate });

    await sleep(
      rateState.lastRequestAt
        ? Math.max(0, settings.minDelayMs - (Date.now() - rateState.lastRequestAt))
        : 0
    );
    rateState.lastRequestAt = Date.now();

    try {
      const response = await axios.get(currentUrl, {
        timeout: settings.timeoutMs,
        maxContentLength: settings.maxPageBytes,
        maxBodyLength: settings.maxPageBytes,
        maxRedirects: 0,
        responseType: "text",
        validateStatus: () => true,
        headers: { "User-Agent": "Trao-Assessment-Bot/1.0" }
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.location;
        if (!location || redirectCount === 3) {
          warnings.push(`Skipped ${currentUrl}: REDIRECT_LIMIT.`);
          return null;
        }

        const redirected = new URL(location, currentUrl);
        const currentHost = new URL(currentUrl).hostname.toLowerCase();
        const baseHost = new URL(origin).hostname.toLowerCase();
        const sameHostFamily =
          redirected.hostname.toLowerCase() === currentHost ||
          redirected.hostname.toLowerCase() === baseHost ||
          redirected.hostname.toLowerCase() === `www.${baseHost}` ||
          baseHost === `www.${redirected.hostname.toLowerCase()}`;
        if (!sameHostFamily) {
          warnings.push(`Skipped redirect from ${currentUrl}: cross-site redirect.`);
          return null;
        }

        currentUrl = redirected.href;
        continue;
      }

      if (response.status === 429 || response.status >= 500) {
        throw Object.assign(new Error(`HTTP_${response.status}`), { retryable: true });
      }

      if (response.status < 200 || response.status >= 300) {
        warnings.push(`Skipped ${currentUrl}: HTTP_${response.status}.`);
        return null;
      }

      const contentType = String(response.headers["content-type"] || "").toLowerCase();
      if (!/(text\/html|application\/xhtml\+xml|text\/plain)/.test(contentType)) {
        warnings.push(`Skipped ${currentUrl}: unsupported content type.`);
        return null;
      }

      return { url: currentUrl, html: response.data };
    } catch (error) {
      const retryable =
        error?.retryable ||
        error?.code === "ECONNABORTED" ||
        /ETIMEDOUT|ECONNRESET|EAI_AGAIN|HTTP_5\d\d|HTTP_429/i.test(String(error?.message));

      if (retryable && redirectCount < 3) {
        await sleep(500 * (2 ** Math.min(redirectCount, 2)));
        continue;
      }

      warnings.push(`Skipped ${currentUrl}: ${error?.code || error?.message || "REQUEST_FAILED"}.`);
      return null;
    }
  }

  return null;
}

export async function scrapeCompanyData(companyUrl, options = {}) {
  const settings = { ...DEFAULTS, ...options };
  const allowPrivate = Boolean(options.allowPrivate);
  const baseUrl = await validateExternalUrl(companyUrl, { allowPrivate });
  const origin = baseUrl.origin;
  const warnings = [];
  const pagesUsed = [];
  const queue = [{ url: baseUrl.href, score: 100, depth: 0 }];
  const visited = new Set();
  const rateState = { lastRequestAt: 0 };

  let robots = null;
  try {
    const robotsResponse = await axios.get(`${origin}/robots.txt`, {
      timeout: settings.timeoutMs,
      maxContentLength: 100000,
      responseType: "text",
      maxRedirects: 0,
      validateStatus: () => true,
      headers: { "User-Agent": "Trao-Assessment-Bot/1.0" }
    });
    if (robotsResponse.status >= 200 && robotsResponse.status < 300) {
      robots = parseRobots(robotsResponse.data);
    }
  } catch {
    // robots.txt itself is optional; individual page retrieval remains guarded.
  }

  let combinedText = "";
  let siteNameCandidate = baseUrl.hostname.replace(/^www\./, "");
  let usefulLinkCount = 0;

  while (queue.length && pagesUsed.length < settings.maxPages) {
    queue.sort((a, b) => b.score - a.score || a.depth - b.depth);
    const current = queue.shift();
    if (!current || visited.has(current.url)) continue;
    visited.add(current.url);

    const currentUrl = new URL(current.url);
    if (currentUrl.origin !== origin) continue;

    if (!robotsAllows(robots, current.url)) {
      warnings.push(`Skipped ${current.url}: disallowed by robots.txt.`);
      continue;
    }

    const fetched = await fetchPageHtml(current.url, {
      origin,
      allowPrivate,
      settings,
      rateState,
      warnings
    });
    if (!fetched) continue;

    const $ = cheerio.load(fetched.html);
    const title = $("title").first().text().replace(/\s+/g, " ").trim();
    if (title && pagesUsed.length === 0) {
      siteNameCandidate = title.split("|")[0].split(" - ")[0].trim() || siteNameCandidate;
    }

    $("script,style,noscript,iframe,svg,nav,footer").remove();
    const text = $("body").text().replace(/\s+/g, " ").trim();

    if (text) {
      pagesUsed.push(fetched.url);
      combinedText += `\n\nSOURCE: ${fetched.url}\n${text.slice(0, 30000)}`;
    }

    $("a").each((_index, element) => {
      const normalized = normalizeLink($(element).attr("href"), fetched.url);
      const anchorText = $(element).text().replace(/\s+/g, " ").trim();
      if (!normalized || visited.has(normalized)) return;

      const linkUrl = new URL(normalized);
      if (linkUrl.origin !== origin) return;

      const score = scoreLink(normalized, anchorText);
      if (score > 0) {
        usefulLinkCount += 1;
        queue.push({ url: normalized, score: score - current.depth, depth: current.depth + 1 });
      }
    });
  }

  if (usefulLinkCount === 0) {
    warnings.push("No obvious hiring/about/engineering/company-information links were discoverable.");
  }
  if (!pagesUsed.length) {
    warnings.push("No usable company pages were retrieved.");
  }

  return {
    text: combinedText.slice(0, 120000),
    pagesUsed,
    warnings,
    companyNameCandidate: siteNameCandidate
  };
}

export async function searchPublicDiscussion(companyNameCandidate, companyUrl) {
  let domain;
  try {
    domain = new URL(companyUrl).hostname.replace(/^www\./, "");
  } catch {
    return {
      text: "",
      sources: [],
      warnings: ["Could not derive company domain for public discussion search."]
    };
  }

  const query = encodeURIComponent(
    `"${companyNameCandidate || domain}" interview process hiring interview experiences`
  );

  try {
    const response = await axios.get(`https://html.duckduckgo.com/html/?q=${query}`, {
      timeout: 8000,
      responseType: "text",
      validateStatus: () => true,
      headers: { "User-Agent": "Trao-Assessment-Bot/1.0" }
    });

    if (response.status < 200 || response.status >= 300) {
      return {
        text: "",
        sources: [],
        warnings: [`Public discussion search returned HTTP_${response.status}.`]
      };
    }

    const $ = cheerio.load(response.data);
    const results = [];

    $(".result").each((_index, element) => {
      if (results.length >= 5) return;

      const title = $(element).find(".result__title").text().replace(/\s+/g, " ").trim();
      const snippet = $(element).find(".result__snippet").text().replace(/\s+/g, " ").trim();
      const href = $(element).find(".result__a").attr("href");

      if (!title || !snippet || !href) return;

      try {
        const resolved = new URL(href, "https://html.duckduckgo.com/");
        const target = resolved.searchParams.get("uddg");
        const url = target ? new URL(target).href : resolved.href;
        results.push({ title, snippet, url });
      } catch {
        // Ignore malformed search result links.
      }
    });

    return {
      text: results
        .map((item) => `TITLE: ${item.title}\nSNIPPET: ${item.snippet}\nURL: ${item.url}`)
        .join("\n\n"),
      sources: results.map((item) => item.url),
      warnings: results.length ? [] : ["No public interview discussion was found."]
    };
  } catch (error) {
    return {
      text: "",
      sources: [],
      warnings: [`Public discussion search unavailable: ${error.code || error.message}.`]
    };
  }
}

export async function researchCompany(companyUrl, options = {}) {
  const companyData = await scrapeCompanyData(companyUrl, options);
  const discussionData = await searchPublicDiscussion(
    companyData.companyNameCandidate,
    companyUrl
  );

  return {
    companyData,
    discussionData,
    combinedResearchText: `${companyData.text}\n\nPUBLIC DISCUSSION:\n${discussionData.text}`.slice(0, 140000)
  };
}
