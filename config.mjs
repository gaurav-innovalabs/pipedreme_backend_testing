export default {
    BE_URL: "http://localhost:3000",
    PORT: process.env.PORT || 3000,
    OAUTH: {
        SLACK_CLIENT_ID: process.env.SLACK_CLIENT_ID,
        SLACK_CLIENT_SECRET: process.env.SLACK_CLIENT_SECRET,
        
    },
    DEFAULT_KEYS: {
        SERPAPI_DEFAULT_API_KEY: process.env.SERPAPI_DEFAULT_API_KEY,
    },
    PROJECT_ID: "proj_zNsg4Me",
}