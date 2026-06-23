import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

const CERT_KEY = 'pulse_cert_install_date';
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
const WARN_THRESHOLD = 22 * 60 * 60 * 1000; // show banner within last 22h of 7 days

export function CertExpiryBanner() {
  const [hoursLeft, setHoursLeft] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const slideAnim = React.useRef(new Animated.Value(-80)).current;

  useEffect(() => {
    (async () => {
      try {
        let dateStr = await AsyncStorage.getItem(CERT_KEY);
        if (!dateStr) {
          dateStr = Date.now().toString();
          await AsyncStorage.setItem(CERT_KEY, dateStr);
        }
        const installDate = parseInt(dateStr, 10);
        const elapsed = Date.now() - installDate;
        const remaining = SEVEN_DAYS - elapsed;
        if (remaining <= WARN_THRESHOLD && remaining > 0) {
          setHoursLeft(Math.ceil(remaining / (60 * 60 * 1000)));
        } else if (remaining <= 0) {
          setHoursLeft(0); // expired
        }
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (hoursLeft !== null && !dismissed) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 9,
      }).start();
    }
  }, [hoursLeft, dismissed]);

  if (hoursLeft === null || dismissed) return null;

  const isExpired = hoursLeft === 0;
  const bgColor = isExpired ? '#7f1d1d' : '#78350f';
  const label = isExpired
    ? 'Cert expired — re-sign now with Sideloadly'
    : `Cert expires in ${hoursLeft}h — re-sign soon`;

  return (
    <Animated.View style={[styles.banner, { backgroundColor: bgColor, transform: [{ translateY: slideAnim }] }]}>
      <Ionicons name="warning-outline" size={16} color="#fbbf24" style={{ marginRight: 6 }} />
      <Text style={styles.text} numberOfLines={1}>{label}</Text>
      <Pressable hitSlop={12} onPress={() => setDismissed(true)} style={styles.close}>
        <Ionicons name="close" size={16} color="rgba(255,255,255,0.7)" />
      </Pressable>
    </Animated.View>
  );
}

// Exported so App can call it to reset the cert date after fresh install
export async function recordCertInstall() {
  await AsyncStorage.setItem(CERT_KEY, Date.now().toString());
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  text: {
    flex: 1,
    color: '#fef3c7',
    fontSize: 12,
    fontWeight: '600',
  },
  close: {
    marginLeft: 8,
    padding: 2,
  },
});
