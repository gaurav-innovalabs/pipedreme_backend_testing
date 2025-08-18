// core/ComponentSystem.mjs
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { Worker } from "worker_threads";
import { exec } from "child_process";
import { promisify } from "util";
import crypto from "crypto";

import { AppSchema } from "../schema/AppSchema.mjs";
import { ComponentSchema } from "../schema/ComponentSchema.mjs";

const execP = promisify(exec);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COMPONENTS_ROOT = path.join(__dirname, "..", "components");

function makeId() {
  return crypto.randomBytes(8).toString("hex");
}

export class ComponentSystem {
  constructor(root = COMPONENTS_ROOT) {
    this.root = root;
    this.apps = new Map(); // slug -> { worker, pending, meta }
    this.workers = new Map();
  }

  // scan and boot all apps
  async init() {
    const entries = await fs.readdir(this.root, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const slug = e.name;
      const appPath = path.join(this.root, slug);
      await this._prepareAndStartApp(slug, appPath).catch(err => {
        console.error(`Failed to start app ${slug}:`, err);
      });
    }
  }

  // Ensure dependencies installed and spawn worker
  async _prepareAndStartApp(slug, appPath) {
    const pkgPath = path.join(appPath, "package.json");
    let pkg = null;
    try {
      const pkgText = await fs.readFile(pkgPath, "utf8");
      pkg = JSON.parse(pkgText);
    } catch { /* ignore */ }

    if (pkg && (pkg.dependencies || pkg.peerDependencies)) {
      console.log(`[component-system] Installing deps for ${slug}...`);
      try {
        await execP(`npm install --production --no-audit --no-fund --prefix "${appPath}"`);
        console.log(`[component-system] Installed deps for ${slug}`);
      } catch (err) {
        console.error(`[component-system] npm install failed for ${slug}:`, err.stderr || err);
      }
    }

    const workerFile = new URL("./app_worker.mjs", import.meta.url);
    const worker = new Worker(workerFile, {
      workerData: { appPath, slug },
      execArgv: [],
      type: "module",
    });

    const pending = new Map();
    function   _parse_actions_schema(actions) {
      // process for configuration_props
      for (const [action_key, action_value] of Object.entries(actions)) {
        let configured_props = [];
        for (const [required_key, value] of Object.entries(action_value.props || {})) {
          // Case 1: value has propDefinition // reusable code handling
          if (value?.propDefinition) {
            configured_props.push({
              name: required_key,
              ...(value?.propDefinition[0].propDefinitions[`${required_key}`] || {}),
            });
          } else {
            // Case 2: plain prop object, just include
            configured_props.push({
              name: required_key,
              ...value,
            });
          }
        }
        // remove unnecessary props
        actions[action_key].props = configured_props.map((prop) => {
          const cleaned = { ...prop };
          delete cleaned.methods;
          delete cleaned.propDefinitions;
          return cleaned;
        });
      }
      // remove unnecessary information
  
      // return actions
      return actions;
    }

    const ready = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("worker init timeout")), 20000);

      worker.on("message", msg => {
        if (!msg || typeof msg !== "object") return;
        const { id, ok, result, error, event } = msg;

        if (event === "ready") {
          clearTimeout(timeout);
          let meta = msg.meta;
          meta.actions = _parse_actions_schema(meta.actions);
          meta.sources = _parse_actions_schema(meta.sources);
          this.apps.set(slug, { worker, pending, meta});
          this.workers.set(slug, worker);
          console.log(`[component-system] worker ready for ${slug}`);
          resolve(meta);
          return;
        }

        if (id) {
          const p = pending.get(id);
          if (!p) return;
          pending.delete(id);
          if (ok) {
            p.resolve(result);
          } else {
            // Handle error with proper structure for Pipedream compatibility
            const err = new Error(error || "worker error");
            if (msg.exports || msg.os) {
              err.exports = msg.exports;
              err.os = msg.os;
            }
            p.reject(err);
          }
        }
      });

      worker.on("error", err => {
        clearTimeout(timeout);
        console.error(`[component-system] worker error for ${slug}:`, err);
        reject(err);
      });

      worker.on("exit", code => {
        clearTimeout(timeout);
        console.log(`[component-system] worker exit for ${slug} code=${code}`);
        this.apps.delete(slug);
        this.workers.delete(slug);
      });
    });

    // placeholder until ready
    this.apps.set(slug, { worker, pending, meta: null });
    await ready;
  }

  // RPC helper
  _rpc(worker, pending, op, payload = {}) {
    const id = makeId();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error("worker rpc timeout"));
        }
      }, 15000);

      pending.set(id, {
        resolve: v => { clearTimeout(timeout); resolve(v); },
        reject: e => { clearTimeout(timeout); reject(e); },
      });

      worker.postMessage({ id, op, payload });
    });
  }

  // public APIs
  async getApps() {
    return [...this.apps.values()]
      .filter(e => e.meta)
      .map(e => new AppSchema(e.meta));
  }

  async getApp(slug) {
    const entry = this.apps.get(slug);
    return entry?.meta ? new AppSchema(entry.meta) : null;
  }

  async getAllActions() {
    const comps = [];
    for (const { meta } of this.apps.values()) {
      if (!meta) continue;
      for (const key of Object.keys(meta.actions || {})) {
        comps.push(new ComponentSchema(meta.actions[key]));
      }
    }
    return comps;
  }

  async getAllTriggers() {
    const comps = [];
    for (const { meta } of this.apps.values()) {
      if (!meta) continue;
      for (const key of Object.keys(meta.sources || {})) {
        comps.push(new ComponentSchema(meta.sources[key]));
      }
    }
    return comps;
  }

  async getAppActions(slug) {
    const entry = this.apps.get(slug);
    if (!entry?.meta) return [];
    return Object.keys(entry.meta.actions || {}).map(k => new ComponentSchema(entry.meta.actions[k]));
  }

  async getAppTriggers(slug) {
    const entry = this.apps.get(slug);
    if (!entry?.meta) return [];
    return Object.keys(entry.meta.sources || {}).map(k => new ComponentSchema(entry.meta.sources[k]));
  }

  async getComponent(componentKey) {
    for (const { meta } of this.apps.values()) {
      if (!meta) continue;
      if (meta.actions?.[componentKey]) return new ComponentSchema(meta.actions[componentKey]);
      if (meta.sources?.[componentKey]) return new ComponentSchema(meta.sources[componentKey]);
    }
    return null;
  }

  async getPropOptions(componentKey, propName, userId, configuredProps = {}, prevContext = {}, authData = {}) {
    const entry = [...this.apps.values()].find(e => e.meta?.componentsIndex?.[componentKey]);
    if (!entry) throw new Error("component not found");
    return this._rpc(entry.worker, entry.pending, "propOptions", { componentKey, propName, userId, configuredProps, prevContext, authData });
  }

  async runComponent(componentKey, props = {}, userId, authData = {}) {
    const entry = [...this.apps.values()].find(e => e.meta?.actions?.[componentKey]);
    if (!entry) throw new Error("component not found");
    return this._rpc(entry.worker, entry.pending, "runComponent", { componentKey, props, userId, authData });
  }

  async registerNewApp(slug) {
    const appPath = path.join(this.root, slug);
    await this._prepareAndStartApp(slug, appPath);
  }
}

// export singleton
const system = new ComponentSystem();
export default system;
