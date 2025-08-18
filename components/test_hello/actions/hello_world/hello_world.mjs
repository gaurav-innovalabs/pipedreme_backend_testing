export default {
  name: "Hello World",
  version: "0.0.1",
  key: "hello_world",
  description: "Simple Hello World test",
  type: "action",
  props: {
    name: {
      type: "string",
      label: "Your Name",
      optional: true,
      default: "World",
    },
  },
  async run({ steps, $ }) {
    const message = `Hello, ${this.name}!`;
    return {
      message,
    };
  },
};
// pd dev serpapi_custom/actions/hello_world/hello_world.mjs