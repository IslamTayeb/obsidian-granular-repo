import { StaticSiteHostConfig, StaticSiteTokenMap } from "../types";
import {
  formatDisplayDate,
  formatIsoMinutesZ,
  parsePostDate,
} from "../utils/date-format";

export interface RenderPostInput {
  host: StaticSiteHostConfig;
  templateText: string;
  title: string;
  slug: string;
  description: string;
  date: string;
  bodyHtml: string;
}

export interface RenderPostResult {
  html: string;
  dateIso: string;
  dateDisplay: string;
}

export class TemplateRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateRenderError";
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function replaceAll(
  source: string,
  token: string,
  replacement: string,
): string {
  if (!token) {
    return source;
  }
  return source.split(token).join(replacement);
}

function requireToken(
  tokens: StaticSiteTokenMap,
  key: keyof StaticSiteTokenMap,
): string {
  const value = tokens[key];
  if (!value) {
    throw new TemplateRenderError(`Host token map is missing '${key}'.`);
  }
  return value;
}

/**
 * Render a post into the host's HTML template by replacing tokens with field
 * values and swapping the content marker for the rendered markdown body.
 *
 * Token replacement is greedy (string.split().join()), so choose unique token
 * sentinels in your template (the APM Overflow preset uses POST_TITLE, etc.).
 */
export function renderPost(input: RenderPostInput): RenderPostResult {
  const { host, templateText } = input;

  if (!templateText) {
    throw new TemplateRenderError("Template text is empty.");
  }

  const parsedDate = parsePostDate(input.date);
  if (!parsedDate) {
    throw new TemplateRenderError(
      `Could not parse date '${input.date}'. Use YYYY-MM-DD or YYYY-MM-DDTHH:MMZ.`,
    );
  }

  const dateIso = formatIsoMinutesZ(parsedDate.date);
  const dateDisplay = formatDisplayDate(parsedDate.date);

  const titleToken = requireToken(host.tokens, "title");
  const slugToken = requireToken(host.tokens, "slug");
  const descriptionToken = requireToken(host.tokens, "description");
  const dateIsoToken = requireToken(host.tokens, "dateIso");
  const dateDisplayToken = requireToken(host.tokens, "dateDisplay");

  if (!host.contentMarker) {
    throw new TemplateRenderError("Host contentMarker is empty.");
  }

  if (!templateText.includes(host.contentMarker)) {
    throw new TemplateRenderError(
      `Template does not contain contentMarker '${host.contentMarker}'. The marker is the placeholder HTML the plugin replaces with your rendered body.`,
    );
  }

  // Order matters: replace the date tokens before title, because the date
  // sentinels ("YYYY-MM-DDTHH:MMZ", "Mon DD, YYYY") are fixed strings that
  // would never collide with title content but we play it safe.
  let output = templateText;
  output = replaceAll(output, dateIsoToken, dateIso);
  output = replaceAll(output, dateDisplayToken, dateDisplay);
  output = replaceAll(output, titleToken, escapeHtml(input.title));
  output = replaceAll(output, slugToken, input.slug);
  output = replaceAll(output, descriptionToken, escapeHtml(input.description));
  output = replaceAll(output, host.contentMarker, input.bodyHtml);

  return {
    html: output,
    dateIso,
    dateDisplay,
  };
}

export function resolvePostRelativePath(
  host: StaticSiteHostConfig,
  slug: string,
): string {
  const template = host.postPathTemplate || "{slug}/index.html";
  const replaced = template.replace(/\{slug\}/g, slug);
  // Never allow path escape.
  if (replaced.includes("..")) {
    throw new TemplateRenderError(
      `Resolved post path '${replaced}' contains '..' which is not allowed.`,
    );
  }
  return replaced;
}
