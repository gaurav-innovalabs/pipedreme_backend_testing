// core/app_worker.mjs
import { parentPort, workerData } from "worker_threads";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import url from "url";

const { appPath, slug } = workerData;

function safeClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}
function send(msg) {

  parentPort.postMessage(safeClone(msg));
}

function wrapError(e) {
  return { message: e.message, stack: e.stack };
}

// simple indexing helper for meta packing
function packComponentMeta(comp) {
  // keep functions out of meta (we'll keep definitions in memory)
  return {
    key: comp.key,
    name: comp.name,
    description: comp.description || "",
    component_type: comp.component_type,
    version: comp.version,
    props: comp.props || {},
    app_slug: comp.app_slug,
    path: comp.path
  };
}

/**
 * Build a runtime app object bound to a per-run context and auth.
 * IMPORTANT: we create a single runtimeApp object, set runtimeApp.$ and runtimeApp.$auth,
 * then attach all methods bound to runtimeApp so that methods can call this._makeRequest() etc.
 */
function makeRuntimeApp(appDef = {}, context = {}, authData = {}) {
  // start with a fresh object
  const runtimeApp = {};

  // copy small metadata fields so components can inspect them if needed
  const keysToCopy = ["type", "app", "propDefinitions", "name", "description"];
  for (const k of keysToCopy) {
    if (appDef[k] !== undefined) runtimeApp[k] = appDef[k];
  }

  // attach per-run utilities
  runtimeApp.$ = context.$;
  runtimeApp.$auth = authData;

  // Now attach methods. We *must* attach all methods to runtimeApp so they can reference each other via this.*
  if (appDef.methods && typeof appDef.methods === "object") {
    for (const [mName, fn] of Object.entries(appDef.methods)) {
      if (typeof fn === "function") {
        // bind to runtimeApp (so inside fn, this === runtimeApp)
        runtimeApp[mName] = fn.bind(runtimeApp);
      }
    }
  }

  return runtimeApp;
}

