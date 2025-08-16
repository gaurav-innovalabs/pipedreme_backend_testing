import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { NodeVM } from 'vm2';
import axios from 'axios';
import crypto from 'crypto';
import { AppSchema } from '../schema/AppSchema.mjs';
import { ComponentSchema } from '../schema/ComponentSchema.mjs';
import { Connection } from '../schema/ConnectionSchema.mjs';
import { getDB } from './database.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COMPONENTS_ROOT = path.join(__dirname, '..',  'components');

class ComponentLoader {
    constructor() {
        this.appCache = new Map();
        this.componentCache = new Map();
    }
    
    async getAppSlugFromPath(componentPath) {
        const relPath = path.relative(COMPONENTS_ROOT, componentPath);
        return relPath.split(path.sep)[0];
    }
    
    async loadApp(slug) {
        if (this.appCache.has(slug)) return this.appCache.get(slug);
        
        const appDir = path.join(COMPONENTS_ROOT, slug);
        const pkgPath = path.join(appDir, 'package.json');
        
        try {
            const pkgData = await fs.readFile(pkgPath, 'utf8');
            const pkg = JSON.parse(pkgData);
            const meta = pkg.custom_metadata || {};
            
            const app = new AppSchema({
                id: slug,
                name_slug: slug,
                name: meta.name || slug,
                description: meta.description || pkg.description,
                img_src: meta.img_src,
                categories: meta.categories || [],
                custom_fields_json: meta.custom_fields_json || "[]"
            });
            
            this.appCache.set(slug, app);
            return app;
        } catch (error) {
            console.error(`Error loading app ${slug}:`, error);
            return null;
        }
    }
    
    async loadComponent(componentPath) {
        if (this.componentCache.has(componentPath)) {
            return this.componentCache.get(componentPath);
        }
        
        try {
            const appSlug = await this.getAppSlugFromPath(componentPath);
            const app = await this.loadApp(appSlug);
            
            // Load component module in VM to extract metadata
            const vm = new NodeVM({
                console: 'inherit',
                sandbox: {},
                require: {
                    external: true,
                    builtin: ['path', 'url', 'crypto']
                }
            });
            
            const code = await fs.readFile(componentPath, 'utf8');
            const compModule = vm.run(code, componentPath);
            const compDef = compModule.default || compModule;
            
            const component = new ComponentSchema({
                key: compDef.key,
                name: compDef.name,
                description: compDef.description,
                component_type: compDef.type,
                version: compDef.version,
                props: compDef.props || {},
                app_slug: appSlug
            });
            
            // Store original definition for execution
            component.definition = compDef;
            this.componentCache.set(componentPath, component);
            return component;
        } catch (error) {
            console.error(`Error loading component ${componentPath}:`, error);
            return null;
        }
    }
    
    async findComponentPath(key) {
        const appDirs = await fs.readdir(COMPONENTS_ROOT, { withFileTypes: true });
        
        for (const dir of appDirs) {
            if (!dir.isDirectory()) continue;
            
            const actionDir = path.join(COMPONENTS_ROOT, dir.name, 'actions');
            const triggerDir = path.join(COMPONENTS_ROOT, dir.name, 'sources');
            
            for (const compDir of [actionDir, triggerDir]) {
                try {
                    const files = await fs.readdir(compDir);
                    for (const file of files) {
                        if (file.endsWith('.mjs')) {
                            const compPath = path.join(compDir, file);
                            const component = await this.loadComponent(compPath);
                            if (component && component.key === key) {
                                return compPath;
                            }
                        }
                    }
                } catch (err) {
                    // Directory might not exist
                }
            }
        }
        return null;
    }
    
    async getComponent(key) {
        const path = await this.findComponentPath(key);
        if (!path) return null;
        return this.loadComponent(path);
    }
    
    async getApps() {
        const dirs = await fs.readdir(COMPONENTS_ROOT, { withFileTypes: true });
        return Promise.all(
            dirs.filter(d => d.isDirectory())
                .map(d => this.loadApp(d.name))
        );
    }
}


// Dynamic Prop Handler
class DynamicPropHandler {
    constructor(loader) {
        this.loader = loader;
    }
    
