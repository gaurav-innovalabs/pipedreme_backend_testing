import express from 'express';
import componentSystem from '../core/ComponentSystem.mjs';
import config from '../config.mjs';

const host_url = config.BE_URL;
// /v1/connect/local-project
const router = express.Router();

// GET /actions
router.get('/actions', async (req, res) => {
    const { app, limit = 50 } = req.query;

    try {
        let actions = [];
        
        if (app) {
            // Get actions for specific app
            actions = await componentSystem.getAppActions(app);
        } else {
            // Get all actions
            actions = await componentSystem.getAllActions();
        }
        
        // Apply limit
        const limitedActions = actions.slice(0, parseInt(limit));
        
        res.json({
            page_info: {
                total_count: actions.length,
                count: limitedActions.length
            },
            data: limitedActions
        });
    } catch (error) {
        console.error('Error fetching actions:', error);
        res.status(500).json({ error: 'Failed to load actions' });
    }
});

// GET /triggers
router.get('/triggers', async (req, res) => {
    const { app, limit = 50 } = req.query;

    try {
        let triggers = [];
        
        if (app) {
            // Get triggers for specific app
            triggers = await componentSystem.getAppTriggers(app);
        } else {
            // Get all triggers
            triggers = await componentSystem.getAllTriggers();
        }
        
        // Apply limit
        const limitedTriggers = triggers.slice(0, parseInt(limit));
        
        res.json({
            page_info: {
                total_count: triggers.length,
                count: limitedTriggers.length
            },
            data: limitedTriggers
        });
    } catch (error) {
        console.error('Error fetching triggers:', error);
        res.status(500).json({ error: 'Failed to load triggers' });
    }
});

router.get('/components/:component_id', async (req, res) => {
    try {
        const component = await componentSystem.getComponent(req.params.component_id);
        if (component) {
            res.json({ data: component });
        } else {
            res.status(404).json({ 
                error: `Component ${req.params.component_id} not found` 
            });
        }
    } catch (error) {
        console.error('Error fetching component:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /v1/connect/local-project/components/props
router.post('/components/props', async (req, res) => {
    try {
        const { external_user_id, id, prop_name, configured_props } = req.body;

        if (!external_user_id || !id || !prop_name) {
            return res.status(400).json({
                error: 'external_user_id, id, and prop_name are required'
            });
        }

        const result = await componentSystem.getPropOptions(
            id,
            prop_name,
            external_user_id,
            configured_props || {},
            {}
        );

        res.json({
            props: {
                [prop_name]: result
            }
        });
    } catch (error) {
        console.error('Error fetching prop options:', error);
        res.status(404).json({
            error: 'Component not found'
        });
    }
});

// POST /v1/connect/local-project/components/configure
router.post('/components/configure', async (req, res) => {
    try {
        const { external_user_id, id, configured_props } = req.body;

        if (!external_user_id || !id || !configured_props) {
            return res.status(400).json({
                error: 'external_user_id, id, and configured_props are required'
            });
        }

        // Get component details and return all props with configured values
        const component = await componentSystem.getComponent(id);
        if (!component) {
            return res.status(404).json({
                error: 'Component not found'
            });
        }

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
    } catch (error) {
        console.error('Error configuring component:', error);
        res.status(404).json({
            error: 'Component not found'
        });
    }
});


// POST /actions/run - Execute component action
router.post('/actions/run', async (req, res) => {
    try {
        const { external_user_id, id, configured_props } = req.body;
        
        if (!external_user_id || !id || !configured_props) {
            return res.status(400).json({
                error: 'external_user_id, id, and configured_props are required'
            });
        }

        const result = await componentSystem.runComponent(
            id,
            configured_props,
            external_user_id
        );
        
        res.json({
            run_id: `run_${Date.now()}`,
            status: 'succeeded',
            output: result
        });
    } catch (error) {
        console.error('Error running component:', error);
        res.status(500).json({ 
            error: error.message || 'Failed to run component'
        });
    }
});

export default router;