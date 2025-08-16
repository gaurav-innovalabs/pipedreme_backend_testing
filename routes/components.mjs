import express from 'express';
import { 
    ...
} from '../core/componentSystem.mjs';
import config from '../config.mjs';
const host_url = config.BE_URL
// /v1/connect/local-project
const router = express.Router();

// GET /actions
router.get('/actions', async (req, res) => {
    const { app, limit = 50 } = req.query;

    if (!app) {
        return res.status(400).json({ error: 'app parameter is required' });
    }

    try {
        const actions = await getAppComponents(app, 'actions', limit);
        res.json(paginate(actions, limit));
    } catch (error) {
        console.error('Error fetching actions:', error);
        res.status(500).json({ error: 'Failed to load actions' });
    }
});

router.get('/components/:component_id', async (req, res) => {
    try {
        const component = await getComponent(req.params.component_id);
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
    const { external_user_id, id, prop_name, configured_props } = req.body;

    if (!external_user_id || !id || !prop_name) {
      return res.status(400).json({
        error: 'external_user_id, id, and prop_name are required'
      });
    }

    // Get component details to return prop options
    const component = await getComponentDetails(id);
    const prop = component.configurable_props.find(p => p.name === prop_name);
    ..
    const component = await componentController.getComponent(req.params.key);
        ..
        
    const result = await componentController.getPropOptions(
      component_key,
      prop_name,
      user_id,
      configured_props,
      prev_context
  );
..
    if (prop && prop.remoteOptions) {
        ...

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


// POST /components/run
router.post('/components/run', async (req, res) => {
  const { component_key, props, user_id } = req.body;
  
  try {
      const result = await componentController.runComponent(
          component_key,
          props,
          user_id
      );
      res.json(result);
  } catch (error) {
      res.status(500).json({ error: error.message });
  }
});

export default router;