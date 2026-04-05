import AsyncStorage from "@react-native-async-storage/async-storage";
import API from "./api";

const SETTINGS_KEY = "looksgood.app.settings";

export const DEFAULT_SETTINGS = {
  isPrivateAccount: false,
  showActivityStatus: true,
  allowMessageRequests: true,
};

const normalizeSettings = (value) => ({
  isPrivateAccount: Boolean(value?.isPrivateAccount ?? value?.is_private_account ?? DEFAULT_SETTINGS.isPrivateAccount),
  showActivityStatus: Boolean(value?.showActivityStatus ?? value?.show_activity_status ?? DEFAULT_SETTINGS.showActivityStatus),
  allowMessageRequests: Boolean(value?.allowMessageRequests ?? value?.allow_message_requests ?? DEFAULT_SETTINGS.allowMessageRequests),
});

const toApiPayload = (value) => ({
  is_private_account: Boolean(value?.isPrivateAccount),
  show_activity_status: Boolean(value?.showActivityStatus),
  allow_message_requests: Boolean(value?.allowMessageRequests),
});

export const loadSettings = async () => {
  let local = { ...DEFAULT_SETTINGS };
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (raw) {
      local = normalizeSettings(JSON.parse(raw));
    }
  } catch {
    local = { ...DEFAULT_SETTINGS };
  }

  try {
    const res = await API.get("/social/settings");
    const remote = normalizeSettings(res?.data || {});
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(remote));
    return { ...remote, _serverSynced: true };
  } catch {
    return { ...local, _serverSynced: false };
  }
};

export const saveSettings = async (settings) => {
  const next = normalizeSettings({ ...DEFAULT_SETTINGS, ...(settings || {}) });
  let finalValue = next;
  let synced = false;

  try {
    const res = await API.post("/social/settings", toApiPayload(next));
    const serverValue = normalizeSettings(res?.data?.settings || res?.data || {});
    finalValue = serverValue;
    synced = true;
  } catch {
    synced = false;
  }

  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(finalValue));
  return { ...finalValue, _serverSynced: synced };
};
