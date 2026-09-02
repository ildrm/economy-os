import assert from "node:assert/strict";
import {
  evaluateLicenseExpression,
  isTargetCompatible,
  parsePnpmOptionalEdges,
  parsePnpmTargetConstraints,
  resolveLicenseDeclaration,
  verifyProductionLicenses,
} from "./verify-production-licenses.mjs";
import { findMarkdownFindings, findSecretFindings } from "./verify-repository.mjs";

const expressionCases = [
  { name: "MIT", expression: "MIT", allowed: true },
  { name: "attribution-only Creative Commons", expression: "CC-BY-4.0", allowed: true },
  { name: "reviewed weak copyleft runtime", expression: "LGPL-3.0-or-later", allowed: true },
  {
    name: "nested reviewed SPDX expression",
    expression: "(MIT OR Apache-2.0) AND BSD-3-Clause",
    allowed: true,
  },
  {
    name: "reviewed SPDX exception",
    expression: "Apache-2.0 WITH LLVM-exception",
    allowed: true,
  },
  { name: "Elastic", expression: "Elastic-2.0", allowed: false },
  {
    name: "PolyForm noncommercial",
    expression: "PolyForm-Noncommercial-1.0.0",
    allowed: false,
  },
  { name: "Creative Commons noncommercial", expression: "CC-BY-NC-4.0", allowed: false },
  { name: "LicenseRef", expression: "LicenseRef-Proprietary", allowed: false },
  { name: "proprietary label", expression: "Proprietary", allowed: false },
  { name: "unknown identifier", expression: "Made-Up-License-1.0", allowed: false },
  { name: "copyleft identifier", expression: "GPL-3.0-only", allowed: false },
  {
    name: "unknown alternative remains fail-closed",
    expression: "MIT OR Proprietary",
    allowed: false,
  },
  { name: "unsupported plus syntax", expression: "MIT+", allowed: false },
  { name: "unbalanced expression", expression: "(MIT OR Apache-2.0", allowed: false },
];

for (const testCase of expressionCases) {
  assert.equal(
    evaluateLicenseExpression(testCase.expression).allowed,
    testCase.allowed,
    testCase.name,
  );
}

const referencedLicenseCases = [
  {
    name: "single SPDX declaration",
    declared: "SEE LICENSE IN LICENSE.txt",
    text: "Project license\nSPDX-License-Identifier: MIT\n",
    expression: "MIT",
  },
  {
    name: "proprietary SPDX declaration is returned for fail-closed evaluation",
    declared: "SEE LICENSE IN LICENSE.txt",
    text: "SPDX-License-Identifier: LicenseRef-Proprietary\n",
    expression: "LicenseRef-Proprietary",
  },
  {
    name: "license prose without an SPDX declaration",
    declared: "SEE LICENSE IN LICENSE.txt",
    text: "Permission is granted subject to private commercial terms.",
    expression: undefined,
  },
  {
    name: "ambiguous multiple SPDX declarations",
    declared: "SEE LICENSE IN LICENSE.txt",
    text: "SPDX-License-Identifier: MIT\nSPDX-License-Identifier: Apache-2.0\n",
    expression: undefined,
  },
];

for (const testCase of referencedLicenseCases) {
  let referencedTarget;
  const resolved = resolveLicenseDeclaration(testCase.declared, (target) => {
    referencedTarget = target;
    return testCase.text;
  });
  assert.equal(referencedTarget, "LICENSE.txt", `${testCase.name}: referenced target`);
  assert.equal(resolved.expression, testCase.expression, testCase.name);
}

const missingReference = resolveLicenseDeclaration("SEE LICENSE IN LICENSE", () => {
  throw new Error("not found");
});
assert.equal(missingReference.expression, undefined, "missing referenced license fails closed");

const sampleLockfile = `lockfileVersion: '9.0'

packages:

  foo@1.0.0:
    os: [linux]
    cpu: [x64, arm64]

  'bar@2.0.0':
    os: ['!darwin']
    libc: [glibc]

snapshots:

  foo@1.0.0:
    optionalDependencies:
      bar: 2.0.0
`;
const constraints = parsePnpmTargetConstraints(sampleLockfile);
assert.deepEqual(constraints.get("foo@1.0.0"), {
  os: ["linux"],
  cpu: ["x64", "arm64"],
});
assert.equal(
  isTargetCompatible(constraints.get("foo@1.0.0"), {
    platform: "linux",
    arch: "arm64",
    libc: "glibc",
  }),
  true,
  "matching package target",
);
assert.equal(
  isTargetCompatible(constraints.get("foo@1.0.0"), {
    platform: "darwin",
    arch: "arm64",
  }),
  false,
  "mismatching package target",
);
assert.equal(
  isTargetCompatible(constraints.get("bar@2.0.0"), {
    platform: "darwin",
    arch: "arm64",
  }),
  false,
  "negated package target",
);
assert.deepEqual(
  [...(parsePnpmOptionalEdges(sampleLockfile).get("foo@1.0.0") ?? [])],
  ["bar"],
  "optional dependency edges are recovered from the lockfile",
);

