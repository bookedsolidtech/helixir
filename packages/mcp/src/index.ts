/**
 * @helixui/mcp — Standalone SDK for building custom MCP tools on top of
 * helixir's web component analysis engine.
 *
 * This package re-exports helixir's core engine modules so enterprise teams
 * can build their own MCP (Model Context Protocol) tools without coupling to
 * helixir's server internals:
 *
 * - **CEM Reader**: Parse and query Custom Elements Manifest files, extract
 *   component metadata, validate documentation completeness, and list all
 *   components, events, slots, and CSS parts.
 *
 * - **Token Parser**: Parse W3C DTCG-format design token files, query tokens
 *   by name, and discover which components use a given token.
 *
 * - **Template Engine**: Generate framework-specific usage snippets (React,
 *   Vue, Svelte, Angular, plain HTML) and package import statements for any
 *   component.
 *
 * - **Config**: Load and merge helixir configuration from environment variables
 *   and config files.
 *
 * - **Error Utilities**: Structured error handling primitives for MCP tool
 *   implementations.
 *
 * @example
 * ```typescript
 * import { parseCem, listAllComponents, parseTokens } from '@helixui/mcp';
 * import { readFileSync } from 'fs';
 *
 * // Read and parse a Custom Elements Manifest
 * const raw = JSON.parse(readFileSync('custom-elements.json', 'utf-8'));
 * const components = listAllComponents(raw);
 * console.log('Components:', components);
 *
 * // Get metadata for a specific component
 * const metadata = parseCem('my-button', raw);
 * console.log('Attributes:', metadata.attributes);
 *
 * // Parse design tokens
 * const tokens = await parseTokens('./tokens.json');
 * console.log('Tokens:', tokens.length);
 * ```
 *
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// CEM Reader — Custom Elements Manifest parsing and querying
// ---------------------------------------------------------------------------

/**
 * Zod schema for validating a Custom Elements Manifest (CEM) v1 document.
 * Use this to parse and validate raw JSON before passing it to other CEM APIs.
 *
 * @example
 * ```typescript
 * import { CemSchema } from '@helixui/mcp';
 * import { readFileSync } from 'fs';
 *
 * const raw = JSON.parse(readFileSync('custom-elements.json', 'utf-8'));
 * const cem = CemSchema.parse(raw); // throws ZodError if invalid
 * ```
 */
export { CemSchema } from 'helixir/core';

/**
 * Parsed representation of a Custom Elements Manifest document.
 * All component declarations, events, slots, CSS parts, and CSS custom
 * properties are stored under the top-level `modules` array.
 */
export type { Cem } from 'helixir/core';

/**
 * A single component declaration extracted from a CEM module.
 * Contains the component's attributes, properties, events, slots, CSS parts,
 * CSS custom properties, and inheritance information.
 */
export type { CemDeclaration } from 'helixir/core';

/**
 * A member (attribute or property) of a CEM component declaration.
 */
export type { CemMember } from 'helixir/core';

/**
 * A custom event declared by a CEM component.
 */
export type { CemEvent } from 'helixir/core';

/**
 * A slot declared by a CEM component.
 */
export type { CemSlot } from 'helixir/core';

/**
 * A CSS shadow part (`::part`) declared by a CEM component.
 */
export type { CemCssPart } from 'helixir/core';

/**
 * A JSDoc tag found in a CEM component's description.
 */
export type { CemJsdocTag } from 'helixir/core';

/**
 * Superclass reference within a CEM component declaration.
 */
export type { CemSuperclass } from 'helixir/core';

/**
 * A mixin declaration in the CEM.
 */
export type { CemMixin } from 'helixir/core';

/**
 * A reference indicating that a member was inherited from another class.
 */
export type { CemInheritedFrom } from 'helixir/core';

/**
 * Extracted metadata for a single component, including its normalized
 * attributes, properties, events, slots, CSS parts, and CSS custom properties.
 * Returned by `parseCem`.
 */
export type { ComponentMetadata } from 'helixir/core';

/**
 * Result of a documentation completeness check for a component.
 * Contains a score and a list of missing fields.
 */
export type { CompletenessResult } from 'helixir/core';

/**
 * Result of comparing two CEM versions to find API differences.
 * Contains lists of added, removed, and changed declarations.
 */
export type { DiffResult } from 'helixir/core';

/**
 * A single entry in a component's inheritance chain.
 */
export type { InheritanceEntry } from 'helixir/core';

/**
 * A row describing a custom event across all components in a CEM.
 */
export type { EventRow } from 'helixir/core';

/**
 * A row describing a slot across all components in a CEM.
 */