    async getPropOptions(componentKey, propName, userId, configuredProps, prevContext) {
        const component = await this.loader.getComponent(componentKey);
        if (!component) throw new Error('Component not found');
        
        // Get connection
        const connection = await new Promise((resolve, reject) => {
            getDB().get(
                `SELECT * FROM accounts WHERE external_user_id = ? AND app_slug = ?`,
                [userId, component.app_slug],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        if (!connection) throw new Error('No connection found');
        
        const authData = JSON.parse(connection.credentials_json);
        
        // Create execution context
        const context = {
            $: {
                axios: axios.create(),
                auths: {
                    [component.app_slug]: authData
                },
                log: console.log
            },
            prevContext: prevContext || {}
        };
        
        // Get app module
        const appPath = path.join(COMPONENTS_ROOT, component.app_slug, 'package.json');
        const pkgData = await fs.readFile(appPath, 'utf8');
        const pkg = JSON.parse(pkgData);
        const appFile = path.join(COMPONENTS_ROOT, component.app_slug, pkg.main);
        
        const appCode = await fs.readFile(appFile, 'utf8');
        const vm = new NodeVM({
            console: 'inherit',
            sandbox: { context },
            require: {
                external: true,
                builtin: ['path', 'url', 'crypto']
            }
        });
        
        const appModule = vm.run(appCode, appFile);
        const appDef = appModule.default || appModule;
        
        // Find prop definition
        const propDef = appDef.propDefinitions?.[propName];
        if (!propDef || typeof propDef.options !== 'function') {
            return { options: [] };
        }
        
        // Execute options function
        const result = await propDef.options.call({
            ...context,
            ...configuredProps
        });
        
        return result;
    }
}


// Component Runner
class ComponentRunner {
    constructor(loader) {
        this.loader = loader;
    }
    
    async runComponent(componentKey, props, userId) {
        const componentPath = await this.loader.findComponentPath(componentKey);
        if (!componentPath) throw new Error('Component not found');
        
        const component = await this.loader.loadComponent(componentPath);
        if (!component) throw new Error('Component not found');
        
        // Get connection
        const connection = await new Promise((resolve, reject) => {
            getDB().get(
                `SELECT * FROM accounts WHERE external_user_id = ? AND app_slug = ?`,
                [userId, component.app_slug],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        if (!connection) throw new Error('No connection found');
        
        const authData = JSON.parse(connection.credentials_json);
        
        // Create execution context
        const context = {
            $: {
                axios: axios.create(),
                auths: {
                    [component.app_slug]: authData
                },
                log: (...args) => console.log(`[${component.key}]`, ...args),
                export: (key, value) => {
                    context[key] = value;
                }
            },
            event: {},
            steps: {}
        };
        
        // Load app methods
        const appPath = path.join(COMPONENTS_ROOT, component.app_slug, 'package.json');
        const pkgData = await fs.readFile(appPath, 'utf8');
        const pkg = JSON.parse(pkgData);
        const appFile = path.join(COMPONENTS_ROOT, component.app_slug, pkg.main);
        
        const appCode = await fs.readFile(appFile, 'utf8');
        const appVM = new NodeVM({
            console: 'inherit',
            sandbox: { context },
            require: {
                external: true,
                builtin: ['path', 'url', 'crypto']
            }
        });
        
        const appModule = appVM.run(appCode, appFile);
        const appDef = appModule.default || appModule;
        
        // Add app methods to context
        if (appDef.methods) {
            context.$[component.app_slug] = {};
            for (const [methodName, method] of Object.entries(appDef.methods)) {
                context.$[component.app_slug][methodName] = method.bind({
                    $: context.$,
                    $auth: authData
                });
            }
        }
        
        // Execute component
        const vm = new NodeVM({
            console: 'redirect',
            sandbox: { context },
            require: {
                external: true,
                builtin: ['path', 'url', 'crypto']
            }
        });
        
        vm.on('console.log', context.$.log);
        
        const code = await fs.readFile(componentPath, 'utf8');
        const compModule = vm.run(code, componentPath);
        const compDef = compModule.default || compModule;
        
        // Create component instance
        const instance = {};
        for (const [propName] of Object.entries(compDef.props || {})) {
            if (props[propName] !== undefined) {
                instance[propName] = props[propName];
            }
        }
        
        // Execute run method
        const result = await compDef.run.call(instance, context);
        return {
            result,
            summary: context.$summary || 'Action executed successfully'
        };
    }
}

class ComponentController {
    constructor() {
        this.loader = new ComponentLoader();
        this.propHandler = new DynamicPropHandler(this.loader);
        this.runner = new ComponentRunner(this.loader);
    }
    
    async getApps() {
        return this.loader.getApps();
    }
    
    async getApp(slug) {
        const appDir = path.join(COMPONENTS_ROOT, slug);
        const pkgPath = path.join(appDir, 'package.json');
        const pkgData = await fs.readFile(pkgPath, 'utf8');
        const pkg = JSON.parse(pkgData);
        const meta = pkg.custom_metadata || {};
        
        return new AppSchema({
            id: slug,
            name_slug: slug,
            name: meta.name || slug,
            description: meta.description || pkg.description,
            img_src: meta.img_src,
            categories: meta.categories || [],
            custom_fields_json: meta.custom_fields_json || '[]'
        });
    }
    
    async getComponent(key) {
        return this.loader.getComponent(key);
    }
    
    async getPropOptions(componentKey, propName, userId, configuredProps, prevContext) {
        return this.propHandler.getPropOptions(
            componentKey,
            propName,
            userId,
            configuredProps,
            prevContext
        );
    }
    
    async runComponent(componentKey, props, userId) {
        return this.runner.runComponent(componentKey, props, userId);
    }
    
    async saveConnection(userId, appSlug, authData) {
        const id = `apn_${crypto.randomBytes(8).toString('hex')}`;
        
        await new Promise((resolve, reject) => {
            getDB().run(
                `INSERT INTO accounts (id, app_key, external_user_id, app_slug, credentials_json) VALUES (?, ?, ?, ?, ?)`,
                [id, id, userId, appSlug, JSON.stringify(authData)],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
        
        return id;
    }
}

// Singleton instance
const componentController = new ComponentController();
export default componentController;