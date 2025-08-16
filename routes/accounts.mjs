import express from 'express';

const host_url = config.BE_URL
// /v1/connect/local-project
const router = express.Router();

// GET /accounts
router.get('/accounts', (req, res) => {
    const { app, external_user_id, include_credentials } = req.query;

    const db = getDb();
    
    let query = `SELECT * FROM accounts WHERE 1=1`;
    const params = [];

    if (app) {
      query += ` AND app = ?`;
      params.push(app);
    }

    if (external_user_id) {
      query += ` AND external_user_id = ?`;
      params.push(external_user_id);
    }

    const getAccounts = db.prepare(query);
    const accounts = getAccounts.all(...params);

    const data = accounts.map(account => {
      const credentials = JSON.parse(account.credentials_json);
      const result = {
        id: account.id,
        app: account.app,
        external_user_id: account.external_user_id,
        label: `${account.app} (${account.external_user_id})`,
        created_at: account.created_at
      };

      if (include_credentials === 'true') {
        result.credentials = credentials;
      } else {
        result.masked = maskCredentials(credentials);
      }

      return result;
    });

    res.json({
      data,
          });
    res.status(500).json({
      error: 'Failed to fetch accounts',
          });
});

// GET /accounts/:account_id
router.get('/accounts/:account_id', (req, res) => {
    const { account_id } = req.params;
    const { include_credentials } = req.query;
    const db = getDb();

    const getAccount = db.prepare(`
      SELECT * FROM accounts WHERE id = ?
    `);
    const account = getAccount.get(account_id);

    if (!account) {
      return res.status(404).json({
        error: 'Account not found',
              });
    }

    const credentials = JSON.parse(account.credentials_json);
    const result = {
      id: account.id,
      app: account.app,
      external_user_id: account.external_user_id,
      label: `${account.app} (${account.external_user_id})`,
      created_at: account.created_at
    };

    if (include_credentials === 'true') {
      result.credentials = credentials;
    } else {
      result.masked = maskCredentials(credentials);
    }

    res.json({
      data: result,
          });
    res.status(500).json({
      error: 'Failed to fetch account',
          });
});

// DELETE /accounts/:account_id
router.delete('/accounts/:account_id', (req, res) => {
    const { account_id } = req.params;
    const db = getDb();

    const deleteAccount = db.prepare(`
      DELETE FROM accounts WHERE id = ?
    `);
    const result = deleteAccount.run(account_id);

    if (result.changes === 0) {
      return res.status(404).json({
        error: 'Account not found',
              });
    }

    res.json({
        deleted: true,
        id: account_id
      });
    res.status(500).json({
      error: 'Failed to delete account',
          });
});

// DELETE /users/:external_user_id
router.delete('/users/:external_user_id', (req, res) => {
    const { external_user_id } = req.params;
    const db = getDb();

    // Delete all accounts for this user first
    const deleteAccounts = db.prepare(`
      DELETE FROM accounts WHERE external_user_id = ?
    `);
    deleteAccounts.run(external_user_id);

    // Delete all runs for this user
    const deleteRuns = db.prepare(`
      DELETE FROM runs WHERE external_user_id = ?
    `);
    deleteRuns.run(external_user_id);

    // Delete the user
    const deleteUser = db.prepare(`
      DELETE FROM users WHERE external_user_id = ?
    `);
    const result = deleteUser.run(external_user_id);

    if (result.changes === 0) {
      return res.status(404).json({
        error: 'User not found',
              });
    }

    res.json({
        deleted: true,
        external_user_id: external_user_id
      });
    res.status(500).json({
      error: 'Failed to delete user',
          });
});

// GET /actions
router.get('/actions', async (req, res) => {
    const { app, limit } = req.query;

    if (!app) {
      return res.status(400).json({
        error: 'app parameter is required',
              });
    }

    let actions = await getAppActions(app);

    if (limit) {
      const limitNum = parseInt(limit, 10);
      if (!isNaN(limitNum) && limitNum > 0) {
        actions = actions.slice(0, limitNum);
      }
    }

    res.json({
      data: actions,
          });
    res.status(404).json({
      error: `Actions for app ${req.query.app} not found`,
          });
});

