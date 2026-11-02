import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/app/navigation/AppNavigator';

// La sincronización corre en segundo plano mientras la app está abierta, sin
// importar qué pantalla se muestre.
function useAutoSync() {
  useEffect(() => {
    let stop: (() => void) | undefined;
    let unmounted = false;
    import('./src/infrastructure/sync/androidSync').then(
      ({ startAutoSync }) => {
        if (!unmounted) stop = startAutoSync();
      },
      () => {
        // Sin sincronización la app sigue funcionando con la base local.
      },
    );
    return () => {
      unmounted = true;
      stop?.();
    };
  }, []);
}

export default function App() {
  useAutoSync();
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <AppNavigator />
    </SafeAreaProvider>
  );
}
