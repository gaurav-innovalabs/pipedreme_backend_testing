export class Connection {
    constructor({ 
        id, 
        app_key, 
        external_user_id, 
        app_slug, 
        credentials, 
        auth_type = 'custom',
        created_at = new Date().toISOString(),
        updated_at = new Date().toISOString()
    }) {
        this.id = id;
        this.app_key = app_key;
        this.external_user_id = external_user_id;
        this.app_slug = app_slug;
        this.credentials = credentials;
        this.auth_type = auth_type;
        this.created_at = created_at;
        this.updated_at = updated_at;
    }

    toJSON() {
        return {
            id: this.id,
            app_key: this.app_key,
            external_user_id: this.external_user_id,
            app_slug: this.app_slug,
            credentials: this.credentials,
            auth_type: this.auth_type,
            created_at: this.created_at,
            updated_at: this.updated_at
        };
    }

    // Mask sensitive credentials for API responses
    toMasked() {
        const masked = { ...this.credentials };
        
        // Mask common sensitive fields
        const sensitiveFields = [
            'api_key', 'oauth_access_token', 'oauth_refresh_token', 
            'client_secret', 'password', 'private_key', 'secret'
        ];
        
        sensitiveFields.forEach(field => {
            if (masked[field]) {
                const value = masked[field];
                if (typeof value === 'string' && value.length > 8) {
                    masked[field] = value.substring(0, 4) + '*'.repeat(value.length - 8) + value.substring(value.length - 4);
                } else {
                    masked[field] = '***';
                }
            }
        });

        return {
            ...this.toJSON(),
            credentials: masked
        };
    }
}

export class OAuthState {
    constructor({
        state,
        app_slug,
        external_user_id,
        redirect_uri,
        created_at = new Date().toISOString(),
        expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutes
    }) {
        this.state = state;
        this.app_slug = app_slug;
        this.external_user_id = external_user_id;
        this.redirect_uri = redirect_uri;
        this.created_at = created_at;
        this.expires_at = expires_at;
    }

    toJSON() {
        return {
            state: this.state,
            app_slug: this.app_slug,
            external_user_id: this.external_user_id,
            redirect_uri: this.redirect_uri,
            created_at: this.created_at,
            expires_at: this.expires_at
        };
    }

    isExpired() {
        return new Date() > new Date(this.expires_at);
    }
}