/**
 * Where a brand's social links go, told by their address. Icons come from
 * svgl.app (https://svgl.app), kept here so nothing is fetched to show them;
 * ones drawn in black or white have one for each theme.
 */
import behance from "./socials/behance.svg";
import bluesky from "./socials/bluesky.svg";
import discord from "./socials/discord.svg";
import dribbble from "./socials/dribbble.svg";
import facebook from "./socials/facebook.svg";
import githubDark from "./socials/github-dark.svg";
import github from "./socials/github.svg";
import googleMaps from "./socials/google-maps.svg";
import instagram from "./socials/instagram.svg";
import linkedin from "./socials/linkedin.svg";
import mastodon from "./socials/mastodon.svg";
import patreonDark from "./socials/patreon-dark.svg";
import patreon from "./socials/patreon.svg";
import pinterest from "./socials/pinterest.svg";
import reddit from "./socials/reddit.svg";
import snapchat from "./socials/snapchat.svg";
import soundcloudDark from "./socials/soundcloud-dark.svg";
import soundcloud from "./socials/soundcloud.svg";
import spotify from "./socials/spotify.svg";
import telegram from "./socials/telegram.svg";
import threadsDark from "./socials/threads-dark.svg";
import threads from "./socials/threads.svg";
import tiktokDark from "./socials/tiktok-dark.svg";
import tiktok from "./socials/tiktok.svg";
import twitch from "./socials/twitch.svg";
import whatsapp from "./socials/whatsapp.svg";
import xDark from "./socials/x-dark.svg";
import x from "./socials/x.svg";
import youtube from "./socials/youtube.svg";

export interface Platform {
  id: string;
  name: string;
  /** Hosts its links are on, without `www.`; subdomains count too. */
  hosts: string[];
  /** Drawn for light backgrounds, and for dark ones when it differs. */
  icon?: { light: string; dark?: string };
  /** Without an icon, its initial is drawn on this. */
  color?: string;
  /** Whether the first part of the path is the account, read as `@name`. */
  handle?: boolean;
}

