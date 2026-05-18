const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");
const test = require("node:test");
const util = require("node:util");
const babel = require("@babel/core");

const root = __dirname;
const srcDir = path.join(root, "src");
const buildDir = path.join(root, ".test-build");

const flowPreset = [
  require.resolve("@babel/preset-flow"),
  {
    all: true,
    experimental_useHermesParser: true,
  },
];

function assertToThrow(actual, expected) {
  assert.equal(typeof actual, "function");

  try {
    actual();
  } catch (error) {
    if (expected == null) {
      return;
    }

    if (typeof expected === "string") {
      assert.ok(String(error && error.message ? error.message : error).includes(expected));
      return;
    }

    if (expected instanceof RegExp) {
      assert.match(String(error && error.message ? error.message : error), expected);
      return;
    }

    assert.deepStrictEqual(error, expected);
    return;
  }

  assert.fail("Expected function to throw");
}

function expect(actual) {
  const matchers = {
    toBe(expected) {
      assert.ok(Object.is(actual, expected), `Expected ${util.inspect(actual)} to be ${util.inspect(expected)}`);
    },
    toEqual(expected) {
      assert.deepStrictEqual(actual, expected);
    },
    toContain(expected) {
      assert.ok(actual.includes(expected));
    },
    toThrow(expected) {
      assertToThrow(actual, expected);
    },
  };

  if (actual && typeof actual.then === "function") {
    matchers.resolves = {
      async toEqual(expected) {
        assert.deepStrictEqual(await actual, expected);
      },
    };
  }

  return matchers;
}

function compileTestSources() {
  fs.rmSync(buildDir, { recursive: true, force: true });
  fs.mkdirSync(buildDir, { recursive: true });

  for (const fileName of fs.readdirSync(srcDir)) {
    if (!fileName.endsWith(".js")) {
      continue;
    }

    const src = path.join(srcDir, fileName);
    const result = babel.transformFileSync(src, {
      babelrc: false,
      comments: true,
      configFile: false,
      filename: src,
      plugins: [
        [
          require.resolve("@babel/plugin-transform-modules-commonjs"),
          { strictMode: false },
        ],
      ],
      presets: [flowPreset],
      sourceType: "module",
    });

    if (result == null || result.code == null) {
      throw new Error(`Failed to compile ${fileName}`);
    }

    fs.writeFileSync(path.join(buildDir, fileName), `${result.code}\n`);
  }
}

async function main() {
  globalThis.expect = expect;
  globalThis.test = test;

  compileTestSources();
  require(path.join(buildDir, "FlowGene.test.js"));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
