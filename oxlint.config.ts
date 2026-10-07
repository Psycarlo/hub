import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";

export default defineConfig({
  extends: [core, react],
  ignorePatterns: [...core.ignorePatterns, "convex/_generated/**"],
  overrides: [
    {
      // Primitives receive their text and htmlFor through spread props.
      files: ["src/components/ui/**"],
      rules: {
        "jsx-a11y/heading-has-content": "off",
        "jsx-a11y/label-has-associated-control": "off",
      },
    },
    {
      // Convex functions run on the server: no browser or React code there.
      files: ["convex/**"],
      rules: {
        // Mutations run as one transaction; reading and writing in order is
        // the idiomatic way to change several documents.
        "no-await-in-loop": "off",
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: ["@/*", "react", "react-*", "wouter"],
                message:
                  "Convex functions only import convex/ modules and server packages.",
              },
            ],
          },
        ],
      },
    },
  ],
  rules: {
    // Match the function declarations that the shadcn CLI generates.
    "func-style": ["error", "declaration", { allowArrowFunctions: true }],
    "react/function-component-definition": [
      "error",
      { namedComponents: "function-declaration" },
    ],
  },
});
