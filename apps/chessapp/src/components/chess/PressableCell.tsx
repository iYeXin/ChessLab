import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';

/** Square/intersection cell with press feedback. */
export function PressableCell({
  size,
  color,
  onPress,
  children,
}: {
  size: number;
  color: string;
  onPress(): void;
  children?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </Pressable>
  );
}