export type { SlotRow } from 'helixir/core';

/**
 * A row describing a CSS shadow part across all components in a CEM.
 */
export type { CssPartRow } from 'helixir/core';

/**
 * A CEM document bundled with its origin package identifier.
 * Used when merging multiple CEM packages via `mergeCems`.
 */
export type { PackagedCem } from 'helixir/core';

/**
 * An entry in the in-memory CEM library store.
 */
export type { CemStoreEntry } from 'helixir/core';

/**
 * Indicates the source from which a CEM was loaded.
 * - `'config'` — loaded from a local config path
 * - `'local'` — discovered automatically on the filesystem
 * - `'cdn'` — fetched from a CDN URL
 */
export type { CemSourceType } from 'helixir/core';

/**
 * Extracts all relevant metadata for a component identified by its custom
 * element tag name from a parsed CEM document.
 *
 * @param tagName - The custom element tag name (e.g. `'my-button'`).
 * @param cem - The parsed CEM document to search.
 * @returns Normalized `ComponentMetadata` for the component.
 * @throws `MCPError` if no component with the given tag name is found.
 *
 * @example
 * ```typescript
 * const metadata = parseCem('my-button', cem);
 * console.log(metadata.attributes);
 * console.log(metadata.events);
 * ```
 */
export { parseCem } from 'helixir/core';

/**
 * Validates how completely a component's CEM entry is documented.
 * Returns a score (0–100) and a list of missing documentation fields.
 *
 * @param tagName - The custom element tag name to check.
 * @param cem - The parsed CEM document.
 * @returns A `CompletenessResult` with a `score` and `missing` list.
 */
export { validateCompleteness } from 'helixir/core';

/**
 * Returns the source file path of a component's declaration as recorded in
 * the CEM's module metadata.
 *
 * @param cem - The parsed CEM document.
 * @param tagName - The custom element tag name.
 * @returns The relative file path, or `null` if not found.
 */
export { getDeclarationSourcePath } from 'helixir/core';

/**
 * Resolves the full inheritance chain for a component declaration by following
 * its `superclass` references.
 *
 * @param decl - A `CemDeclaration` to resolve.
 * @returns An ordered array of `InheritanceEntry` objects from closest ancestor
 *   to furthest.
 */
export { getInheritanceChain } from 'helixir/core';

/**
 * Lists all custom events from the CEM, optionally filtered to a specific
 * component tag name.
 *
 * @param cem - The parsed CEM document.
 * @param tagName - Optional tag name to filter results.
 * @returns An array of `EventRow` objects.
 */
export { listAllEvents } from 'helixir/core';

/**
 * Lists all slots from the CEM, optionally filtered to a specific component
 * tag name.
 *
 * @param cem - The parsed CEM document.
 * @param tagName - Optional tag name to filter results.
 * @returns An array of `SlotRow` objects.
 */
export { listAllSlots } from 'helixir/core';

/**
 * Lists all CSS shadow parts from the CEM, optionally filtered to a specific
 * component tag name.
 *
 * @param cem - The parsed CEM document.
 * @param tagName - Optional tag name to filter results.
 * @returns An array of `CssPartRow` objects.
 */
export { listAllCssParts } from 'helixir/core';

/**
 * Returns all custom element tag names defined in the CEM.
 *
 * @param cem - The parsed CEM document.
 * @returns An array of tag name strings.
 *
 * @example
 * ```typescript
 * const tags = listAllComponents(cem);
 * // ['my-button', 'my-input', 'my-dialog']
 * ```
 */
export { listAllComponents } from 'helixir/core';

/**
 * Compares two versions of a CEM (e.g. current vs. a git ref) and returns a
 * structured diff showing added, removed, and changed declarations.
 *
 * @param config - helixir configuration for resolving the CEM path.
 * @param ref - The git reference to compare against (e.g. `'HEAD~1'`, `'main'`).
 * @returns A promise resolving to a `DiffResult`.
 */
export { diffCem } from 'helixir/core';

/**
 * Merges multiple CEM packages into a single unified CEM document.
 * Useful when working with multi-package design systems.
 *
 * @param packages - An array of `PackagedCem` entries to merge.
 * @returns A merged `Cem` document containing all declarations.
 */
export { mergeCems } from 'helixir/core';

/**
 * Loads a CEM from the filesystem path specified in the config and registers
 * it in the in-memory library store under the given `libraryId`.
 *
 * @param config - helixir configuration.
 * @param libraryId - A string key to identify this library in the store.
 * @returns A promise that resolves to the loaded `Cem`.
 */
export { loadLibrary } from 'helixir/core';

