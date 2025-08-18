export default {
    type: "custom",
    custom_fields: [
        {
            name: "api_key",
            label: "API Key", 
            type: "string",
            secret: true,
            description: "Your SerpAPI key from https://serpapi.com/manage-api-key",
            required: true
        }
    ],
    oauth_details: null,
    
    methods: {
        async connect(credentials) {
            // Validate API key by making a test request
            const { api_key } = credentials;
            
            if (!api_key) {
                throw new Error("API key is required");
            }
            
            try {
                // Test the API key with a simple search
                const testResponse = await fetch(`https://serpapi.com/search?engine=google&q=test&api_key=${api_key}`);
                const data = await testResponse.json();
                
                if (data.error) {
                    throw new Error(`Invalid API key: ${data.error}`);
                }
                
                return {
                    success: true,
                    api_key: api_key
                };
            } catch (error) {
                throw new Error(`Failed to validate API key: ${error.message}`);
            }
        },
        
        async disconnect() {
            // No special cleanup needed for API key auth
            return { success: true };
        },
        
        async refresh() {
            // API keys don't need refresh
            return { success: true };
        }
    }
};