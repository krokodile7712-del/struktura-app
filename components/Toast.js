import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { fonts, colors } from '../constants/theme';

// ─── Context ─────────────────────────────────────────────────────────────────

const ToastCtx = createContext({ show: () => {} });

export const useToast = () => useContext(ToastCtx);

// ─── Provider — оборачивает всё приложение в App.js ─────────────────────────

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer   = useRef(null);

  const show = useCallback((message, type = 'success', duration = 2400) => {
    if (timer.current) clearTimeout(timer.current);

    setToast({ message, type });

    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(duration),
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => setToast(null));

    timer.current = setTimeout(() => setToast(null), duration + 400);
  }, [opacity]);

  const ICONS = { success: '✓', error: '✕', info: 'ⓘ', warn: '⚠️' };
  const COLORS = {
    success: { bg: 'rgba(61,158,146,0.92)', border: 'rgba(61,158,146,0.6)' },
    error:   { bg: 'rgba(160,16,32,0.92)',  border: 'rgba(160,16,32,0.6)'  },
    info:    { bg: 'rgba(61,95,168,0.92)',  border: 'rgba(61,95,168,0.6)'  },
    warn:    { bg: 'rgba(200,140,0,0.92)',  border: 'rgba(200,140,0,0.6)'  },
  };

  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      {toast && (
        <Animated.View
          style={[
            styles.toast,
            {
              opacity,
              backgroundColor: COLORS[toast.type]?.bg || COLORS.success.bg,
              borderColor:     COLORS[toast.type]?.border || COLORS.success.border,
            },
          ]}
          pointerEvents="none"
        >
          <Text style={styles.icon}>{ICONS[toast.type] || '✓'}</Text>
          <Text style={styles.message}>{toast.message}</Text>
        </Animated.View>
      )}
    </ToastCtx.Provider>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 30,
    borderWidth: 1,
    maxWidth: 420,
    // Тень
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 9999,
  },
  icon: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '700',
  },
  message: {
    fontFamily: fonts.familySemibold,
    fontSize: 14,
    color: '#fff',
    flexShrink: 1,
  },
});