/**
 * Retrieves a previously loaded CEM from the in-memory store by its library
 * ID. Returns `undefined` if no library with that ID has been loaded.
 *
 * @param libraryId - The library ID used when calling `loadLibrary`.
 * @returns The stored `Cem`, or `undefined`.
 */
export { getLibrary } from 'helixir/core';

/**
 * Lists all libraries currently loaded in the in-memory CEM store.
 *
 * @returns An array of objects with `libraryId` and `tagCount` fields.
 */
export { listLibraries } from 'helixir/core';

/**
 * Removes a library from the in-memory CEM store.
 *
 * @param libraryId - The library ID to remove.
 * @returns `true` if the library was found and removed, `false` otherwise.
 */
export { removeLibrary } from 'helixir/core';

/**
 * Clears all libraries from the in-memory CEM store.
 */
export { clearCemStore } from 'helixir/core';

/**
 * Returns a merged CEM combining the local CEM with any CDN-loaded CEMs
 * registered in the store.
 *
 * @param localCem - The local `Cem` to merge with CDN CEMs.
 * @returns A merged `Cem` document.
 */
export { getMergedCem } from 'helixir/core';

// ---------------------------------------------------------------------------
// Token Parser — Design token parsing and querying
// ---------------------------------------------------------------------------

/**
 * A single design token entry parsed from a W3C DTCG-format tokens file.
 */
export type { DesignToken } from 'helixir/core';

/**
 * An entry describing a component that uses a specific design token.
 */
export type { TokenUsageEntry } from 'helixir/core';

/**
 * Result of finding all components that reference a specific design token.
 */
export type { FindComponentsUsingTokenResult } from 'helixir/core';

/**
 * Parses a W3C DTCG-format (`tokens.json`) design token file and returns a
 * flat array of all tokens with their names, values, categories, and
 * descriptions.
 *
 * @param filePath - Absolute or relative path to the token file.
 * @returns A promise resolving to an array of `DesignToken` objects.
 * @throws `MCPError` if the file is missing, unreadable, or not valid DTCG JSON.
 *
 * @example
 * ```typescript
 * const tokens = await parseTokens('./tokens/tokens.json');
 * const colorTokens = tokens.filter(t => t.category === 'color');
 * ```
 */
export { parseTokens } from 'helixir/core';

/**
 * Reads and returns all design tokens configured in the helixir config, or
 * an empty array if no `tokensPath` is configured.
 *
 * @param config - helixir configuration with an optional `tokensPath`.
 * @returns A promise resolving to an array of `DesignToken` objects.
 */
export { getDesignTokens } from 'helixir/core';

/**
 * Searches the design token file for tokens whose name, value, or description
 * matches the given query string.
 *
 * @param config - helixir configuration.
 * @param query - A search string to match against token names, values, and
 *   descriptions.
 * @returns A promise resolving to matching `DesignToken` objects.
 */
export { findToken } from 'helixir/core';

/**
 * Searches the CEM for all components that reference a given CSS custom
 * property token name in their `cssProperties` entries.
 *
 * @param cem - The parsed CEM document.
 * @param tokenName - The CSS custom property name to search for (e.g.
 *   `'--color-primary'`).
 * @returns A `FindComponentsUsingTokenResult` listing all matching components.
 */
export { findComponentsUsingToken } from 'helixir/core';

// ---------------------------------------------------------------------------
// Template Engine — Framework-specific code generation
// ---------------------------------------------------------------------------

/**
 * A frontend framework identifier used when generating usage snippets.
 * - `'react'` — JSX snippet with React event binding patterns
 * - `'vue'` — Vue 3 template with `@event` syntax
 * - `'svelte'` — Svelte template with `on:event` syntax
 * - `'angular'` — Angular template with `(event)` syntax
 * - `'html'` — Plain HTML with `addEventListener` script
 */
export type { FrontendFramework } from 'helixir/core';

/**
 * A CSS custom property included in a usage suggestion's styling section.
 */
export type { SuggestUsageStylingProperty } from 'helixir/core';

/**
 * A CSS `::part()` selector included in a usage suggestion's styling section.
 */
export type { SuggestUsageStylingPart } from 'helixir/core';

/**
 * Combined styling information (tokens and parts) returned with a usage
 * suggestion.
 */
export type { SuggestUsageStyling } from 'helixir/core';

/**
 * The complete result of a `suggestUsage` call, including the code snippet,
 * framework-specific notes, event listener examples, and styling guidance.
 */
export type { SuggestUsageResult } from 'helixir/core';

/**
 * The result of a `generateImport` call, including the import statement and
 * any relevant CDN script tags.
 */