const missingPackagePath = "/policy-test/node_modules/.pnpm/foo@1.0.0/node_modules/foo";
const graphCases = [
  {
    name: "optional incompatible missing graph node is skippable",
    roots: [
      {
        optionalDependencies: {
          foo: { name: "foo", version: "1.0.0", path: missingPackagePath },
        },
      },
    ],
    failureCount: 0,
    skippedCount: 1,
  },
  {
    name: "required incompatible missing graph node fails",
    roots: [
      {
        dependencies: {
          foo: { name: "foo", version: "1.0.0", path: missingPackagePath },
        },
      },
    ],
    failureCount: 1,
    skippedCount: 0,
  },
  {
    name: "optional compatible missing graph node fails",
    roots: [
      {
        optionalDependencies: {
          foo: { name: "foo", version: "1.0.0", path: missingPackagePath },
        },
      },
    ],
    target: { platform: "linux", arch: "x64", libc: "glibc" },
    failureCount: 1,
    skippedCount: 0,
  },
  {
    name: "optional missing graph node without constraints fails",
    roots: [
      {
        optionalDependencies: {
          unknown: {
            name: "unknown",
            version: "1.0.0",
            path: "/policy-test/node_modules/.pnpm/unknown@1.0.0/node_modules/unknown",
          },
        },
      },
    ],
    failureCount: 1,
    skippedCount: 0,
  },
];

for (const testCase of graphCases) {
  const result = verifyProductionLicenses({
    roots: testCase.roots,
    lockfile: sampleLockfile,
    target: testCase.target ?? { platform: "darwin", arch: "arm64" },
  });
  assert.equal(result.failures.length, testCase.failureCount, `${testCase.name}: failures`);
  assert.equal(
    result.skippedIncompatibleOptionalPackages,
    testCase.skippedCount,
    `${testCase.name}: skipped`,
  );
}

const assemble = (...parts) => parts.join("");
const secretCases = [
  { name: "encrypted private key", value: assemble("-----BEGIN ", "ENCRYPTED PRIVATE KEY-----") },
  { name: "DSA private key", value: assemble("-----BEGIN ", "DSA PRIVATE KEY-----") },
  {
    name: "GitHub fine-grained token",
    value: assemble("github_", "pat_", "A".repeat(40)),
  },
  { name: "npm token", value: assemble("npm", "_", "A".repeat(36)) },
  { name: "Stripe live secret", value: assemble("sk_", "live_", "A".repeat(24)) },
  { name: "Google API key", value: assemble("AI", "za", "A".repeat(35)) },
];

for (const testCase of secretCases) {
  assert.equal(findSecretFindings("fixture.txt", testCase.value).length, 1, testCase.name);
}

const secretNearMisses = [
  assemble("github_", "pat_short"),
  assemble("npm", "_short"),
  assemble("sk_", "test_", "A".repeat(24)),
  assemble("AI", "za", "A".repeat(34)),
  assemble("-----BEGIN ", "PUBLIC KEY-----"),
];
for (const value of secretNearMisses) {
  assert.equal(findSecretFindings("fixture.txt", value).length, 0, `near miss: ${value}`);
}

const existingTargets = new Set(["docs/guide.md", "docs/architecture.md", "assets/logo.svg"]);
const targetExists = (absolutePath) =>
  [...existingTargets].some((target) => absolutePath.endsWith(`/${target}`));
const markdownCases = [
  { name: "inline local link", markdown: "[Guide](docs/guide.md)", findings: 0 },
  {
    name: "inline local link with title",
    markdown: '[Guide](docs/guide.md "Guide")',
    findings: 0,
  },
  { name: "missing inline target", markdown: "[Guide](docs/missing.md)", findings: 1 },
  {
    name: "full reference link",
    markdown: '[Architecture][arch]\n\n[arch]: docs/architecture.md "Architecture"',
    findings: 0,
  },
  {
    name: "collapsed reference link",
    markdown: "[Guide][]\n\n[Guide]: docs/guide.md",
    findings: 0,
  },
  {
    name: "missing reference target",
    markdown: "[Guide][guide]\n\n[guide]: docs/missing.md",
    findings: 1,
  },
  { name: "missing reference definition", markdown: "[Guide][absent]", findings: 1 },
  {
    name: "reference in fenced code is ignored",
    markdown: "```md\n[Guide][absent]\n```",
    findings: 0,
  },
  {
    name: "link in inline code is ignored",
    markdown: "`[Guide](docs/missing.md)`",
    findings: 0,
  },
  {
    name: "link in HTML comment is ignored",
    markdown: "<!-- [Guide](docs/missing.md) -->",
    findings: 0,
  },
  {
    name: "external and anchor links",
    markdown: "[Web](https://example.com) [Section](#section)",
    findings: 0,
  },
  {
    name: "reference image",
    markdown: "![Logo][logo]\n\n[logo]: assets/logo.svg",
    findings: 0,
  },
  { name: "malformed encoded link", markdown: "[Bad](docs/%ZZ.md)", findings: 1 },
];

for (const testCase of markdownCases) {
  assert.equal(
    findMarkdownFindings("README.md", testCase.markdown, targetExists).length,
    testCase.findings,
    testCase.name,
  );
}

process.stdout.write(
  `Policy self-tests passed (${expressionCases.length + referencedLicenseCases.length + graphCases.length + secretCases.length + secretNearMisses.length + markdownCases.length + 6} table-driven assertions).\n`,
);
