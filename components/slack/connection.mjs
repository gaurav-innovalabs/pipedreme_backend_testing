import config from '../../config.mjs';

export default {
    type: "oauth",
    custom_fields: [],
    oauth_details: {
        client_id: config.OAUTH.SLACK_CLIENT_ID,
        client_secret: config.OAUTH.SLACK_CLIENT_SECRET,
        authorization_url: "https://slack.com/oauth/v2/authorize",
        token_url: "https://slack.com/api/oauth.v2.access",
        scope: [
            "channels:read",
            "channels:write", 
            "channels:history",
            "chat:write",
            "chat:write.public",
            "groups:read",
            "groups:write",
            "im:read",
            "im:write",
            "mpim:read",
            "mpim:write",
            "users:read",
            "files:read",
            "files:write",
            "reactions:read",
            "reactions:write",
            "reminders:read",
            "reminders:write",
            "usergroups:read",
            "usergroups:write"
        ].join(","),
        redirect_uri: `${config.BE_URL}/v1/connect/${config.PROJECT_ID}/auth/oauth/slack/callback`
    },
    
    methods: {
        connection_link(external_user_id, redirect_uri) {
            const oauth = this.oauth_details;
            const state = `${external_user_id}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
            
            const params = new URLSearchParams({
                client_id: oauth.client_id,
                scope: oauth.scope,
                redirect_uri: oauth.redirect_uri,
                state: state,
                response_type: 'code'
            });
            
            return {
                authorization_url: `${oauth.authorization_url}?${params.toString()}`,
                state: state
            };
        },
        
        async connect_oauth_callback(code, state) {
            const oauth = this.oauth_details;
            
            try {
                // Exchange code for tokens
                const tokenResponse = await fetch(oauth.token_url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: new URLSearchParams({
                        client_id: oauth.client_id,
                        client_secret: oauth.client_secret,
                        code: code,
                        redirect_uri: oauth.redirect_uri
                    })
                });
                
                const tokenData = await tokenResponse.json();
                
                if (!tokenData.ok) {
                    throw new Error(`OAuth error: ${tokenData.error}`);
                }
                
                // Get user info
                const userResponse = await fetch('https://slack.com/api/auth.test', {
                    headers: {
                        'Authorization': `Bearer ${tokenData.access_token}`
                    }
                });
                
                const userData = await userResponse.json();
                
                if (!userData.ok) {
                    throw new Error(`Failed to get user info: ${userData.error}`);
                }
                
                return {
                    oauth_access_token: tokenData.access_token,
                    oauth_refresh_token: tokenData.refresh_token,
                    oauth_uid: userData.user_id,
                    oauth_user: userData.user,
                    team_id: userData.team_id,
                    team: userData.team,
                    bot_user_id: tokenData.bot_user_id,
                    scope: tokenData.scope,
                    expires_at: tokenData.expires_in ? 
                        new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null
                };
            } catch (error) {
                throw new Error(`OAuth callback failed: ${error.message}`);
            }
        },
        
        async refresh_token(refresh_token) {
            // Slack tokens typically don't expire, but implement for completeness
            if (!refresh_token) {
                throw new Error("No refresh token available");
            }
            
            try {
                const refreshResponse = await fetch('https://slack.com/api/oauth.v2.access', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: new URLSearchParams({
                        client_id: this.oauth_details.client_id,
                        client_secret: this.oauth_details.client_secret,
                        grant_type: 'refresh_token',
                        refresh_token: refresh_token
                    })
                });
                
                const refreshData = await refreshResponse.json();
                
                if (!refreshData.ok) {
                    throw new Error(`Token refresh failed: ${refreshData.error}`);
                }
                
                return {
                    oauth_access_token: refreshData.access_token,
                    oauth_refresh_token: refreshData.refresh_token || refresh_token,
                    expires_at: refreshData.expires_in ? 
                        new Date(Date.now() + refreshData.expires_in * 1000).toISOString() : null
                };
            } catch (error) {
                throw new Error(`Token refresh failed: ${error.message}`);
            }
        },
        
        async disconnect() {
            // Slack doesn't provide a revoke endpoint, so just return success
            return { success: true };
        }
    }
};