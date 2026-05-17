/**
 * Offline-only catalog of categories + services.
 * No remote icons: each service has an emoji + brand color used for a local badge.
 * Hostnames are used to auto-detect a service from a URL (Chrome CSV import).
 */

export interface Subcategory {
  id: string;
  name: string;
  emoji: string;
  /** Hex color (no #) for the local badge background. */
  color: string;
  /** Hostnames that map to this service (used by Chrome CSV import). */
  hosts?: string[];
  defaultUrl?: string;
}

export interface Category {
  id: string;
  name: string;
  emoji: string;
  subcategories: Subcategory[];
}

export const CATEGORIES: Category[] = [
  {
    id: "social",
    name: "Social Media",
    emoji: "📱",
    subcategories: [
      { id: "facebook", name: "Facebook", emoji: "📘", color: "1877F2", hosts: ["facebook.com", "fb.com", "m.facebook.com"], defaultUrl: "https://facebook.com" },
      { id: "instagram", name: "Instagram", emoji: "📷", color: "E4405F", hosts: ["instagram.com"], defaultUrl: "https://instagram.com" },
      { id: "x", name: "X (Twitter)", emoji: "🐦", color: "111111", hosts: ["x.com", "twitter.com"], defaultUrl: "https://x.com" },
      { id: "tiktok", name: "TikTok", emoji: "🎵", color: "010101", hosts: ["tiktok.com"], defaultUrl: "https://tiktok.com" },
      { id: "snapchat", name: "Snapchat", emoji: "👻", color: "FFFC00", hosts: ["snapchat.com"], defaultUrl: "https://snapchat.com" },
      { id: "linkedin", name: "LinkedIn", emoji: "💼", color: "0A66C2", hosts: ["linkedin.com"], defaultUrl: "https://linkedin.com" },
      { id: "pinterest", name: "Pinterest", emoji: "📌", color: "BD081C", hosts: ["pinterest.com"], defaultUrl: "https://pinterest.com" },
      { id: "reddit", name: "Reddit", emoji: "👽", color: "FF4500", hosts: ["reddit.com"], defaultUrl: "https://reddit.com" },
      { id: "discord", name: "Discord", emoji: "💬", color: "5865F2", hosts: ["discord.com", "discord.gg"], defaultUrl: "https://discord.com" },
      { id: "telegram", name: "Telegram", emoji: "✈️", color: "26A5E4", hosts: ["telegram.org", "t.me"], defaultUrl: "https://telegram.org" },
      { id: "whatsapp", name: "WhatsApp", emoji: "💚", color: "25D366", hosts: ["whatsapp.com", "web.whatsapp.com"], defaultUrl: "https://whatsapp.com" },
      { id: "threads", name: "Threads", emoji: "🧵", color: "111111", hosts: ["threads.net"], defaultUrl: "https://threads.net" },
    ],
  },
  {
    id: "email",
    name: "Email",
    emoji: "✉️",
    subcategories: [
      { id: "gmail", name: "Gmail", emoji: "📧", color: "EA4335", hosts: ["mail.google.com", "gmail.com"], defaultUrl: "https://mail.google.com" },
      { id: "outlook", name: "Outlook", emoji: "📨", color: "0078D4", hosts: ["outlook.com", "outlook.live.com", "hotmail.com"], defaultUrl: "https://outlook.com" },
      { id: "yahoo", name: "Yahoo Mail", emoji: "📬", color: "6001D2", hosts: ["mail.yahoo.com", "yahoo.com"], defaultUrl: "https://mail.yahoo.com" },
      { id: "protonmail", name: "Proton Mail", emoji: "🔒", color: "6D4AFF", hosts: ["proton.me", "protonmail.com"], defaultUrl: "https://proton.me/mail" },
      { id: "icloud", name: "iCloud Mail", emoji: "☁️", color: "3693F3", hosts: ["icloud.com"], defaultUrl: "https://www.icloud.com/mail" },
    ],
  },
  {
    id: "finance",
    name: "Banking & Finance",
    emoji: "🏦",
    subcategories: [
      { id: "paypal", name: "PayPal", emoji: "💳", color: "00457C", hosts: ["paypal.com"], defaultUrl: "https://paypal.com" },
      { id: "gcash", name: "GCash", emoji: "💸", color: "0070D8", hosts: ["gcash.com"] },
      { id: "maya", name: "Maya", emoji: "🟢", color: "00C853", hosts: ["maya.ph", "paymaya.com"] },
      { id: "bpi", name: "BPI", emoji: "🏛️", color: "B11116", hosts: ["bpi.com.ph"] },
      { id: "bdo", name: "BDO", emoji: "🏛️", color: "002F87", hosts: ["bdo.com.ph"] },
      { id: "revolut", name: "Revolut", emoji: "🏧", color: "0666EB", hosts: ["revolut.com"] },
      { id: "wise", name: "Wise", emoji: "🌍", color: "9FE870", hosts: ["wise.com", "transferwise.com"] },
      { id: "bank", name: "Bank (other)", emoji: "🏦", color: "475569" },
      { id: "crypto", name: "Crypto wallet", emoji: "₿", color: "F7931A" },
    ],
  },
  {
    id: "shopping",
    name: "Shopping",
    emoji: "🛒",
    subcategories: [
      { id: "amazon", name: "Amazon", emoji: "📦", color: "FF9900", hosts: ["amazon.com", "amazon.co.uk", "amazon.de"], defaultUrl: "https://amazon.com" },
      { id: "ebay", name: "eBay", emoji: "🏷️", color: "E53238", hosts: ["ebay.com"], defaultUrl: "https://ebay.com" },
      { id: "shopee", name: "Shopee", emoji: "🛍️", color: "EE4D2D", hosts: ["shopee.com", "shopee.ph", "shopee.sg"], defaultUrl: "https://shopee.com" },
      { id: "lazada", name: "Lazada", emoji: "🛒", color: "1A9CB7", hosts: ["lazada.com", "lazada.com.ph"], defaultUrl: "https://lazada.com" },
      { id: "alibaba", name: "Alibaba", emoji: "🧧", color: "FF6A00", hosts: ["alibaba.com"], defaultUrl: "https://alibaba.com" },
    ],
  },
  {
    id: "gaming",
    name: "Gaming",
    emoji: "🎮",
    subcategories: [
      { id: "steam", name: "Steam", emoji: "🎮", color: "1B2838", hosts: ["steampowered.com", "steamcommunity.com"], defaultUrl: "https://store.steampowered.com" },
      { id: "epic", name: "Epic Games", emoji: "🎯", color: "313131", hosts: ["epicgames.com"], defaultUrl: "https://epicgames.com" },
      { id: "playstation", name: "PlayStation", emoji: "🕹️", color: "003791", hosts: ["playstation.com", "sonyentertainmentnetwork.com"], defaultUrl: "https://playstation.com" },
      { id: "xbox", name: "Xbox", emoji: "🟢", color: "107C10", hosts: ["xbox.com"], defaultUrl: "https://xbox.com" },
      { id: "nintendo", name: "Nintendo", emoji: "🔴", color: "E60012", hosts: ["nintendo.com"], defaultUrl: "https://nintendo.com" },
      { id: "riot", name: "Riot Games", emoji: "⚔️", color: "EB0029", hosts: ["riotgames.com", "leagueoflegends.com"], defaultUrl: "https://riotgames.com" },
      { id: "roblox", name: "Roblox", emoji: "🧱", color: "E2231A", hosts: ["roblox.com"], defaultUrl: "https://roblox.com" },
      { id: "mlbb", name: "Mobile Legends", emoji: "⚔️", color: "1A1A2E", hosts: ["mobilelegends.com"] },
    ],
  },
  {
    id: "streaming",
    name: "Streaming",
    emoji: "🎬",
    subcategories: [
      { id: "netflix", name: "Netflix", emoji: "🎬", color: "E50914", hosts: ["netflix.com"], defaultUrl: "https://netflix.com" },
      { id: "spotify", name: "Spotify", emoji: "🎧", color: "1DB954", hosts: ["spotify.com"], defaultUrl: "https://spotify.com" },
      { id: "youtube", name: "YouTube", emoji: "▶️", color: "FF0000", hosts: ["youtube.com", "youtu.be"], defaultUrl: "https://youtube.com" },
      { id: "twitch", name: "Twitch", emoji: "📺", color: "9146FF", hosts: ["twitch.tv"], defaultUrl: "https://twitch.tv" },
      { id: "disney", name: "Disney+", emoji: "✨", color: "113CCF", hosts: ["disneyplus.com"], defaultUrl: "https://disneyplus.com" },
      { id: "prime", name: "Prime Video", emoji: "📽️", color: "00A8E1", hosts: ["primevideo.com"], defaultUrl: "https://primevideo.com" },
    ],
  },
  {
    id: "work",
    name: "Work & School",
    emoji: "💼",
    subcategories: [
      { id: "google", name: "Google", emoji: "🔍", color: "4285F4", hosts: ["accounts.google.com", "google.com"], defaultUrl: "https://google.com" },
      { id: "microsoft", name: "Microsoft", emoji: "🪟", color: "0078D4", hosts: ["microsoft.com", "live.com", "office.com"], defaultUrl: "https://microsoft.com" },
      { id: "slack", name: "Slack", emoji: "💬", color: "4A154B", hosts: ["slack.com"], defaultUrl: "https://slack.com" },
      { id: "zoom", name: "Zoom", emoji: "📹", color: "2D8CFF", hosts: ["zoom.us"], defaultUrl: "https://zoom.us" },
      { id: "notion", name: "Notion", emoji: "📝", color: "111111", hosts: ["notion.so"], defaultUrl: "https://notion.so" },
      { id: "github", name: "GitHub", emoji: "🐙", color: "24292F", hosts: ["github.com"], defaultUrl: "https://github.com" },
      { id: "dropbox", name: "Dropbox", emoji: "📁", color: "0061FF", hosts: ["dropbox.com"], defaultUrl: "https://dropbox.com" },
    ],
  },
  {
    id: "other",
    name: "Other",
    emoji: "📁",
    subcategories: [
      { id: "custom", name: "Custom", emoji: "🔑", color: "475569" },
      { id: "wifi", name: "Wi-Fi", emoji: "📶", color: "0EA5E9" },
      { id: "device", name: "Device / PIN", emoji: "📱", color: "64748B" },
      { id: "vpn", name: "VPN", emoji: "🛡️", color: "4687FF" },
      { id: "router", name: "Router admin", emoji: "📡", color: "78716C" },
    ],
  },
];

