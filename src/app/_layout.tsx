import '../global.css';

import { CourierPrime_400Regular } from '@expo-google-fonts/courier-prime';
import {
  Lora_400Regular,
  Lora_400Regular_Italic,
  Lora_500Medium,
  Lora_600SemiBold,
} from '@expo-google-fonts/lora';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope';
import { MaterialSymbolsRounded_400Regular } from '@expo-google-fonts/material-symbols-rounded';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';

import { cargarCola, inicializar } from '@/datos/almacen';
import { ProveedorSync } from '@/drive/SyncContext';

SplashScreen.preventAutoHideAsync();

/**
 * Los datos viven en disco, así que no hace falta volver a leerlos cada pocos
 * segundos: se refrescan cuando algo los invalida, no por tiempo.
 */
function crearCliente() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: Infinity, retry: 1, refetchOnWindowFocus: false },
    },
  });
}

let almacenPreparado = false;

/**
 * Prepara el almacén en el primer render y no en un efecto: React ejecuta las
 * limpiezas y los efectos de los hijos ANTES que los del padre, así que
 * `ProveedorSync` arrancaba su primer ciclo con la cola de subida todavía sin
 * cargar y lo pendiente de la sesión anterior se quedaba esperando 60 s o al
 * siguiente regreso a primer plano.
 */
function prepararAlmacen(): void {
  if (almacenPreparado) return;
  almacenPreparado = true;
  inicializar();
  cargarCola();
}

export default function RootLayout() {
  prepararAlmacen();
  const [cliente] = useState(crearCliente);

  const [loaded, error] = useFonts({
    Lora_400Regular,
    Lora_500Medium,
    Lora_600SemiBold,
    Lora_400Regular_Italic,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    CourierPrime_400Regular,
    MaterialSymbolsRounded_400Regular,
  });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <QueryClientProvider client={cliente}>
      <ProveedorSync>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#FBF7F1' },
            animation: 'fade',
            animationDuration: 180,
          }}
        />
      </ProveedorSync>
    </QueryClientProvider>
  );
}
