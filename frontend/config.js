import { Platform } from 'react-native';
import Constants from 'expo-constants';

const PRODUCTION_BACKEND = 'https://chefasap-backend.onrender.com';

const getBackendIP = () => {
  // Production or tunnel mode — use Render
  if (!__DEV__) return PRODUCTION_BACKEND;

  // Dev mode — use Render too so it works for everyone
  // Switch to local IP below only if you need to test local backend changes
  return PRODUCTION_BACKEND;

  // ── Local dev fallback (uncomment if testing local backend) ──
  // const debuggerHost = Constants.expoConfig?.hostUri;
  // if (debuggerHost) return `http://${debuggerHost.split(':')[0]}:3000`;
  // if (Platform.OS === 'android') return 'http://10.0.2.2:3000';
  // return 'http://localhost:3000';
};

const getEnvVars = () => ({
  apiUrl: getBackendIP(),
});

export default getEnvVars;