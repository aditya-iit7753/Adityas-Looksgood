import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const HANDS_FREE_KEY = "looksgood.app.agent.handsfree.v1";

const AgentContext = createContext(null);

export function AgentProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [handsFreeEnabled, setHandsFreeEnabledState] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const raw = await AsyncStorage.getItem(HANDS_FREE_KEY);
        setHandsFreeEnabledState(raw === "true");
      } catch {
        setHandsFreeEnabledState(false);
      } finally {
        setReady(true);
      }
    };
    load();
  }, []);

  const setHandsFreeEnabled = useCallback(async (next) => {
    const value = Boolean(next);
    setHandsFreeEnabledState(value);
    try {
      await AsyncStorage.setItem(HANDS_FREE_KEY, String(value));
    } catch {
      // ignore persistence errors
    }
  }, []);

  const value = useMemo(
    () => ({
      ready,
      handsFreeEnabled,
      setHandsFreeEnabled,
    }),
    [handsFreeEnabled, ready, setHandsFreeEnabled]
  );

  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>;
}

export function useAgent() {
  const ctx = useContext(AgentContext);
  if (!ctx) {
    throw new Error("useAgent must be used within AgentProvider");
  }
  return ctx;
}

