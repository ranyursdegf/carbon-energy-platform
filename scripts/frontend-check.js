const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");

const pages = {
  index: {
    html: "viewweb/index.html",
    scripts: ["viewweb/app.js", "viewweb/api.js", "viewweb/home.js"]
  },
  areas: {
    html: "viewweb/areas.html",
    scripts: ["viewweb/api.js", "viewweb/areas.js"]
  },
  admin: {
    html: "viewweb/admin.html",
    scripts: ["viewweb/api.js", "viewweb/admin.js"]
  },
  module: {
    html: "viewweb/module.html",
    scripts: ["viewweb/app.js", "viewweb/api.js", "viewweb/module.js"]
  }
};

function readText(filePath) {
  return fs.readFileSync(path.join(root, filePath), "utf8");
}

function idsFromHtml(html) {
  return new Set([...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]));
}

function scriptRefsFromHtml(html, htmlPath) {
  return [...html.matchAll(/<script\s+src="([^"]+)"/g)].map((match) => {
    const normalized = path.normalize(path.join(path.dirname(htmlPath), match[1]));
    return normalized.replaceAll(path.sep, "/");
  });
}

function htmlRefsFromHtml(html) {
  return [...html.matchAll(/href="\.\/([^"?#]+\.html)/g)].map((match) => `viewweb/${match[1]}`);
}

function jsGetElementIds(source) {
  return [...source.matchAll(/document\.getElementById\("([^"]+)"\)/g)].map((match) => match[1]);
}

function checkSyntax(filePath) {
  try {
    new vm.Script(readText(filePath), { filename: filePath });
    return null;
  } catch (error) {
    return error.message;
  }
}

function checkPage(name, config) {
  const html = readText(config.html);
  const ids = idsFromHtml(html);
  const scriptRefs = scriptRefsFromHtml(html, config.html);
  const htmlRefs = htmlRefsFromHtml(html);
  const requiredScripts = new Set(config.scripts);

  const missingScriptFiles = scriptRefs.filter((filePath) => !fs.existsSync(path.join(root, filePath)));
  const missingHtmlRefs = htmlRefs.filter((filePath) => !fs.existsSync(path.join(root, filePath)));
  const missingConfiguredScripts = [...requiredScripts].filter((filePath) => !scriptRefs.includes(filePath));
  const syntaxErrors = {};
  const missingIds = [];

  for (const scriptPath of config.scripts) {
    const syntaxError = checkSyntax(scriptPath);
    if (syntaxError) {
      syntaxErrors[scriptPath] = syntaxError;
      continue;
    }

    const source = readText(scriptPath);
    for (const id of jsGetElementIds(source)) {
      if (!ids.has(id)) {
        missingIds.push(`${scriptPath}:${id}`);
      }
    }
  }

  return {
    name,
    missingScriptFiles,
    missingHtmlRefs,
    missingConfiguredScripts,
    missingIds,
    syntaxErrors,
    ok:
      missingScriptFiles.length === 0
      && missingHtmlRefs.length === 0
      && missingConfiguredScripts.length === 0
      && missingIds.length === 0
      && Object.keys(syntaxErrors).length === 0
  };
}

function loadSharedModule() {
  const sandbox = {
    window: {
      localStorage: {
        getItem() {
          return null;
        },
        setItem() {
        },
        removeItem() {
        }
      }
    },
    console
  };
  vm.createContext(sandbox);
  vm.runInContext(readText("viewweb/app.js"), sandbox, { filename: "viewweb/app.js" });
  return sandbox.window.CarbonShared;
}

function checkModuleConfig() {
  const shared = loadSharedModule();
  const menuItems = shared.MENU_GROUPS.flatMap((group) => group.items);
  const moduleIds = Object.keys(shared.MODULES);
  const missingModules = menuItems.filter((id) => !shared.MODULES[id]);
  const duplicateMenuItems = menuItems.filter((id, index) => menuItems.indexOf(id) !== index);
  const orphanModules = moduleIds.filter((id) => !menuItems.includes(id));

  return {
    name: "module-config",
    moduleCount: moduleIds.length,
    menuItemCount: menuItems.length,
    missingModules,
    duplicateMenuItems,
    orphanModules,
    ok:
      moduleIds.length === 12
      && menuItems.length === 12
      && missingModules.length === 0
      && duplicateMenuItems.length === 0
      && orphanModules.length === 0
  };
}

const checks = [
  ...Object.entries(pages).map(([name, config]) => checkPage(name, config)),
  checkModuleConfig()
];
const failed = checks.filter((check) => !check.ok);

for (const check of checks) {
  const marker = check.ok ? "OK" : "FAIL";
  console.log(`[${marker}] ${check.name}`);
  if (!check.ok) {
    console.log(JSON.stringify(check, null, 2));
  }
}

if (failed.length > 0) {
  console.error(`Frontend check failed: ${failed.length} issue group(s).`);
  process.exit(1);
}

console.log(`Frontend check passed: ${checks.length} group(s).`);
