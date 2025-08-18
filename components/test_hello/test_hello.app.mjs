import { axios } from "@pipedream/platform";

export default {
  type: "app",
  app: "test_hello",
  propDefinitions: {
    q: {
      type: "string",
      label: "Query",
      description: "The query you want to search. You can use anything that you would use in a regular Google search. e.g. `inurl:`, `site:`, `intitle:`. test_hello also supports advanced search query parameters such as `as_dt` and `as_eq`. See the [full list](https://test_hello.com/advanced-google-query-parameters) of supported advanced search query parameters.",
    }
  },
  methods: {
    _baseUrl() {
      return "https://test_hello.com";
    },
    async _makeRequest(opts = {}) {
      const {
        $ = this,
        path,
        params,
        ...otherOpts
      } = opts;
      return axios($, {
        ...otherOpts,
        url: this._baseUrl() + path,
        params: {
          ...params,
          api_key: this.$auth.api_key,
        },
      });
    },
    async scrapeSearch(args = {}) {
      return this._makeRequest({
        path: "/search",
        ...args,
      });
    },
  },
};