async function run() {
  const appMeta = {
    slug,
    id: slug,
    name_slug: slug,
    name: slug,
    description: "",
    version: "",
    img_src: null,
    categories: [],
    auth_type: "none",
    definition: null,
    custom_fields_json: "[]",
    actions: {},
    sources: {},
    componentsIndex: {},
  };

  try {
    // load package.json main and app definition (if any)
    const pkgPath = path.join(appPath, "package.json");
    let pkg = null;
    try {
      const pkgText = await fs.readFile(pkgPath, "utf8");
      pkg = JSON.parse(pkgText);
      appMeta.version = pkg.version || "";
    } catch (e) { /* ignore */ }

    if (pkg && pkg.main) {
      try {
        const mainFile = path.join(appPath, pkg.main);
        const appModule = await import(url.pathToFileURL(mainFile));
        appMeta.definition = appModule.default || appModule;
        // copy optional metadata from package.custom_metadata if present
        const meta = pkg.custom_metadata;
        if (appMeta.definition.name) {
          appMeta.name = appMeta.id = appMeta.name_slug = appMeta.definition.name;
        }
        if (pkg.description) appMeta.description = pkg.description;
        if (pkg.version) appMeta.version = pkg.version;
        if (meta !== undefined) {
          appMeta.img_src = meta.img_src || appMeta.img_src;
          appMeta.categories = meta.categories || appMeta.categories;
          appMeta.custom_fields_json = meta.custom_fields_json || appMeta.custom_fields_json;
          appMeta.description = meta.description || appMeta.description;
          if (meta.id) appMeta.id = meta.id;
          if (meta.name_slug) appMeta.name_slug = meta.name_slug;
          if (meta.name) appMeta.name = meta.name;
          if (meta.auth_type) appMeta.auth_type = meta.auth_type;
        }
      } catch (e) {
        // main may import packages — those should resolve because we installed per-app node_modules
        console.warn(`[worker ${slug}] could not import app main:`, e.message);
      }
    }

    // helper: load components in folder (actions/sources)
    async function loadFolder(folder, type) {
      const full = path.join(appPath, folder);
      try {
        const entries = await fs.readdir(full, { withFileTypes: true });
        for (const e of entries) {
          if (e.isDirectory()) {
            const compDir = path.join(full, e.name);
            const files = await fs.readdir(compDir);
            const mjsFile = files.find(f => f.endsWith(".mjs") && f !== "test-event.mjs");
            if (mjsFile) {
              const filePath = path.join(compDir, mjsFile);
              await importAndIndex(filePath, type);
            }
          } else if (e.name.endsWith(".mjs")) {
            await importAndIndex(path.join(full, e.name), type);
          }
        }
      } catch (err) {
        // folder not present — ignore
      }
    }

    async function importAndIndex(filePath, type) {
      try {
        const mod = await import(url.pathToFileURL(filePath));
        const def = mod.default || mod;
        if (!def || !def.key) {
          console.warn(`[worker ${slug}] component missing key at ${filePath}`);
          return;
        }
        const comp = {
          key: def.key,
          name: def.name,
          description: def.description || "",
          component_type: type,
          version: def.version || "0.0.1",
          props: def.props || {},
          app_slug: slug,
          definition: def,
          path: filePath
        };
        if (type === "action") appMeta.actions[def.key] = packComponentMeta(comp);
        else appMeta.sources[def.key] = packComponentMeta(comp);
        appMeta.componentsIndex[def.key] = comp;
      } catch (err) {
        console.warn(`[worker ${slug}] failed to import ${filePath}: ${err.message}`);
      }
    }

    await loadFolder("actions", "action");
    await loadFolder("sources", "source");

    // send ready + metadata (actions & sources list)
    send({ event: "ready", meta: appMeta });

    // RPC handlers
    parentPort.on("message", async (msg) => {
      const { id, op, payload } = msg;
      if (!id) return;
      try {
        if (op === "listComponents") {
          send({ id, ok: true, result: { actions: appMeta.actions, sources: appMeta.sources, componentsIndex: Object.keys(appMeta.componentsIndex) }});
          return;
        }

        if (op === "propOptions") {
          const { componentKey, propName, userId, configuredProps, prevContext, authData = {} } = payload;
          const comp = appMeta.componentsIndex[componentKey];
          if (!comp) {
            send({ id, ok: false, error: "component not found" });
            return;
          }

          // prop definitions may live on app definition or component definition
          const appDef = appMeta.definition || {};
          const propDef = (appDef.propDefinitions && appDef.propDefinitions[propName]) || (comp.definition.propDefinitions && comp.definition.propDefinitions[propName]);

          if (!propDef || typeof propDef.options !== "function") {
            send({ id, ok: true, result: { options: [] }});
            return;
          }

          const resultContainer = {};
          let axiosClient = null;
          try {
            const imported = await import("axios");
            axiosClient = imported.default || imported;
            axiosClient = axiosClient.create ? axiosClient.create() : axiosClient;
          } catch (e) {
            axiosClient = null;
          }

          const context = {
            $: {
              axios: axiosClient,
              auths: { [slug]: authData },
              log: (...args) => { /* no-op */ },
              export: (k, v) => { resultContainer[k] = v; }
            },
            prevContext: prevContext || {}
          };

          // call prop option
          try {
            const mergedThis = { ...context.$, ...(configuredProps || {}) };
            const result = await propDef.options.call(mergedThis);
            send({ id, ok: true, result });
          } catch (err) {
            send({ id, ok: false, error: err.message || String(err) });
          }
          return;
        }

        if (op === "runComponent") {
          const { componentKey, props = {}, userId, authData = {} } = payload;
          const comp = appMeta.componentsIndex[componentKey];
          if (!comp) {
            send({ id, ok: false, error: "component not found" });
            return;
          }

          // create instance and copy props so `this.q` works
          const inst = {};
          for (const [pn] of Object.entries(comp.definition.props || {})) {
            if (props && props[pn] !== undefined) inst[pn] = props[pn];
          }
          inst.props = { ...(props || {}) };
          // copy all props to top-level this as convenience
          Object.assign(inst, inst.props);

          const resultContainer = {};

          // prepare axios for context.$ if possible
          let axiosClient = null;
          try {
            const imported = await import("axios");
            axiosClient = imported.default || imported;
            axiosClient = axiosClient.create ? axiosClient.create() : axiosClient;
          } catch (e) {
            axiosClient = null;
          }

          const context = {
            $: {
              axios: axiosClient,
              auths: { [slug]: authData },
              log: (...args) => console.log(`[${componentKey}]`, ...args),
              export: (k, v) => {
                if (k === "$summary") {
                  resultContainer.$summary = v;
                } else {
                  resultContainer[k] = v;
                }
              },
            },
            event: {},
            steps: {},
            props: inst.props,
          };

          // Build runtime app correctly (single object with all methods attached)
          const runtimeApp = makeRuntimeApp(appMeta.definition || {}, context, authData);

          // attach runtime app to instance so component code can call `this.app.*`
          inst.app = runtimeApp;

          // also copy bound app methods into context.$[slug] to match common patterns
          if (!context.$[slug]) context.$[slug] = {};
          if (runtimeApp) {
            for (const k of Object.keys(runtimeApp)) {
              if (typeof runtimeApp[k] === "function") {
                context.$[slug][k] = runtimeApp[k].bind(runtimeApp);
              }
            }
          }

          if (typeof comp.definition.run !== "function") {
            send({ id, ok: false, error: "component has no run()" });
            return;
          }

          try {
            const runResult = await comp.definition.run.call(inst, context);
            let finalResult;
            if (runResult && typeof runResult === "object" && !Array.isArray(runResult)) {
              finalResult = { ...runResult, ...resultContainer };
            } else {
              finalResult = { data: runResult, ...resultContainer };
            }
            send({ id, ok: true, result: finalResult });
          } catch (e) {
            send({ id, ok: false, error: e.message || String(e) });
          }
          return;
        }

        // unknown op
        send({ id, ok: false, error: "unknown op" });
      } catch (err) {
        send({ id, ok: false, error: wrapError(err).message });
      }
    });

  } catch (err) {
    console.error(`[worker ${slug}] fatal:`, err);
    send({ event: "fatal", error: wrapError(err) });
  }
}

run();
