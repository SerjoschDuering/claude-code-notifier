// Shared type definitions for PWA

/**
 * Type extension for iOS Safari standalone detection
 * Safari adds a non-standard 'standalone' property to Navigator
 */
export interface NavigatorStandalone extends Navigator {
  standalone?: boolean;
}
