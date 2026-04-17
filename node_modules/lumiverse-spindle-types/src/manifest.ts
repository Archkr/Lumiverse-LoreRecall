export interface SpindleManifest {
  /** Semver version string */
  version: string;
  /** Display name */
  name: string;
  /** Global identifier (lowercase, underscores only: /^[a-z][a-z0-9_]*$/) */
  identifier: string;
  /** Extension author */
  author: string;
  /** GitHub repository URL */
  github: string;
  /** Extension homepage URL */
  homepage: string;
  /** Short description */
  description?: string;
  /** Requested permissions (gated capabilities) */
  permissions: SpindlePermission[];
  /** Backend entry point (default: "dist/backend.js") */
  entry_backend?: string;
  /** Frontend entry point (default: "dist/frontend.js") */
  entry_frontend?: string;
  /** Minimum Lumiverse version required */
  minimum_lumiverse_version?: string;
  /** Files/directories to seed into extension storage on install/import/update */
  storage_seed_files?: SpindleStorageSeedFile[];
}

export interface SpindleStorageSeedFile {
  /** Source path relative to extension repo root */
  from: string;
  /** Destination path relative to extension storage root (defaults to `from`) */
  to?: string;
  /** If true, overwrite existing storage content at destination */
  overwrite?: boolean;
  /** If true, fail install/import/update when source path is missing */
  required?: boolean;
}

export type SpindlePermission = import("./permissions").SpindlePermission;

/** Regex for validating extension identifiers */
export const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]*$/;

export function validateIdentifier(id: string): boolean {
  return IDENTIFIER_PATTERN.test(id);
}
