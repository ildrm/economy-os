import { spawn, spawnSync } from "node:child_process";
import { constants, copyFileSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const windows = process.platform === "win32";
const children = new Set();
let stopping = false;
let shutdownTimer;

function command(name, args, capture = false) {
  // Only fixed commands/arguments are passed here. Windows Corepack is a .cmd shim.
  const result = spawnSync(name, args, {
    cwd: root,
    env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" },
    shell: windows,
    stdio: capture ? "pipe" : "inherit",
    encoding: "utf8",
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${name} ${args.join(" ")} failed. Check the requirements and output above.`);
  }
  return result.stdout?.trim();
}

function pnpm(...args) {
  command("corepack", ["pnpm", ...args]);
}

function stopChild(child, force = false) {
  if (!child.pid) return;
  if (windows) {
    // Target only this launcher's child tree, never unrelated Node processes.
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-child.pid, force ? "SIGKILL" : "SIGTERM");
    } catch (error) {
      if (error.code !== "ESRCH") console.error(`Could not stop child process: ${error.message}`);
    }
  }
}

function shutdown(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) stopChild(child);
  shutdownTimer = setTimeout(() => {
    for (const child of children) stopChild(child, true);
  }, 5_000);
  shutdownTimer.unref();
}

function serve(label, entry, args, cwd, env) {
  const child = spawn(process.execPath, [entry, ...args], {
    cwd,
    env,
    stdio: "inherit",
    detached: !windows,
  });
  children.add(child);
  child.once("error", (error) => {
    console.error(`${label} could not start: ${error.message}`);
    shutdown(1);
  });
  child.once("close", (code) => {
    children.delete(child);
    if (!stopping) {
      console.error(`${label} stopped. Shutting down the local application.`);
      shutdown(code || 1);
    }
    if (children.size === 0) clearTimeout(shutdownTimer);
  });
}

async function checkPort(port) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", () =>
      reject(
        new Error(
          `Port ${port} is unavailable. Stop its listener or choose another web port with --port NUMBER.`,
        ),
      ),
    );
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  });
}

async function main() {
  let full = false;
  let port = 3000;
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--help" || args[index] === "-h") {
      console.log(`EconomyOS local launcher

Windows: run.bat [--full] [--port NUMBER]
Linux:   ./run.sh [--full] [--port NUMBER]

Default: install locked dependencies, build shared packages, start the public web app.
--full:  also start Docker PostgreSQL/S3Mock, prepare the local database, and run the API.
--port:  web port (default 3000); the API uses 4000 in --full mode.

Requires Node.js ${manifest.engines.node} and Corepack ${manifest.config.releaseToolchain.corepack}.
Install Corepack: npm install --global corepack@${manifest.config.releaseToolchain.corepack} --ignore-scripts
Full mode also requires a running Docker engine with Compose v2.
Press Ctrl+C to stop the application. Docker services and data are retained.
`);
      return;
    }
    if (args[index] === "--full") full = true;
    else if (args[index] === "--port" && /^\d+$/.test(args[index + 1] ?? "")) {
      port = Number(args[++index]);
    } else throw new Error(`Unknown or incomplete option: ${args[index]}. Use --help.`);
  }
  if (port < 1024 || port > 65535 || (full && port === 4000)) {
    throw new Error(
      "Choose a web port between 1024 and 65535, excluding API port 4000 in --full mode.",
    );
  }
  if (process.versions.node !== manifest.engines.node) {
    throw new Error(
      `This checkout requires Node.js ${manifest.engines.node}; found ${process.versions.node}. Install the pinned version and try again.`,
    );
  }
  if (process.env.NODE_ENV && process.env.NODE_ENV !== "development") {
    throw new Error(
      "This launcher is for local development. Unset NODE_ENV or set it to development.",
    );
  }
  const corepackVersion = manifest.config.releaseToolchain.corepack;
  try {
    if (command("corepack", ["--version"], true) !== corepackVersion)
      throw new Error("Version mismatch");
  } catch {
    throw new Error(
      `Install the required Corepack version, then run again: npm install --global corepack@${corepackVersion} --ignore-scripts`,
    );
  }
  await checkPort(port);
  if (full) {
    await checkPort(4000);
    command("docker", ["compose", "version"]);
    command("docker", ["info"], true);
  }

  console.log("\nInstalling dependencies from pnpm-lock.yaml...");
  pnpm("install", "--frozen-lockfile", "--prod=false");
  console.log("\nBuilding shared packages...");
  pnpm("--filter", "./packages/**", "build");

  if (full) {
    try {
      copyFileSync(join(root, ".env.example"), join(root, ".env"), constants.COPYFILE_EXCL);
      console.log("Created .env from the local example.");
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      console.log("Using your existing .env.");
    }
    console.log("\nStarting local database/storage and applying local migrations...");
    command("docker", ["compose", "up", "--detach", "--wait", "postgres", "s3mock"]);
    pnpm("db:setup:local");
    pnpm("--filter", "@economyos/api", "build");
    console.log("API docs: http://127.0.0.1:4000/api/docs");
    console.log(
      "Protected browser reports still require configured identity, membership and a same-origin gateway.",
    );
    console.log(
      "Ingestion requires a separately configured Temporal worker; this launcher does not seed data.",
    );
    console.log(
      "Docker services remain available after exit. Stop them with: docker compose stop postgres s3mock",
    );
  }

  console.log(`\nStarting EconomyOS at http://127.0.0.1:${port}/en`);
  console.log(`Persian: http://127.0.0.1:${port}/fa`);
  console.log("Wait for the web server's Ready message. Press Ctrl+C to stop.\n");
  process.once("SIGINT", () => shutdown(130));
  process.once("SIGTERM", () => shutdown(143));
  const env = { ...process.env, NODE_ENV: "development" };
  const webDirectory = join(root, "apps/web");
  const requireWeb = createRequire(join(webDirectory, "package.json"));
  const next = requireWeb.resolve("next/dist/bin/next");
  if (full) {
    serve("API", join(root, "apps/api/dist/main.js"), [], root, {
      ...env,
      HOST: "127.0.0.1",
      PORT: "4000",
    });
  }
  serve("Web", next, ["dev", "--hostname", "127.0.0.1", "--port", String(port)], webDirectory, env);
}

main().catch((error) => {
  console.error(`\nEconomyOS could not start: ${error.message}`);
  shutdown(1);
});
