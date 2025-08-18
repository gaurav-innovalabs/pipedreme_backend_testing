import app from "../../test_hello.app.mjs";

export default {
  key: "custom_serpapi-scrape-search",
  name: "Scrape Search",
  description: "Scrape the results from a search engine via SerpApi service. [See the documentation](https://serpapi.com/search-api)",
  version: "0.0.3",
  type: "action",
  props: {
    q: {
      type: "string",
      label: "query to search",
      optional: true,
      default: "weather of indore",
    },
  },
  async run({ $ }) {
    const response = await this.app.scrapeSearch({
      $,
      params: {
        engine: this.engine,
      },
      data: {
        q: this.q,
        device: this.device,
        no_cache: Boolean(this.noCache) === true
          ? "true"
          : "false",
      },
    });

    $.export("$summary", `Successfully sent query to '${this.engine}'`);

    return response;
  },
};