const categoryMap = new Map(CATEGORIES.map((c) => [c.id, c]));

export function getCategory(id: string): Category | undefined {
  return categoryMap.get(id);
}

export function getSubcategory(
  categoryId: string,
  subcategoryId: string,
): Subcategory | undefined {
  return getCategory(categoryId)?.subcategories.find((s) => s.id === subcategoryId);
}

export const DEFAULT_CATEGORY_ID = "other";
export const DEFAULT_SUBCATEGORY_ID = "custom";

/** Try to find the best category/subcategory match for a URL. */
export function matchServiceByUrl(
  url: string,
): { categoryId: string; subcategoryId: string } {
  if (!url) {
    return { categoryId: DEFAULT_CATEGORY_ID, subcategoryId: DEFAULT_SUBCATEGORY_ID };
  }
  let host = "";
  try {
    const normalized = url.includes("://") ? url : `https://${url}`;
    host = new URL(normalized).hostname.toLowerCase();
  } catch {
    host = url.toLowerCase();
  }
  if (host.startsWith("www.")) host = host.slice(4);

  for (const cat of CATEGORIES) {
    for (const sub of cat.subcategories) {
      if (!sub.hosts) continue;
      for (const h of sub.hosts) {
        if (host === h || host.endsWith(`.${h}`)) {
          return { categoryId: cat.id, subcategoryId: sub.id };
        }
      }
    }
  }
  return { categoryId: DEFAULT_CATEGORY_ID, subcategoryId: DEFAULT_SUBCATEGORY_ID };
}
