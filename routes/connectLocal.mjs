import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { maskCredentials } from .. ;
const host_url = process.env.HOST_URL;
const router = express.Router();

// GET /v1/connect/local-project/auth/oauth/start /// got from /_static/connect.html request
router.get('/auth/oauth/:app_slug/start', (req, res) => {
    const { app, external_user_id, redirect_uri } = req.query;

    if (!app || !external_user_id || !redirect_uri) {
      return res.status(400).json({
        error: 'app, external_user_id, and redirect_uri are required',
              });
    }

    const db = getDb();
    const state = `state_${uuidv4().replace(/-/g, '').substring(0, 16)}`;

    // Store OAuth state
    const insertState = db.prepare(`
      INSERT INTO oauth_states (state, app, external_user_id, redirect_uri)
      VALUES (?, ?, ?, ?)
    `);
    insertState.run(state, app, external_user_id, redirect_uri);

    res.json({
        authorization_url: `https://mock-oauth/authorize?state=${state}`
      });
    res.status(500).json({
      error: 'Failed to start OAuth flow',
          });
});

// GET /v1/connect/local-project/auth/oauth/callback
router.get('/auth/oauth/:app_slug/callback', (req, res) => {
    const { state, code } = req.query;

    if (!state || !code) {
      return res.status(400).json({
        error: 'state and code are required',
              });
    }

    const db = getDb();
    
    // Get OAuth state
    const getState = db.prepare(`
      SELECT * FROM oauth_states WHERE state = ?
    `);
    const oauthState = getState.get(state);

    if (!oauthState) {
      return res.status(400).json({
        error: 'Invalid state',
              });
    }

    // Mock OAuth token exchange
    const mockTokens = {
      access_token: `mock_access_token_${uuidv4()}`,
      refresh_token: `mock_refresh_token_${uuidv4()}`,
      expires_in: 3600
    };

    // Ensure user exists
    const insertUser = db.prepare(`
      INSERT OR IGNORE INTO users (external_user_id) VALUES (?)
    `);
    insertUser.run(oauthState.external_user_id);

    // Create account with OAuth tokens
    const accountId = `acc_${uuidv4().replace(/-/g, '').substring(0, 16)}`;
    const insertAccount = db.prepare(`
      INSERT INTO accounts (id, app, external_user_id, credentials_json)
      VALUES (?, ?, ?, ?)
    `);

    insertAccount.run(
      accountId,
      oauthState.app,
      oauthState.external_user_id,
      JSON.stringify(mockTokens)
    );

    // Clean up OAuth state
    const deleteState = db.prepare(`
      DELETE FROM oauth_states WHERE state = ?
    `);
    deleteState.run(state);

    // Get the created account
    const getAccount = db.prepare(`
      SELECT * FROM accounts WHERE id = ?
    `);
    const account = getAccount.get(accountId);

    res.json({
        id: account.id,
        app: account.app,
        external_user_id: account.external_user_id,
        label: `${oauthState.app} (${oauthState.external_user_id})`,
        created_at: account.created_at,
        masked: maskCredentials(mockTokens)
      });
    console.error('Error in OAuth callback:', error);
    res.status(500).json({
      error: 'OAuth callback failed',
          });
});
// Above one is in no USE

// POST /v1/connect/local-project/tokens
router.post('/tokens', (req, res) => {
  const { user_id, app_slug, auth_data } = req.body;
    
  try {
      const connectionId = await componentController.saveConnection(
          user_id,
          app_slug,
          auth_data
      );
      res.json({ id: connectionId });
  } catch (error) {
      res.status(500).json({ error: error.message });
  }
  ....
  const db = getDb();
    const state = `state_${uuidv4().replace(/-/g, '').substring(0, 16)}`;

    // Store OAuth state
    const insertState = db.prepare(`
      INSERT INTO oauth_states (state, app, external_user_id, redirect_uri)
      VALUES (?, ?, ?, ?)
    `);
    insertState.run(state, app, external_user_id, redirect_uri);

    // Generate a connection token (for frontend auth)
    const token = `ctok_${uuidv4().replace(/-/g, '').substring(0, 24)}`;

    res.json({
        token: token,
        external_user_id: external_user_id, // extra information
        connect_link_url: host_url+"/_static/connect.html?token="+token,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
      });
    res.status(500).json({
      error: 'Failed to generate token'
    });
});

export default router;

//  TODO API verify..