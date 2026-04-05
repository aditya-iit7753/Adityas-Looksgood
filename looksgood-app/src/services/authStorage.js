import AsyncStorage from "@react-native-async-storage/async-storage";

const AUTH_TOKEN_KEY = "looksgood.auth.token";
const DEVICE_ID_KEY = "looksgood.device.id";

export const saveToken = async (token) => {
  if (!token) return;
  await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
};

export const loadToken = async () => {
  return AsyncStorage.getItem(AUTH_TOKEN_KEY);
};

export const clearToken = async () => {
  await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
};

export const getOrCreateDeviceId = async () => {
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const seed = Math.random().toString(36).slice(2, 10);
  const stamp = Date.now().toString(36);
  const id = `dev_${stamp}_${seed}`;
  await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  return id;
};