export type { GenerateImportResult } from 'helixir/core';

/**
 * Generates a ready-to-paste code snippet for using a component in a given
 * frontend framework, including all attributes, slots, events, and styling
 * guidance.
 *
 * @param config - helixir configuration.
 * @param tagName - The custom element tag name to generate a snippet for.
 * @param framework - Target framework. Defaults to auto-detecting from the
 *   project's `package.json`.
 * @returns A promise resolving to a `SuggestUsageResult`.
 *
 * @example
 * ```typescript
 * const result = await suggestUsage(config, 'my-button', 'react');
 * console.log(result.snippet);
 * // function MyComponent() {
 * //   return <my-button variant="primary">Click me</my-button>;
 * // }
 * ```
 */
export { suggestUsage } from 'helixir/core';

/**
 * Generates an import statement for a component, supporting npm package
 * imports and CDN `<script>` tags.
 *
 * @param config - helixir configuration (including optional `cdnBase`).
 * @param tagName - The custom element tag name to generate an import for.
 * @returns A promise resolving to a `GenerateImportResult`.
 */
export { generateImport } from 'helixir/core';

// ---------------------------------------------------------------------------
// Config — Configuration management
// ---------------------------------------------------------------------------

/**
 * The complete helixir configuration object. Loaded from environment
 * variables, `helixir.mcp.json`, or defaults.
 *
 * Key fields:
 * - `cemPath` — Path to `custom-elements.json` (auto-discovered if omitted)
 * - `projectRoot` — Root directory of the component library
 * - `componentPrefix` — Expected tag name prefix (e.g. `'hx-'`)
 * - `tokensPath` — Path to a W3C DTCG design token file
 * - `cdnBase` — CDN base URL for component imports
 */
export type { McpWcConfig } from 'helixir/core';

/**
 * Loads the helixir configuration by merging environment variables,
 * `helixir.mcp.json` (or the legacy `mcpwc.config.json`), and built-in
 * defaults. Environment variables take highest priority.
 *
 * Environment variables:
 * - `MCP_WC_PROJECT_ROOT` — Override `projectRoot`
 * - `MCP_WC_CEM_PATH` — Override `cemPath`
 * - `MCP_WC_COMPONENT_PREFIX` — Override `componentPrefix`
 * - `MCP_WC_TOKENS_PATH` — Override `tokensPath`
 * - `MCP_WC_CDN_BASE` — Override `cdnBase`
 *
 * @returns The resolved `McpWcConfig`.
 *
 * @example
 * ```typescript
 * import { loadConfig } from '@helixui/mcp';
 *
 * const config = loadConfig();
 * console.log(config.cemPath);    // e.g. 'custom-elements.json'
 * console.log(config.projectRoot); // e.g. '/home/user/my-lib'
 * ```
 */
export { loadConfig } from 'helixir/core';

// ---------------------------------------------------------------------------
// Error Utilities — Structured error handling for MCP tool implementations
// ---------------------------------------------------------------------------

/**
 * Category enum for classifying `MCPError` instances. Use these categories
 * when creating or catching errors in custom MCP tool implementations to
 * provide consistent error responses.
 *
 * @example
 * ```typescript
 * import { MCPError, ErrorCategory } from '@helixui/mcp';
 *
 * throw new MCPError('Component not found', ErrorCategory.NOT_FOUND);
 * ```
 */
export { ErrorCategory } from 'helixir/core';

/**
 * Structured error class for MCP tool implementations. Extends `Error` with
 * an `ErrorCategory` to allow consumers to handle errors by type.
 *
 * @example
 * ```typescript
 * try {
 *   const meta = parseCem('unknown-tag', cem);
 * } catch (err) {
 *   if (err instanceof MCPError) {
 *     console.error(err.category, err.message);
 *   }
 * }
 * ```
 */
export { MCPError } from 'helixir/core';

/**
 * Converts any caught error into a structured `MCPError`. Useful in MCP tool
 * `catch` blocks to ensure all errors returned to the LLM are categorized.
 *
 * @param error - Any caught value (`unknown`).
 * @returns An `MCPError` instance. If the input is already an `MCPError`, it
 *   is returned unchanged. Otherwise, an `INTERNAL` category error is created.
 *
 * @example
 * ```typescript
 * import { handleToolError } from '@helixui/mcp';
 *
 * try {
 *   await riskyOperation();
 * } catch (err) {
 *   const mcpErr = handleToolError(err);
 *   return createErrorResponse(mcpErr.message);
 * }
 * ```
 */
export { handleToolError } from 'helixir/core';