// POST /actions/run
router.post('/actions/run', (req, res) => {
    const { external_user_id, id, configured_props } = req.body;

    if (!external_user_id || !id || !configured_props) {
      return res.status(400).json({
        error: 'external_user_id, id, and configured_props are required',
              });
    }

    // Extract app from configured_props (look for auth provision)
    let app = 'unknown';
    for (const [key, value] of Object.entries(configured_props)) {
      if (typeof value === 'object' && value.authProvisionId) {
        app = key;
        break;
      }
    }

    // Mock run execution
    const runId = `run_${uuidv4().replace(/-/g, '').substring(0, 16)}`;
    const output = {
      message: 'Mock action executed successfully',
      action_id: id,
      configured_props: configured_props,
      timestamp: new Date().toISOString()
    };

    const db = getDb();
    
    // Store run record
    const insertRun = db.prepare(`
      INSERT INTO runs (id, app, action_id, external_user_id, configured_props_json, status, output_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    insertRun.run(
      runId,
      app,
      id,
      external_user_id,
      JSON.stringify(configured_props),
      'succeeded',
      JSON.stringify(output)
    );

    res.json({
        run_id: runId,
        status: 'succeeded',
        output: output
      });
    console.error('Error running action:', error);
    res.status(500).json({
      error: 'Failed to run action'
    });
});

// POST /tokens
router.post('/tokens', (req, res) => {
    const { external_user_id } = req.body;

    if (!external_user_id) {
      return res.status(400).json({
        error: 'external_user_id is required'
      });
    }

    const db = getDb();
    
    // Ensure user exists
    const insertUser = db.prepare(`
      INSERT OR IGNORE INTO users (external_user_id) VALUES (?)
    `);
    insertUser.run(external_user_id);

    // Generate a connection token (for frontend auth)
    const token = `tok_${uuidv4().replace(/-/g, '').substring(0, 24)}`;

    res.json({
        token: token,
        external_user_id: external_user_id,
        connect_link_url: host_url+"/mock",
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
      });
    res.status(500).json({
      error: 'Failed to generate token'
    });
});

// GET /components/:component_id
router.get('/components/:component_id', async (req, res) => {
    const { component_id } = req.params;
    const component = await getComponentDetails(component_id);
    res.json({
      data: component
    });
    console.log('Error fetching component details:', error, req.params.component_id);
    res.status(404).json({
      error: `Component ${req.params.component_id} not found`
    });
});

// GET /v1/connect/local-project/triggers
router.get('/triggers', async (req, res) => {
    const { app, limit } = req.query;

    if (!app) {
      return res.status(400).json({
        error: 'app parameter is required'
      });
    }

    // For now, return empty triggers as most components don't have triggers
    let triggers = [];

    if (limit) {
      const limitNum = parseInt(limit, 10);
      if (!isNaN(limitNum) && limitNum > 0) {
        triggers = triggers.slice(0, limitNum);
      }
    }

    res.json({
      data: triggers
    });
    res.status(404).json({
      error: `Triggers for app ${req.query.app} not found`
    });
});

// POST /v1/connect/local-project/components/props
router.post('/components/props', async (req, res) => {
    const { external_user_id, id, prop_name, configured_props } = req.body;

    if (!external_user_id || !id || !prop_name) {
      return res.status(400).json({
        error: 'external_user_id, id, and prop_name are required'
      });
    }

    // Get component details to return prop options
    const component = await getComponentDetails(id);
    const prop = component.configurable_props.find(p => p.name === prop_name);
    
    if (prop && prop.remoteOptions) {
      // For remote options like Slack channels, return mock data
      const options = [];
      if (prop_name === 'channel' && id.includes('slack')) {
        options.push(
          { label: '#general', value: 'C1234567890' },
          { label: '#random', value: 'C0987654321' },
          { label: '#dev', value: 'C1122334455' }
        );
      }
      
      res.json({
          props: {
            [prop_name]: {
              ...prop,
              options: options
            }
          }
        });
    } else {
      res.json({
          props: {
            [prop_name]: prop || {}
          }
        });
    }
    res.status(404).json({
      error: 'Component not found'
    });
});

// POST /v1/connect/local-project/components/configure
router.post('/components/configure', async (req, res) => {
    const { external_user_id, id, configured_props } = req.body;

    if (!external_user_id || !id || !configured_props) {
      return res.status(400).json({
        error: 'external_user_id, id, and configured_props are required'
      });
    }

    // Get component details and return all props with configured values
    const component = await getComponentDetails(id);
    const responseProps = {};

    component.configurable_props.forEach(prop => {
      responseProps[prop.name] = {
        ...prop,
        value: configured_props[prop.name] || prop.default
      };
    });

    res.json({
        props: responseProps
    });
    res.status(404).json({
      error: 'Component not found'
    });
});

export default router;