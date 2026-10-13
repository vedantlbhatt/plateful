import type { ConfigContext, ExpoConfig } from 'expo/config';

// app.json holds the static config; this only injects the EAS project id,
// which Expo push tokens require (even in Expo Go).
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  extra: {
    ...config.extra,
    eas: { projectId: process.env.EAS_PROJECT_ID || undefined },
  },
});