export const PLATFORMS: Platform[] = [
  {
    handle: true,
    hosts: ["x.com", "twitter.com"],
    icon: { dark: xDark, light: x },
    id: "x",
    name: "X",
  },
  {
    handle: true,
    hosts: ["instagram.com"],
    icon: { light: instagram },
    id: "instagram",
    name: "Instagram",
  },
  {
    hosts: ["facebook.com", "fb.com"],
    icon: { light: facebook },
    id: "facebook",
    name: "Facebook",
  },
  {
    hosts: ["linkedin.com"],
    icon: { light: linkedin },
    id: "linkedin",
    name: "LinkedIn",
  },
  {
    hosts: ["youtube.com", "youtu.be"],
    icon: { light: youtube },
    id: "youtube",
    name: "YouTube",
  },
  {
    hosts: ["tiktok.com"],
    icon: { dark: tiktokDark, light: tiktok },
    id: "tiktok",
    name: "TikTok",
  },
  {
    handle: true,
    hosts: ["threads.net", "threads.com"],
    icon: { dark: threadsDark, light: threads },
    id: "threads",
    name: "Threads",
  },
  {
    hosts: ["bsky.app", "bsky.social"],
    icon: { light: bluesky },
    id: "bluesky",
    name: "Bluesky",
  },
  {
    hosts: ["mastodon.social", "mastodon.online", "mstdn.social"],
    icon: { light: mastodon },
    id: "mastodon",
    name: "Mastodon",
  },
  {
    color: "#8e30eb",
    hosts: [
      "njump.me",
      "primal.net",
      "iris.to",
      "snort.social",
      "coracle.social",
      "nostr.com",
    ],
    id: "nostr",
    name: "Nostr",
  },
  {
    handle: true,
    hosts: ["t.me", "telegram.me", "telegram.org"],
    icon: { light: telegram },
    id: "telegram",
    name: "Telegram",
  },
  {
    hosts: ["wa.me", "whatsapp.com"],
    icon: { light: whatsapp },
    id: "whatsapp",
    name: "WhatsApp",
  },
  {
    hosts: ["discord.gg", "discord.com"],
    icon: { light: discord },
    id: "discord",
    name: "Discord",
  },
  {
    handle: true,
    hosts: ["github.com"],
    icon: { dark: githubDark, light: github },
    id: "github",
    name: "GitHub",
  },
  {
    hosts: ["reddit.com"],
    icon: { light: reddit },
    id: "reddit",
    name: "Reddit",
  },
  {
    hosts: ["pinterest.com", "pin.it"],
    icon: { light: pinterest },
    id: "pinterest",
    name: "Pinterest",
  },
  {
    handle: true,
    hosts: ["twitch.tv"],
    icon: { light: twitch },
    id: "twitch",
    name: "Twitch",
  },
  {
    hosts: ["spotify.com"],
    icon: { light: spotify },
    id: "spotify",
    name: "Spotify",
  },
  {
    handle: true,
    hosts: ["soundcloud.com"],
    icon: { dark: soundcloudDark, light: soundcloud },
    id: "soundcloud",
    name: "SoundCloud",
  },
  {
    handle: true,
    hosts: ["snapchat.com"],
    icon: { light: snapchat },
    id: "snapchat",
    name: "Snapchat",
  },
  {
    handle: true,
    hosts: ["behance.net"],
    icon: { light: behance },
    id: "behance",
    name: "Behance",
  },
  {
    handle: true,
    hosts: ["dribbble.com"],
    icon: { light: dribbble },
    id: "dribbble",
    name: "Dribbble",
  },
  {
    handle: true,
    hosts: ["patreon.com"],
    icon: { dark: patreonDark, light: patreon },
    id: "patreon",
    name: "Patreon",
  },
  {
    color: "#ff6719",
    hosts: ["substack.com"],
    id: "substack",
    name: "Substack",
  },
  {
    color: "#000000",
    handle: true,
    hosts: ["medium.com"],
    id: "medium",
    name: "Medium",
  },
  {
    hosts: ["maps.app.goo.gl", "maps.google.com", "goo.gl/maps"],
    icon: { light: googleMaps },
    id: "google-maps",
    name: "Google Maps",
  },
];

const NOSTR_KEY = /^(?:nostr:)?(?<key>n(?:pub|profile)1[\da-z]+)$/u;
const SCHEME = /^[a-z][\d+.a-z-]*:/iu;
const WWW = /^www\./u;

function parse(link: string): URL | undefined {
  try {
    return new URL(SCHEME.test(link) ? link : `https://${link}`);
  } catch {
    return undefined;
  }
}

/** A link as typed, made into one the server keeps: a Nostr key opens on njump.me. */
export function normalizeLink(input: string): string {
  const trimmed = input.trim();
  const key = NOSTR_KEY.exec(trimmed.toLowerCase())?.groups?.key;
  return key ? `https://njump.me/${key}` : trimmed;
}

/** The platform a link is on, if it's one known here. */
export function platformOf(link: string): Platform | undefined {
  const url = parse(link);
  if (!url) {
    return undefined;
  }
  const host = url.hostname.toLowerCase().replace(WWW, "");
  const where = `${host}${url.pathname}`;
  return PLATFORMS.find((platform) =>
    platform.hosts.some(
      (known) =>
        where.startsWith(known) || host === known || host.endsWith(`.${known}`)
    )
  );
}

/** How a link reads: `@name` on platforms with handles, else its address without the noise. */
export function linkLabel(link: string): string {
  const url = parse(link);
  if (!url) {
    return link;
  }
  const host = url.hostname.replace(WWW, "");
  const path = url.pathname.replace(/\/+$/u, "");
  const platform = platformOf(link);
  const first = path.split("/").find(Boolean);
  if (platform?.handle && first) {
    return `@${decodeURIComponent(first).replace(/^@/u, "")}`;
  }
  // Nostr apps put the key last, like primal.net/p/npub1….
  const key = path.split("/").findLast(Boolean);
  if (platform?.id === "nostr" && key) {
    return key.length > 20 ? `${key.slice(0, 12)}…${key.slice(-6)}` : key;
  }
  return `${host}${path}`;
}
