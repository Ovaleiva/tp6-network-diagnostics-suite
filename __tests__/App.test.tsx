import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import App from '../App';
import { HomeScreen } from '../src/features/home/HomeScreen';
import { ModuleScreen } from '../src/shared/components/ModuleScreen';

jest.useFakeTimers();

let app: ReactTestRenderer.ReactTestRenderer;
beforeEach(async () => {
  await act(async () => {
    app = ReactTestRenderer.create(<App />);
  });
});
afterEach(async () => {
  await act(async () => {
    app.unmount();
    jest.runOnlyPendingTimers();
  });
});

test('inicia en Inicio sin montar servicios ni pantallas de diagnóstico', () => {
  expect(app.root.findAllByType(HomeScreen)).toHaveLength(1);
  expect(app.root.findAllByType(ModuleScreen)).toHaveLength(0);
});

test.each([
  ['Equipos en la red', 'Equipos en la red', 'RF-01'],
  ['Diagnóstico', 'Diagnóstico', 'RF-02 / RF-03'],
  ['Identificar equipo', 'Identificar equipo', 'RF-04'],
  ['Instalación', 'Instalación', 'RF-05'],
  ['Reportes', 'Reportes', 'RF-06'],
  ['Sincronización', 'Sincronización', 'RF-07'],
  ['Historial', 'Historial', 'RF-08'],
])('abre %s y permite volver a Inicio', async (label, title, requirement) => {
  const button = app.root.findAll(
    node =>
      node.props.accessibilityRole === 'button' &&
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  )[0];
  expect(button).toBeDefined();
  await act(async () => {
    button!.props.onPress();
    jest.runAllTimers();
  });
  const module = app.root.findByType(ModuleScreen);
  expect(module.props.title).toBe(title);
  expect(module.props.requirement).toBe(requirement);
  await act(async () => {
    app.root.findByType(HomeScreen).props.navigation.goBack();
    jest.runAllTimers();
  });
  expect(app.root.findAllByType(ModuleScreen)).toHaveLength(0);
});

test('Diagnóstico recibe el identificador del equipo por la ruta', async () => {
  await act(async () => {
    app.root
      .findByType(HomeScreen)
      .props.navigation.navigate('Diagnostics', { deviceId: 'equipo-prueba' });
    jest.runAllTimers();
  });
  expect(app.root.findByType(ModuleScreen).props.emptyMessage).toBe(
    'Equipo seleccionado: equipo-prueba',
  );
});
