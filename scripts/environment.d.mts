// Types for environment.mjs, which the apps' Vite configs import.

import type { Plugin } from 'vite';

export type EnvironmentName = 'production' | 'dev';

export declare const ENVIRONMENTS: Record<EnvironmentName, { projectId: string }>;
export declare const MARKER_FILE: string;
export declare function taskmintEnvironment(env?: Record<string, string | undefined>): EnvironmentName;
export declare function environmentMarker(name: EnvironmentName): { environment: EnvironmentName; projectId: string };
export declare function readEnvironmentMarker(path: string): { environment: EnvironmentName; projectId: string };
export declare function taskmintEnvironmentPlugin(env?: Record<string, string | undefined>): Plugin;
