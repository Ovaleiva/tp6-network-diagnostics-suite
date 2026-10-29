import React from 'react';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeScreen } from '../../features/home/HomeScreen';
import { DevicesScreen } from '../../features/discovery/DevicesScreen';
import { DeviceDetailsScreen } from '../../features/discovery/DeviceDetailsScreen';
import { DiagnosticsScreen } from '../../features/protocols/DiagnosticsScreen';
import { IdentificationScreen } from '../../features/identification/IdentificationScreen';
import { InstallationScreen } from '../../features/evidence/InstallationScreen';
import { ReportsScreen } from '../../features/reporting/ReportsScreen';
import { HistoryScreen } from '../../features/history/HistoryScreen';
import { SyncScreen } from '../../features/sync/SyncScreen';
import { colors } from '../../shared/theme';
import type { RootStackParamList } from './routes';

const Stack = createNativeStackNavigator<RootStackParamList>();
const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    primary: colors.accent,
  },
};

export function AppNavigator() {
  return (
    <NavigationContainer theme={theme}>
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerStyle: { backgroundColor: colors.navy },
          headerTintColor: '#FFFFFF',
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ title: 'Network Diagnostics' }}
        />
        <Stack.Screen
          name="Devices"
          component={DevicesScreen}
          options={{ title: 'Equipos en la red' }}
        />
        <Stack.Screen
          name="DeviceDetails"
          component={DeviceDetailsScreen}
          options={{ title: 'Detalle del equipo' }}
        />
        <Stack.Screen
          name="Diagnostics"
          component={DiagnosticsScreen}
          options={{ title: 'Diagnóstico' }}
        />
        <Stack.Screen
          name="Identification"
          component={IdentificationScreen}
          options={{ title: 'Identificar equipo' }}
        />
        <Stack.Screen
          name="Installation"
          component={InstallationScreen}
          options={{ title: 'Instalación' }}
        />
        <Stack.Screen
          name="Reports"
          component={ReportsScreen}
          options={{ title: 'Reportes' }}
        />
        <Stack.Screen
          name="History"
          component={HistoryScreen}
          options={{ title: 'Historial' }}
        />
        <Stack.Screen
          name="Sync"
          component={SyncScreen}
          options={{ title: 'Sincronización' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
