import { Platform } from 'react-native';
import Constants from 'expo-constants';

const NGROK_BACKEND_URL = 'https://nonflyable-debrah-feathered.ngrok-free.dev';

const getBackendIP = () => {
  // Use ngrok tunnel — works for anyone anywhere
  if (NGROK_BACKEND_URL) return NGROK_BACKEND_URL;

  // Local dev fallback (same WiFi only)
  const debuggerHost = Constants.expoConfig?.hostUri ||
                       Constants.manifest2?.extra?.expoGo?.debuggerHost ||
                       Constants.manifest?.debuggerHost;

  if (debuggerHost) {
    const host = debuggerHost.split(':')[0];
    return `http://${host}:3000`;
  }

  if (Platform.OS === 'android') return 'http://10.0.2.2:3000';
  return 'http://localhost:3000';
};

const getEnvVars = () => ({
  apiUrl: getBackendIP(),
});

export default getEnvVars;