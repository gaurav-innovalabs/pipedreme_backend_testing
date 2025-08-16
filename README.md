# Pipedream Local Server

A local Pipedream-compatible server for developing and testing Pipedream components without external dependencies.

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Set up Environment (Optional)
Create a `.env` file in the root directory:
```bash
# .env
PORT=3000
ENVIRONMENT=development
PROJECT_ID=local-project
CLIENT_ID=local-client
CLIENT_SECRET=local-secret
ACTIONS_LIMIT=100
TRIGGERS_LIMIT=100
LOCAL_PIPEDREAM_URL=http://localhost:3000
```

### 3. Configure SerpAPI
Edit `.components.env`:
```bash
SERPAPI_API_KEY=your_actual_serpapi_key_here # if $auth is not present as not passed by props so use this if it is set 
```

### 4. Start the Server
```bash
npm start
# or
node server.mjs
```

The server will start on `http://localhost:3000`

## Testing the API

### Using HTTP Files (Recommended)
Open `test-api.http` in VS Code with the REST Client extension or any HTTP client that supports .http files.

### Using curl


## API Endpoints
look on ./pipedreme.http file

## Component Structure

[.. complete it .. Claude AI look corrent striuture and do it]

## Development

### Adding New Components
1. Create folder in `components/`
3. Create `{app_slug}.app.mjs` file
3. Create `package.json` file
4. Add actions in `actions/` subfolder
5. Add triggers in `triggers/` subfolder

## Database

The server uses SQLite with the following tables:
- `apps` - App authentication storage
- `accounts` - User account management
- `tokens` - Connection tokens
- `runs` - Execution history

Database file: `db_data/pd_local.sqlite`

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3000 | Server port |
| ENVIRONMENT | development | Environment name |
| PROJECT_ID | local-project | Project identifier |
| LOCAL_PIPEDREAM_URL | http://localhost:3000 | Base URL for API |

## Troubleshooting

### Server won't start
- Check if port 3000 is available
- Verify Node.js version (requires Node 18+)
- Run `npm install` to ensure dependencies are installed

### Component not found
- Ensure component folder exists in `components/`
- Verify the `.app.mjs` file exists
- Check file permissions

### Authentication errors
- Set up authentication using `/apps/:app/auth` endpoint
- Verify API keys in component's `.env` file
- Check auth format matches component expectations

# DB 
required Auth Table to maintain connection and apn_key and external_user_id , app_slug , credintials: json which latter on access by $this.auth.oauth_access_token

for apps and components no need to store in DB, may use cache as per mention in look on core/cache.mjs code
which latter on will be used on ComponentSystem as we required to store components name while loading and scanning the components folder

# tech stack
vm2
redis
sqlite3

Note: instead of .js we are using .mjs

// Focus on app's and actions , source dynamic fetching, its props , dynamic pros and other info which is used in routes/apps.mjs routes/connections.mjs then at last we will do connectLocal.mjs 
we will skip trigger.mjs for now 