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

async function run() {
  const appMeta = {
    slug,
    name: slug,
    description: "",
    version: "",
    img_src: undefined,
    categories: [],
    definition: undefined,
    actions: {},
    sources: {},
    // index: componentKey -> compDefObj
    componentsIndex: {}
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
        if (appMeta.definition.name) appMeta.name = appMeta.definition.name;
        if (appMeta.definition.description) appMeta.description = appMeta.definition.description;
      
        
        // appMeta.id= appMeta.definition.name;
        // appMeta.name_slug= appMeta.definition.name;
        // appMeta.name = appMeta.definition.name;
        // const meta = appMeta.definition.custom_metadata || {};
        // appMeta.description= appMeta.definition.description || meta.description ;
        // appMeta.img_src= meta.img_src;
        // appMeta.categories= meta.categories || [];
        // appMeta.custom_fields_json= meta.custom_fields_json || "[]";
        // appMeta.version= appMeta.definition.version;
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
          const { componentKey, propName, userId, configuredProps, prevContext } = payload;
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

          // build context (very similar to runtime)
          const connectionRow = await new Promise((resolve) => {
            // worker has no DB access; parent can provide credentials if needed in future.
            // For now we will not query DB inside worker — parent should pass auth info if needed.
            resolve(null);
          });

          const context = {
            $: {
              axios: (await import("axios")).default.create(),
              auths: {},
              log: (...args) => { /* optional log */ }
            },
            prevContext: prevContext || {}
          };

          // If parent passed configuredProps we merge when calling
          const result = await propDef.options.call({ ...context, ...configuredProps });
          send({ id, ok: true, result });
          return;
        }

        if (op === "runComponent") {
          const { componentKey, props, userId } = payload;
          const comp = appMeta.componentsIndex[componentKey];
          if (!comp) {
            send({ id, ok: false, error: "component not found" });
            return;
          }

          // create instance props
          const inst = {};
          for (const [pn] of Object.entries(comp.definition.props || {})) {
            if (props && props[pn] !== undefined) inst[pn] = props[pn];
          }

          // build execution context (simple)
          const context = {
            $: {
              axios: (await import("axios")).default.create(),
              auths: {}, // parent could send auth info in payload in future
              log: (...args) => console.log(`[${componentKey}]`, ...args),
              export: (k, v) => { context[k] = v; }
            },
            event: {},
            steps: {},
            props
          };

          // attach app methods if provided on app definition
          if (appMeta.definition && appMeta.definition.methods) {
            context.$[slug] = {};
            for (const [mName, fn] of Object.entries(appMeta.definition.methods || {})) {
              context.$[slug][mName] = fn.bind({ $: context.$, $auth: {} });
            }
          }

          // call run
          if (typeof comp.definition.run !== "function") {
            send({ id, ok: false, error: "component has no run()" });
            return;
          }

          try {
            const result = await comp.definition.run.call(inst, context);
            send({ id, ok: true, result });
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
