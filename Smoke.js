const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

async function main() {
  const root = __dirname;
  const flowTypes = path.join(root, "dist", "FlowGene.js.flow");
  const clientTypes = path.join(root, "dist", "Client.js.flow");
  const serverTypes = path.join(root, "dist", "Server.js.flow");

  for (const typeFile of [flowTypes, clientTypes, serverTypes]) {
    if (!fs.existsSync(typeFile)) {
      throw new Error(`Missing ${path.relative(root, typeFile)}`);
    }
  }

  const cjs = require(path.join(root, "dist", "FlowGene.js"));
  cjs.createEnvironment({
    fetcher: async () => ({
      data: {
        viewer: {
          id: "1",
          name: "Ada",
        },
      },
    }),
  });
  const cjsQuery = cjs.gql.query`
    query Smoke {
      viewer {
        id
        name
      }
    }
  `;
  const cjsData = await cjsQuery.load();
  if (cjsData.viewer.name !== "Ada") {
    throw new Error("CJS smoke failed");
  }

  const esm = await import(pathToFileURL(path.join(root, "dist", "FlowGene.mjs")).href);
  esm.createEnvironment({
    fetcher: async () => ({
      data: {
        node: {
          id: "2",
        },
      },
    }),
  });
  const esmQuery = esm.gql.query`
    query SmokeESM {
      node {
        id
      }
    }
  `;
  const esmData = await esmQuery.load();
  if (esmData.node.id !== "2") {
    throw new Error("ESM smoke failed");
  }

  const server = await import(pathToFileURL(path.join(root, "dist", "Server.mjs")).href);
  if (typeof server.gql.query !== "function") {
    throw new Error("RSC server entry smoke failed");
  }

  const clientSource = fs.readFileSync(path.join(root, "dist", "Client.mjs"), "utf8");
  if (!clientSource.includes("\"use client\"") || !clientSource.includes("gql")) {
    throw new Error("RSC client entry smoke failed");
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
