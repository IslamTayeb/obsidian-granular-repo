import { StaticSiteHostConfig } from "../types";

export const APM_OVERFLOW_HOST_ID = "apm-overflow";

export const APM_OVERFLOW_REPO_ROOT =
  "/Users/islamtayeb/Documents/GitHub/personal-website";

export function createApmOverflowPreset(
  repoRoot: string = APM_OVERFLOW_REPO_ROOT,
): StaticSiteHostConfig {
  return {
    id: APM_OVERFLOW_HOST_ID,
    name: "APM Overflow",
    repoRoot,
    siteSubdir: "apmoverflow",
    postPathTemplate: "{slug}/index.html",
    templateRelPath: "_template.html",
    contentMarker: "<p>Article content...</p>",
    tokens: {
      title: "POST_TITLE",
      slug: "POST_SLUG",
      description: "POST_DESCRIPTION",
      dateIso: "YYYY-MM-DDTHH:MMZ",
      dateDisplay: "Mon DD, YYYY",
    },
    commitMessagePublish: "apmoverflow: publish {slug}",
    commitMessageUnpublish: "apmoverflow: unpublish {slug}",
    remote: "origin",
    publicBaseUrl: "https://apmoverflow.xyz",
  };
}
